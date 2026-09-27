# 8 Watchers, Webhooks, and Reorg Resistance

> **Part III — Payments · Build checkpoint 2 of 2**

*In this chapter*
- Build the authenticated scanner adapter with HMAC-SHA-256 webhook verification
- Preserve raw request bytes in Fastify for exact-byte authentication
- Drive invoice payment states transactionally with row locking
- Handle blockchain reorganizations that revoke pre-issuance authorization

You now have a watcher port and an invoice schema. This chapter implements the
untrusted scanner adapter, plugs raw-body authentication into Fastify, and then
moves invoice state under a row lock. Build and test each boundary separately
before composing them.

Payment webhooks cross two trust boundaries: an external scanner asserts chain
state, and an HTTP parser wants to transform the request before authentication.
BlindPass authenticates the exact received bytes, deduplicates events, and
allows pre-issuance confirmation state to move backward on a reorganization.

## 8.1 Step 1 — Implement the scanner adapter

```typescript
// File: packages/zcash/src/scanner.ts
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { BlindPassError } from "@blindpass/shared";
import {
  PaymentEventSchema,
  paymentUri,
  type PaymentEvent,
  type PaymentWatcher,
} from "./index.js";

const Destination = z
  .object({
    invoiceId: z.string(),
    address: z.string().min(80).max(600),
    network: z.enum(["testnet", "mainnet"]),
    receiverTypes: z.array(z.string()),
    diversified: z.literal(true),
    validated: z.literal(true),
  })
  .strict();

// This is BlindPass's documented scanner bridge contract, not a fabricated CipherPay API.
export class ScannerPaymentWatcher implements PaymentWatcher {
  private listeners = new Set<(event: PaymentEvent) => Promise<void>>();

  constructor(
    private config: {
      url: string;
      apiKey: string;
      webhookSecret: string;
      network: "testnet" | "mainnet";
    },
    private transport: typeof fetch = fetch,
  ) {
    const url = new URL(config.url);
    if (
      url.protocol !== "https:" &&
      !["localhost", "127.0.0.1", "scanner"].includes(url.hostname)
    ) // <1>
      throw new Error(
        "Scanner bridge must use HTTPS outside a trusted local network.",
      );

    if (config.webhookSecret.length < 32) // <2>
      throw new Error(
        "Scanner webhook secret requires at least 32 characters.",
      );
  }

  private async request(path: string, init: RequestInit = {}) {
    const response = await this.transport(new URL(path, this.config.url), {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
    });
    if (!response.ok)
      throw new BlindPassError(
        "SERVICE_TEMPORARILY_UNAVAILABLE",
        503,
        "Payment scanner is unavailable.",
      );
    return response.json() as Promise<unknown>;
  }

  async createInvoice(input: { invoiceId: string; amount: string }) {
    const raw = await this.request("/v1/invoices", {
      method: "POST",
      body: JSON.stringify({
        ...input,
        network: this.config.network,
        receiver: "orchard",
        memo: "",
      }),
    });

    const destination = Destination.parse(raw);
    if (
      destination.invoiceId !== input.invoiceId ||
      destination.network !== this.config.network ||
      !destination.receiverTypes.includes("orchard") || // <6>
      destination.receiverTypes.some((r) => r === "p2pkh" || r === "p2sh") // <7>
    )
      throw new BlindPassError(
        "ISSUER_POLICY_VIOLATION",
        502,
        "Scanner must return a validated shielded Unified Address with an Orchard receiver.",
      );

    return {
      address: destination.address,
      paymentUri: paymentUri(destination.address, input.amount),
      simulated: false,
    };
  }
```

> **<1>** HTTPS validation for scanner URL.
>
> **<2>** Webhook secret length minimum.
>
> **<6>** Orchard receiver enforcement.
>
> **<7>** Reject transparent p2pkh/p2sh receivers.

> **▶ Try It Out**
> ```bash
> pnpm build:zcash
> ```
> The package should build without type errors.

