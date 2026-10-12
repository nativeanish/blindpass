import { createHash, timingSafeEqual } from "node:crypto";
import Fastify, { LogController } from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { PaymentReconciler } from "./reconciliation.js";
import { z, ZodError } from "zod";
import {
  BlindPassError,
  fingerprint,
  b64,
  sha256,
  currentEpoch,
} from "@blindpass/shared";
import {
  MockPaymentWatcher,
  PaymentEventSchema,
  type PaymentWatcher,
} from "@blindpass/zcash";
import { ScannerPaymentWatcher } from "@blindpass/zcash/scanner";
import { RedemptionService } from "@blindpass/server";
import { wwwAuthenticate, keyGen } from "@blindpass/privacy-pass";
import { connectDatabase, type Database } from "./db/connection.js";
import { loadKeys } from "./keys.js";
import { config, assertProductionConfig } from "./config.js";
import { paymentEnvironments } from "./payment-environments.js";
import { InvoiceService } from "./invoices.js";
import { IssuanceService } from "./issuance.js";
import { search, seedSearch } from "../../demo-service/src/search.js";
export async function createApp(
  options: {
    database?: Database;
    watcher?: PaymentWatcher;
    logger?: boolean;
  } = {},
) {
  assertProductionConfig();
  const environments = paymentEnvironments(config);
  const database = options.database ?? connectDatabase();
  const keys = await loadKeys(database);
  let rotation: Promise<void> | undefined;
  const rotateEpoch = () => {
    if (rotation) return rotation;
    if (keys.manifest.epoch === currentEpoch()) return Promise.resolve();
    rotation = loadKeys(database)
      .then((next) => {
        // Redemption retains this array reference while active issuance changes.
        const issuers = keys.issuers;
        issuers.splice(0, issuers.length, ...next.issuers);
        Object.assign(keys, next, { issuers });
      })
      .catch(() => {
        // Readiness fails closed until the missing key/configuration is fixed.
      })
      .finally(() => {
        rotation = undefined;
      });
    return rotation;
  };
  const rotationTimer = setInterval(() => {
    void rotateEpoch();
  }, 5000);
  rotationTimer.unref();
  await seedSearch(database.sql);
  const watcher =
    options.watcher ??
    (config.ZCASH_PAYMENT_MODE === "mock"
      ? new MockPaymentWatcher()
      : new ScannerPaymentWatcher({
          url: process.env.ZCASH_SCANNER_URL ?? "",
          apiKey: process.env.ZCASH_SCANNER_API_KEY ?? "",
          webhookSecret: process.env.ZCASH_WEBHOOK_SECRET ?? "",
          network: config.ZCASH_NETWORK,
        }));
  const invoiceService = new InvoiceService(database, keys, watcher);
  const issuance = new IssuanceService(database, keys);
  const redemption = new RedemptionService(database.sql, keys.issuers);
  const unsubscribe = watcher.subscribe((event) =>
    invoiceService.payment(event),
  );
  // Automatic HTTP logs include paths/capabilities, IPs and queries. Disable them; emit only aggregate error codes.
  const app = Fastify({
    logger: options.logger
      ? {
          level: "info",
          redact: [
            "req",
            "res",
            "authorization",
            "capability",
            "token",
            "requests",
            "responses",
            "viewingKey",
          ],
        }
      : false,
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 32768,
    requestTimeout: 30000,
    connectionTimeout: 35000,
    keepAliveTimeout: 5000,
    forceCloseConnections: "idle",
  });
  await app.register(helmet, { contentSecurityPolicy: false });
  // Aggregate per-process budgets protect expensive operations without tracking IPs.
  await app.register(rateLimit, {
    global: true,
    max: config.RATE_LIMIT_PER_MINUTE,
    timeWindow: 60000,
    keyGenerator: () => "service",
    errorResponseBuilder: () =>
      new BlindPassError(
        "RATE_LIMITED",
        429,
        "The service is busy. Please try again shortly; no credit was spent.",
      ),
  });
  const reconciliation =
    watcher instanceof ScannerPaymentWatcher
      ? new PaymentReconciler(
          database,
          watcher,
          invoiceService,
          config.RECONCILIATION_INTERVAL_MS,
        )
      : undefined;
  app.addHook("onReady", async () => {
    reconciliation?.start();
  });
  app.addHook("onRequest", async (request, reply) => {
    reply
      .header("Cache-Control", "no-store")
      .header("Referrer-Policy", "no-referrer");
    const origin = request.headers.origin;
    if (
      origin &&
      ![
        `https://${config.ISSUER_ORIGIN}`,
        ...(config.BLINDPASS_ENV !== "production"
          ? [`http://${config.ISSUER_ORIGIN}`]
          : []),
      ].includes(origin)
    )
      throw new BlindPassError("INVALID_REQUEST", 403, "Origin not allowed.");
  });
  app.setErrorHandler(async (error, request, reply) => {
    const frameworkStatus = (error as { statusCode?: number }).statusCode;
    const code =
      error instanceof BlindPassError
        ? error.code
        : error instanceof ZodError ||
            (frameworkStatus && frameworkStatus >= 400 && frameworkStatus < 500)
          ? "INVALID_REQUEST"
          : "SERVICE_TEMPORARILY_UNAVAILABLE";
    const status =
      error instanceof BlindPassError
        ? error.status
        : error instanceof ZodError
          ? 400
          : frameworkStatus && frameworkStatus >= 400 && frameworkStatus < 500
            ? frameworkStatus
            : 503;
    if (["INVALID_TOKEN", "TOKEN_ALREADY_SPENT"].includes(code))
      await database.sql`INSERT INTO audit_events(kind,count) VALUES(${code},1) ON CONFLICT(kind) DO UPDATE SET count=audit_events.count+1`.catch(
        () => {},
      );
    if (status === 401 && request.routeOptions.url === "/api/search")
      reply.header("WWW-Authenticate", await wwwAuthenticate(keys.manifest));
    if (status === 503) app.log.error({ code }, "Service operation failed");
    reply.code(status).send({
      error: {
        code,
        message:
          error instanceof BlindPassError
            ? error.message
            : code === "INVALID_REQUEST"
              ? "Check the request format."
              : "The service is temporarily unavailable. A failed local search does not spend your credit.",
      },
    });
  });
  app.get("/api/live", { config: { rateLimit: false } }, async () => ({
    status: "ok",
  }));
  app.get("/api/service", async () => ({
    name: "BlindPass",
    issuer: config.ISSUER_ORIGIN,
    network: config.ZCASH_NETWORK,
    paymentMode: config.ZCASH_PAYMENT_MODE,
    ...environments,
    supportUrl: config.SUPPORT_URL,
    creditExpiresAt: keys.manifest.expiresAt,
    issuanceEndsAt: keys.manifest.issuanceEndsAt,
    fingerprint: await fingerprint(keys.signingPublicKey),
  }));
  app.get(
    "/api/health",
    { config: { rateLimit: false } },
    async (_request, reply) => {
      await database.sql`SELECT 1`;
      const ready = keys.manifest.epoch === currentEpoch();
      if (!ready) reply.code(503);
      return {
        status: ready ? "ok" : "rotation_required",
        reconciliation: reconciliation?.status ?? null,
        mode: config.ZCASH_PAYMENT_MODE,
        environment: config.BLINDPASS_ENV,
        epoch: keys.manifest.epoch,
      };
    },
  );
  app.get(
    "/api/ops/status",
    {
      config: {
        rateLimit: { max: 30, timeWindow: 60000, groupId: "operations" },
      },
    },
    async (request) => {
      const expected = process.env.OPERATOR_API_KEY;
      const supplied = request.headers.authorization?.replace(/^Bearer /, "");
      if (
        !expected ||
        !supplied ||
        !timingSafeEqual(
          createHash("sha256").update(expected).digest(),
          createHash("sha256").update(supplied).digest(),
        )
      )
        throw new BlindPassError(
          "INVALID_REQUEST",
          401,
          "Operator authentication required.",
        );
      const [totals] =
        await database.sql`SELECT (SELECT count(*)::int FROM invoices) AS invoices, (SELECT count(*)::int FROM invoices WHERE confirmed_at IS NOT NULL) AS payments, (SELECT COALESCE(sum(issued_count),0)::int FROM issuance_authorizations) AS issued, (SELECT count(*)::int FROM redeemed_tokens WHERE status='spent') AS redeemed`;
      return {
        totals,
        invoiceStates:
          await database.sql`SELECT status,count(*)::int AS count FROM invoices GROUP BY status ORDER BY status`,
        events:
          await database.sql`SELECT kind,count FROM audit_events ORDER BY kind`,
        epoch: keys.manifest.epoch,
        issuanceEndsAt: keys.manifest.issuanceEndsAt,
        expiresAt: keys.manifest.expiresAt,
        network: config.ZCASH_NETWORK,
        paymentMode: config.ZCASH_PAYMENT_MODE,
        ready: keys.manifest.epoch === currentEpoch(),
        reconciliation: reconciliation?.status ?? null,
        provisionedEpochs: Object.keys(
          JSON.parse(process.env.PRIVACYPASS_ISSUER_KEYS || "{}"),
        ),
        checkedAt: new Date().toISOString(),
      };
    },
  );
  app.get("/api/offers", async () => database.db.query.offers.findMany());
  app.get("/api/privacy-audit", async () => {
    const [row] =
      await database.sql`SELECT count(*)::int AS purchases FROM invoices WHERE issuer_epoch=${keys.manifest.epoch} AND token_class='search-v1' AND confirmed_at IS NOT NULL`;
    return {
      commonClassPurchases: row.purchases,
      distinctPeopleKnown: false,
      epoch: keys.manifest.epoch,
      paymentMode: config.ZCASH_PAYMENT_MODE,
      networkMeasured: false,
    };
  });
  app.get("/.well-known/private-token-issuer-directory", async () => ({
    "issuer-request-uri": "/api/issuance",
    "token-keys": keys.issuers.map((i) => ({
      "token-type": 1,
      "token-key": i.manifest.publicKey,
      "not-before": Math.floor(Date.parse(i.manifest.validFrom) / 1000),
    })),
    ...keys.signedManifest,
  }));
  app.post(
    "/api/invoices",
    {
      config: {
        rateLimit: {
          max: config.PURCHASE_LIMIT_PER_MINUTE,
          timeWindow: 60000,
          groupId: "purchases",
        },
      },
    },
    async (request, reply) => {
      const input = z
        .object({ offerId: z.literal("search-10") })
        .strict()
        .parse(request.body);
      return reply.code(201).send(await invoiceService.create(input.offerId));
    },
  );
  app.get("/api/invoices/:capability", async (request) =>
    invoiceService.get(
      z.object({ capability: z.string().min(40).max(80) }).parse(request.params)
        .capability,
    ),
  );
  app.post("/api/issuance", async (request) => {
    const input = z
      .object({
        capability: z.string().min(40).max(80),
        requests: z.array(z.string().min(60).max(100)).length(10),
        configurationHash: z.string().max(100),
      })
      .strict()
      .parse(request.body);
    return issuance.issue(
      input.capability,
      input.requests,
      input.configurationHash,
    );
  });
  app.get("/api/search", async (request) => {
    const { q } = z
      .object({ q: z.string().trim().min(1).max(240) })
      .strict()
      .parse(request.query);
    return redemption.redeem(request.headers.authorization, (tx) =>
      search(tx, q),
    );
  });
  if (watcher instanceof ScannerPaymentWatcher) {
    await app.register(async (scoped) => {
      scoped.removeContentTypeParser("application/json");
      scoped.addContentTypeParser(
        "application/json",
        { parseAs: "string" },
        (_request, body, done) => done(null, body),
      );
      scoped.post("/webhooks/zcash/payment", async (request) =>
        watcher.webhook(
          request.body as string,
          request.headers["x-blindpass-timestamp"] as string | undefined,
          request.headers["x-blindpass-signature"] as string | undefined,
        ),
      );
    });
  }
  if (
    config.BLINDPASS_ENV !== "production" &&
    watcher instanceof MockPaymentWatcher
  ) {
    app.get("/api/dev/malicious-config/:kind", async (request) => {
      const { kind } = z
        .object({ kind: z.enum(["key", "expiry", "class", "key-id"]) })
        .parse(request.params);
      const changed = { ...keys.manifest };
      if (kind === "key") {
        const key = await keyGen();
        changed.publicKey = b64(key.publicKey);
        changed.activeKeyId = await sha256(key.publicKey);
      }
      if (kind === "expiry")
        changed.expiresAt = new Date(
          Date.parse(changed.expiresAt) - 127000,
        ).toISOString();
      if (kind === "class") changed.tokenClass = "invoice-specific-class";
      if (kind === "key-id") changed.activeKeyId = "invoice-specific-key-id";
      const signed = await keys.sign(changed);
      return {
        manifest: changed,
        signature: signed.signature,
        signingPublicKey: signed.signingPublicKey,
      };
    });
    app.post("/api/dev/pay/:invoiceId", async (request) => {
      const { invoiceId } = z
        .object({ invoiceId: z.string().max(100) })
        .parse(request.params);
      const input = z
        .object({
          confirmations: z.number().int().min(0).default(3),
          reorg: z.boolean().default(false),
        })
        .parse(request.body ?? {});
      const [row] =
        await database.sql`SELECT zec_amount FROM invoices WHERE id=${invoiceId}`;
      if (!row) throw new BlindPassError("NOT_FOUND", 404);
      await watcher.emit(
        PaymentEventSchema.parse({
          eventId: `mock_${invoiceId}_${input.confirmations}_${input.reorg}`,
          invoiceId,
          txid: `SIMULATED_TX_${invoiceId}`,
          amount: row.zec_amount,
          blockHeight: 1,
          confirmations: input.confirmations,
          reorg: input.reorg,
        }),
      );
      return { simulated: true, label: "SIMULATED PAYMENT EVENT" };
    });
    app.get("/api/admin/stats", async () => {
      const [counts] =
        await database.sql`SELECT (SELECT count(*)::int FROM invoices) AS invoices,(SELECT count(*)::int FROM invoices WHERE confirmed_at IS NOT NULL) AS payments,(SELECT COALESCE(sum(issued_count),0)::int FROM issuance_authorizations) AS issued,(SELECT count(*)::int FROM redeemed_tokens WHERE status='spent') AS redeemed`;
      return {
        ...counts,
        epoch: keys.manifest.epoch,
        keyId: keys.manifest.activeKeyId,
        fingerprint: await fingerprint(keys.signingPublicKey),
        events: await database.sql`SELECT kind,count FROM audit_events`,
        paymentsDataset:
          await database.sql`SELECT id,status,credit_count,issuer_epoch FROM invoices ORDER BY created_at DESC LIMIT 20`,
        redemptionsDataset:
          await database.sql`SELECT left(token_hash,12) AS token_hash,issuer_epoch,status FROM redeemed_tokens ORDER BY reserved_at DESC LIMIT 20`,
      };
    });
  }
  app.addHook("onClose", async () => {
    unsubscribe();
    clearInterval(rotationTimer);
    await rotation;
    await reconciliation?.stop();
    if (!options.database) await database.sql.end();
  });
  return {
    app,
    database,
    keys,
    watcher,
    invoiceService,
    issuance,
    redemption,
    rotateEpoch,
  };
}