```typescript
// File: packages/zcash/src/scanner.ts
  async getInvoice(invoiceId: string) {
    const raw = await this.request(
      `/v1/invoices/${encodeURIComponent(invoiceId)}/payment`,
    );
    if (raw === null) return null;

    const event = PaymentEventSchema.parse(raw);
    if (event.invoiceId !== invoiceId)
      throw new BlindPassError("INVALID_REQUEST");
    return event;
  }

  subscribe(listener: (event: PaymentEvent) => Promise<void>) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async webhook(
    raw: string,
    timestamp: string | undefined,
    signature: string | undefined,
  ) {
    if (
      !timestamp ||
      !/^\d{10}$/.test(timestamp) ||
      Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 || // <5>
      !signature ||
      !/^[a-f0-9]{64}$/.test(signature)
    )
      throw new BlindPassError(
        "INVALID_REQUEST",
        401,
        "Invalid scanner webhook authentication.",
      );

    const expected = createHmac("sha256", this.config.webhookSecret)
      .update(`${timestamp}.${raw}`) // <3>
      .digest();

    if (!timingSafeEqual(expected, Buffer.from(signature, "hex"))) // <4>
      throw new BlindPassError(
        "INVALID_REQUEST",
        401,
        "Invalid scanner webhook authentication.",
      );

    const event = PaymentEventSchema.parse(JSON.parse(raw));
    for (const listener of this.listeners) await listener(event);

    return { accepted: true };
  }
}
```

> **<5>** 5-minute freshness window limits replay.
>
> **<3>** HMAC = SHA-256(secret, timestamp + '.' + rawBody).
>
> **<4>** timingSafeEqual for constant-time comparison.

> **🔒 SECURITY NOTE: Timing leaks in HMAC comparison**
>
> Timing leaks in HMAC comparison — use crypto.timingSafeEqual(). A short-circuit === comparison leaks prefix length through response timing, allowing byte-by-byte tag forgery.

Construct `ScannerPaymentWatcher` in four passes. Validate constructor policy
first: HTTPS outside explicit local hosts and a sufficiently long webhook
secret. Add the outbound `request` helper with redirect and timeout limits.
Implement `createInvoice` and reject transparent or wrong-network receivers.
Finally add `webhook`, authenticating raw bytes before JSON parsing or listener
dispatch.

The bridge signs `timestamp + "." + rawBody` with HMAC-SHA-256. Verification
rejects missing or malformed headers, timestamps more than five minutes away,
and non-hex signatures. Both digest buffers are known to be 32 bytes before
`timingSafeEqual`, avoiding its unequal-length exception and a length oracle.

The timestamp window limits captured-request replay. Database event IDs provide
durable idempotency. In a multi-scanner deployment, synchronize clocks and
define a globally unique event-id namespace. HMAC does not itself prevent the
same valid request from being delivered twice.

Parsing JSON before verification is wrong because equivalent JSON documents
can have different byte sequences. Fastify's scoped content-type parser keeps
the body as a string only for the webhook route. The full composition root shows
the parser, security headers, error mapping, and privacy-safe logging policy.

## 8.2 Step 2 — Preserve raw bytes in Fastify

```typescript
// File: apps/api/src/app.ts
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
        } // <4>
      : false,
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 32768,
  });
  
  await app.register(helmet, { contentSecurityPolicy: false }); // <2>

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
    ) // <3>
      throw new BlindPassError("INVALID_REQUEST", 403, "Origin not allowed.");
  });

  app.setErrorHandler(async (error, request, reply) => {
    // ...
    if (status === 401)
      reply.header("WWW-Authenticate", await wwwAuthenticate(keys.manifest)); // <5>
    // ...
  });

  if (watcher instanceof ScannerPaymentWatcher) {
    await app.register(async (scoped) => {
      scoped.removeContentTypeParser("application/json");
      scoped.addContentTypeParser(
        "application/json",
        { parseAs: "string" },
        (_request, body, done) => done(null, body),
      ); // <1>

      scoped.post("/webhooks/zcash/payment", async (request) =>
        watcher.webhook(
          request.body as string,
          request.headers["x-blindpass-timestamp"] as string | undefined,
          request.headers["x-blindpass-signature"] as string | undefined,
        ),
      );
    });
  }
```

> **<4>** Privacy-safe logging: no tokens, capabilities, queries, IPs.
>
> **<2>** Helmet security headers.
>
> **<3>** CORS origin validation.
>
> **<5>** WWW-Authenticate on 401 errors.
>
> **<1>** Scoped content-type parser for webhook route (raw body preservation).

> **⚠ PITFALL: Parsing JSON before HMAC verification**
>
> Parsing JSON before HMAC verification is wrong — equivalent JSON documents have different byte sequences. Authenticate the exact received bytes first.

> **▶ Try It Out**
> ```bash
> pnpm test apps/api
> ```
> Test the app initialization to verify plugins are loaded correctly.

The parser is registered inside a Fastify encapsulation scope. Other JSON
routes keep normal parsing and Zod validation. `bodyLimit` caps memory before
HMAC processing. The route passes raw text and header values directly to the
watcher.

## 8.3 Step 3 — Drive invoice state transactionally

```typescript
// File: apps/api/src/invoices.ts
import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  BlindPassError,
  sha256,
  canonical,
  type Invoice,
  type InvoiceDocument,
  type SignedDocument,
  type InvoiceStatus,
} from "@blindpass/shared";
import {
  zatoshis,
  type PaymentWatcher,
  type PaymentEvent,
} from "@blindpass/zcash";
import type { Database } from "./db/connection.js";
import { invoices, offers } from "./db/schema.js";
import type { Keys } from "./keys.js";
import { config } from "./config.js";

// ... [InvoiceService constructor, public, create, get omitted] ...

  async payment(event: PaymentEvent) {
    await this.database.sql.begin(async (tx) => {
      const [row] =
        await tx`SELECT * FROM invoices WHERE id=${event.invoiceId} FOR UPDATE`; // <1>
      if (!row) throw new BlindPassError("NOT_FOUND", 404);

      if (zatoshis(event.amount) < zatoshis(row.zec_amount)) // <2>
        throw new BlindPassError(
          "INVALID_REQUEST",
          400,
          "Payment amount is insufficient.",
        );

      const inserted =
        await tx`INSERT INTO invoice_payment_events(id,invoice_id,txid,amount,block_height,confirmations,reorg) VALUES(${event.eventId},${event.invoiceId},${event.txid},${event.amount},${event.blockHeight},${event.confirmations},${event.reorg}) ON CONFLICT DO NOTHING RETURNING id`; // <3>
      if (!inserted.length) return;

      if (event.reorg) {
        if (row.status === "CREDITS_READY") {
          await tx`INSERT INTO audit_events(kind,count) VALUES('post_issuance_reorg',1) ON CONFLICT(kind) DO UPDATE SET count=audit_events.count+1`; // <6>
          return;
        }
        await tx`UPDATE invoices SET status='PAYMENT_REORGED',confirmed_at=NULL WHERE id=${event.invoiceId}`; // <5>
        await tx`DELETE FROM issuance_authorizations WHERE invoice_id=${event.invoiceId} AND status='authorized'`;
        return;
      }

      if (row.status === "CREDITS_READY" || row.status === "PAYMENT_CONFIRMED")
        return;

      if (new Date(row.expires_at).getTime() < Date.now()) {
        await tx`UPDATE invoices SET status='EXPIRED' WHERE id=${event.invoiceId}`;
        return;
      }

      const state =
        event.confirmations >= config.ZCASH_CONFIRMATIONS
          ? "PAYMENT_CONFIRMED" // <4>
          : event.confirmations > 0
            ? "WAITING_FOR_CONFIRMATION"
            : "PAYMENT_DETECTED";

      await tx`UPDATE invoices SET status=${state},payment_txid=${event.txid},detected_at=COALESCE(detected_at,now()),confirmed_at=CASE WHEN ${state}='PAYMENT_CONFIRMED' THEN now() ELSE NULL END WHERE id=${event.invoiceId}`;
      if (state === "PAYMENT_CONFIRMED")
        await tx`INSERT INTO issuance_authorizations(invoice_id,status) VALUES(${event.invoiceId},'authorized') ON CONFLICT(invoice_id) DO NOTHING`;
    });
  }
}
```

> **<1>** Row lock on invoice.
>
> **<2>** Exact zatoshi comparison for underpayment rejection.
>
> **<3>** Event deduplication via ON CONFLICT DO NOTHING.
>
> **<6>** Post-issuance reorg: audit event, cannot revoke anonymous tokens.
>
> **<5>** Reorg handling: mark PAYMENT_REORGED, delete unused authorization.
>
> **<4>** Forward state transitions by confirmation count.

> **⚠ PITFALL: Zero-confirmation events can disappear**
>
> Zero-confirmation events can disappear in a reorganization — treat scanner input as an authenticated, replayable, reversible event stream, not a final callback.

> **▶ Try It Out**
> ```bash
> pnpm run test:invoices
> ```
> Run the invoice tests to see the state transitions.

`InvoiceService.payment` starts by locking the invoice row. It converts both
amounts to zatoshis and rejects an underpayment. It inserts the event ID with
`ON CONFLICT DO NOTHING`; a duplicate returns without applying state twice.

For a forward event, confirmation count selects `PAYMENT_DETECTED`,
`WAITING_FOR_CONFIRMATION`, or `PAYMENT_CONFIRMED`. Only the confirmed state
creates an issuance authorization. For a reorg before issuance, the method
marks the invoice `PAYMENT_REORGED` and deletes an unused authorization in the
same transaction.

```
PAYMENT_DETECTED ───> WAITING_FOR_CONFIRMATION ───> PAYMENT_CONFIRMED
       │                        │                         │
       │ reorg                  │ reorg                   │ reorg (pre-issuance)
       ▼                        ▼                         ▼
   PAYMENT_REORGED         PAYMENT_REORGED          PAYMENT_REORGED

                    PAYMENT_CONFIRMED ──────> CREDITS_READY
                                         (one issuance transcript)

   CREDITS_READY + post-issuance reorg ──> audit event (merchant risk)
```

After issuance, the merchant cannot revoke individual anonymous tokens without
adding a linkage or revocation tag. A post-issuance reorg is recorded as an
aggregate audit event and becomes merchant risk. Choose confirmation depth and
invoice value accordingly.

Write the transition handler in this order: lock invoice, compare exact amount,
deduplicate event, handle reorg, reject terminal or expired state, derive the
new confirmation state, update the invoice, and create authorization only for
the confirmed state. Putting deduplication after updates would apply a replay
twice; putting authorization outside the transaction would create a crash gap.

## 8.4 Step 4 — Test byte identity and receiver policy

```typescript
// File: tests/scanner.test.ts
import { it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { ScannerPaymentWatcher } from "../packages/zcash/src/scanner.js";
import { paymentUri, zatoshis } from "../packages/zcash/src/index.js";

const secret = "published-test-webhook-secret-at-least-32-characters";
const fixture = {
  eventId: "fixture-event-1",
  invoiceId: "inv_fixture",
  txid: "fixture-tx-id",
  amount: "0.01",
  blockHeight: 123,
  confirmations: 3,
  reorg: false,
};

it("authenticates exact webhook bytes and rejects bad signatures and stale timestamps", async () => {
  const watcher = new ScannerPaymentWatcher({
    url: "http://localhost:9999",
    apiKey: "test-only",
    webhookSecret: secret,
    network: "testnet",
  });

  let calls = 0;
  watcher.subscribe(async () => {
    calls++;
  });

  const raw = JSON.stringify(fixture);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${raw}`)
    .digest("hex");

  await expect(watcher.webhook(raw, timestamp, signature)).resolves.toEqual({
    accepted: true,
  });
  expect(calls).toBe(1);

  await expect(
    watcher.webhook(raw + " ", timestamp, signature),
  ).rejects.toMatchObject({ code: "INVALID_REQUEST" });

  await expect(
    watcher.webhook(raw, "1000000000", signature),
  ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
});

it("requires scanner validation, Orchard, a matching network, and diversified addresses", async () => {
  const transport = (async () =>
    new Response(
      JSON.stringify({
        invoiceId: "inv_fixture",
        address: "test-fixture-address-not-for-payment".repeat(4),
        network: "testnet",
        receiverTypes: ["p2pkh"],
        diversified: true,
        validated: true,
      }),
    )) as typeof fetch;

  const watcher = new ScannerPaymentWatcher(
    {
      url: "http://localhost:9999",
      apiKey: "test-only",
      webhookSecret: secret,
      network: "testnet",
    },
    transport,
  );

  await expect(
    watcher.createInvoice({ invoiceId: "inv_fixture", amount: "0.01" }),
  ).rejects.toMatchObject({ code: "ISSUER_POLICY_VIOLATION" });
});

it("uses fixed decimal amounts with no memo or amount identifiers", () => {
  expect(zatoshis("0.01")).toBe(1000000n);
  expect(zatoshis("0.00000001")).toBe(1n);
  expect(() => zatoshis("0.000000001")).toThrow();
  expect(paymentUri("fixture", "0.01")).toBe("zcash:fixture?amount=0.01");
});
```

Appending a single space keeps the JSON value valid but changes the signed
bytes, so verification fails. The stale timestamp case fails before dispatch.
The fake scanner response deliberately contains a transparent receiver and is
rejected even though it claims `validated: true`.

Run payment boundary and state-machine tests:

> **▶ Try It Out**
> ```bash
> pnpm exec vitest run tests/scanner.test.ts tests/integration.test.ts
> ```
> Test passes verifying scanner tests.

### Operational pitfalls

Configure the reverse proxy to preserve the body and signature headers. Do not
log raw webhook bodies: transaction IDs and addresses are payment metadata.
Rotate webhook secrets with an overlap protocol that identifies which secret
signed an event without accepting arbitrary algorithms. Rate-limit before
expensive JSON processing, but do not key permanent customer state by source
IP. Treat scanner timeouts as unknown state and poll `getInvoice`; do not mark a
payment absent merely because a webhook was delayed.

### Build checkpoint

The payment pipeline now accepts exact, authenticated scanner bytes and maps
them through an idempotent PostgreSQL state machine. Reorganizations revoke
unused authorization while preserving the unlinkability of credentials already
issued.

Part IV replaces in-memory clients with durable CLI and browser custody. No
client will receive a token until this payment state machine reaches confirmed.
