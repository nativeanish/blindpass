# 13 Operational Security & Threat Realities

> **Part V — Assurance · Build checkpoint 2 of 2**

*In this chapter*
- Validate production configuration before the server listens
- Containerize API and web targets as non-root processes
- Make logging a privacy control that matches the threat model
- Plan key rotation and incident response procedures
- Run the release checklist gate

This final chapter packages the exact system you tested. You will make startup
reject incomplete production configuration, build non-root images, align logs
with the privacy model, and write the release gate operators must run before
accepting value.

Production is where clean protocol boundaries meet secret rotation, reverse
proxies, backups, timeouts, logs, and incident response. BlindPass fails startup
when production secrets are absent, disables mock payments and development
routes, and runs application containers as a non-root user. Those are starting
controls, not a complete deployment.

## 13.1 Step 1 — Validate configuration before listening

```typescript
// File: apps/api/src/config.ts
import "dotenv/config";
import { z } from "zod";

const Config = z.object({
  BLINDPASS_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_PORT: z.coerce.number().default(3001),
  ISSUER_ORIGIN: z.string().default("localhost:3000"),
  ZCASH_PAYMENT_MODE: z.enum(["mock", "scanner"]).default("mock"),
  ZCASH_NETWORK: z.enum(["testnet", "mainnet"]).default("testnet"),
  ZCASH_CONFIRMATIONS: z.coerce.number().int().min(1).default(3),
});
export const config = Config.parse(process.env);

export function assertProductionConfig() { // <1>
  if (config.BLINDPASS_ENV === "production") {
    for (const key of [ // <5>
      "DATABASE_URL",
      "MERCHANT_CONFIG_PRIVATE_KEY",
      "MERCHANT_CONFIG_PUBLIC_KEY",
      "PRIVACYPASS_ISSUER_SECRET",
      "PRIVACYPASS_ISSUER_EPOCH",
      "ZCASH_SCANNER_URL",
      "ZCASH_SCANNER_API_KEY",
      "ZCASH_WEBHOOK_SECRET",
    ])
      if (!process.env[key]) throw new Error(`Production requires ${key}`);
      
    if (config.ZCASH_PAYMENT_MODE === "mock") // <2>
      throw new Error("Production cannot simulate payments.");
      
    if ( // <3>
      !process.env.ISSUER_ORIGIN ||
      config.ISSUER_ORIGIN.includes("localhost")
    )
      throw new Error("Set the production issuer hostname.");
      
    if ( // <4>
      config.ZCASH_NETWORK === "mainnet" &&
      process.env.BLINDPASS_ALLOW_MAINNET !== "true"
    )
      throw new Error(
        "Mainnet requires deliberate BLINDPASS_ALLOW_MAINNET=true configuration.",
      );
  }
}
```

> **<1>** Production guard: require all secrets present.
>
> **<2>** Reject mock payments in production.
>
> **<3>** Reject localhost issuer names.
>
> **<4>** BLINDPASS_ALLOW_MAINNET tripwire.
>
> **<5>** Database pool, Ed25519, VOPRF, scanner, webhook secrets.

> **▶ Try It Out**
> ```bash
> NODE_ENV=production pnpm start:api
> ```
> Expected output: Startup fails complaining about missing required secrets for production.

The production guard requires database, Ed25519, VOPRF, scanner, and webhook
secrets. It rejects mock payments, localhost issuer names, and accidental
mainnet activation. `BLINDPASS_ALLOW_MAINNET=true` is a deliberate tripwire; it
does not certify that the scanner or keys are safe for funds.

The database pool and process entry point are small enough to audit in full.

```typescript
// File: apps/api/src/db/connection.ts
import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";

export function connectDatabase(
  url = process.env.DATABASE_URL ??
    "postgres://blindpass:blindpass-local-only@localhost:5432/blindpass",
  schemaName = "public", // <1>
) {
  const sql = postgres(url, {
    max: 25,
    idle_timeout: 20,
    onnotice: () => {},
    connection: { search_path: schemaName },
  });
  return { sql, db: drizzle(sql, { schema }) };
}
export type Database = ReturnType<typeof connectDatabase>;
```

> **<1>** Configure database pool with schemas and timeouts.

> **▶ Try It Out**
> ```bash
> pnpm test:db
> ```
> Expected output: Successful connection to the local database.

```typescript
// File: apps/api/src/main.ts
import "dotenv/config"; // <1>
import { createApp } from "./app.js";

const { app } = await createApp({ logger: true }); // <2> <3> <4>

await app.listen({ // <5>
  port: Number(process.env.API_PORT ?? 3001),
  host: "0.0.0.0",
});

console.log(
  "BlindPass API ready. Payment mode:",
  process.env.ZCASH_PAYMENT_MODE ?? "mock",
);

for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => { // <6>
    await app.close();
    process.exit(0);
  });
```

> **<1>** Parse environment first.
>
> **<2>** Assert production requirements before connecting.
>
> **<3>** Connect dependencies.
>
> **<4>** Create Fastify app.
>
> **<5>** Listen only after key and database validation.
>
> **<6>** Graceful shutdown on SIGTERM/SIGINT.

> **▶ Try It Out**
> ```bash
> pnpm start:api
> ```
> Expected output: Fastify server listens on port 3001 and awaits connections.

> **⚠ PITFALL: Do not start a Fastify listener before key and database validation — orchestration may route traffic to a process that can only fail requests**
>
> Make sure `createApp` handles key material assertions and database connectivity before the final `app.listen()` statement.

Build startup as a straight line: parse environment, assert production
requirements, connect dependencies, create the Fastify app, listen, and install
signal handlers. Avoid starting a listener before key and database validation;
otherwise an orchestrator may route traffic to a process that can only fail
requests.

In production, set PostgreSQL `statement_timeout`, `lock_timeout`, TLS, least
privilege, connection limits, and backup encryption explicitly. The local
defaults optimize the lab. Graceful shutdown stops accepting connections and
closes Fastify; orchestration must allow enough termination time for in-flight
transactions to finish or roll back.

## 13.2 Step 2 — Containerize the same boundaries

```yaml
// File: docker-compose.yml
services:
  postgres: # <1>
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: blindpass
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-blindpass-local-only}
      POSTGRES_DB: blindpass
    ports: ["127.0.0.1:${POSTGRES_PORT:-5432}:5432"] # <2>
    volumes: ["postgres_data:/var/lib/postgresql/data"] # <3>
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U blindpass"]
      interval: 3s
      timeout: 3s
      retries: 20
  api:
    build:
      context: .
      dockerfile: infra/Dockerfile
      target: api
    environment:
      DATABASE_URL: postgres://blindpass:${POSTGRES_PASSWORD:-blindpass-local-only}@postgres:5432/blindpass
      BLINDPASS_ENV: development
      ZCASH_PAYMENT_MODE: mock
      ISSUER_ORIGIN: localhost:3000
      BLINDPASS_SECRETS_DIR: /app/.secrets
      DOTENV_CONFIG_QUIET: "true"
    ports: ["127.0.0.1:3001:3001"] # <2>
    volumes: ["issuer_secrets:/app/.secrets"]
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 5s
      timeout: 5s
      retries: 30
  web:
    build:
      context: .
      dockerfile: infra/Dockerfile
      target: web
    environment:
      API_INTERNAL_URL: http://api:3001
      NEXT_TELEMETRY_DISABLED: "1"
    ports: ["127.0.0.1:3000:3000"] # <2>
    depends_on:
      api:
        condition: service_healthy
  tor: # <4>
    profiles: ["tor"]
    build:
      context: infra/tor
    ports: ["127.0.0.1:9050:9050"]
volumes:
  postgres_data: # <3>
  issuer_secrets:
```

> **<1>** Postgres with health check.
>
> **<2>** Loopback-bound public ports.
>
> **<3>** Persistent volume for database.
>
> **<4>** Tor as opt-in profile.

> **▶ Try It Out**
> ```bash
> docker-compose up
> ```
> Expected output: API and web servers spin up, database initializes, Tor node boots when requested via profile flag.

```dockerfile
// File: infra/Dockerfile
FROM node:24-bookworm-slim AS base # <3>
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@9.10.0 --activate # <1>
RUN mkdir -p /app && chown node:node /app # <2>
WORKDIR /app
COPY --chown=node:node . .
USER node
RUN pnpm install --frozen-lockfile
RUN mkdir -p /app/.secrets

FROM base AS api
USER node
EXPOSE 3001
CMD ["sh", "-c", "pnpm db:migrate && exec pnpm start:api"] # <4>

FROM base AS web
ENV API_INTERNAL_URL=http://api:3001
RUN pnpm build # <5>
USER node
EXPOSE 3000
CMD ["pnpm", "--filter", "@blindpass/web", "start"]
```

> **<1>** Pinned pnpm version.
>
> **<2>** Non-root node user.
>
> **<3>** Multi-stage build.
>
> **<4>** API target runs migrations before exec.
>
> **<5>** Web target does production Next.js build.

> **▶ Try It Out**
> ```bash
> docker build -t blindpass-api --target api -f infra/Dockerfile .
> ```
> Expected output: Docker image builds correctly up to the `api` target utilizing the non-root user.

The Compose file binds public lab ports to loopback, persists PostgreSQL and
development issuer secrets, and makes Tor opt-in through a profile. The image
uses a pinned pnpm version and a non-root Node user. The default database
password and mock payment mode make this a development composition, never a
production manifest.

Build the image in two application targets from one dependency layer. The API
target runs migrations before `exec` replaces the shell with the server. The
web target performs a production Next.js build during image creation. Run both
as the `node` user so filesystem mistakes do not become root writes.

For production, use immutable image digests, separate API and web identities,
read-only root filesystems where possible, secret mounts rather than image
layers, network policy around PostgreSQL and the scanner, TLS at every remote
hop, health/readiness separation, and tested encrypted backups. Keep VOPRF and
Ed25519 secrets out of ordinary database snapshots unless the backup design
explicitly protects them.

## 13.3 Step 3 — Make logging a privacy control

Fastify request logging is disabled because default logs include method, path,
IP, and timing; invoice capabilities can appear in paths. Application errors log
aggregate codes, not headers, queries, tokens, addresses, or scanner bodies.
Apply the same policy to ingress, CDN, WAF, APM, database statement logs, error
reporters, and support tooling. A privacy-safe app behind a verbose proxy is a
verbose system.

> **⚠ PITFALL: A privacy-safe application behind a verbose reverse proxy is a verbose system — apply the same log redaction to ingress, CDN, WAF, APM, and database statement logs**
>
> Ensure that all intermediaries, proxies, and observability platforms follow the same strict data redaction rules as your primary application.

Prefer metrics such as total issuance failures by code and queue latency. Avoid
high-cardinality labels containing token hashes, invoice IDs, IPs, or query
text. Define retention before collecting data. Restrict debug routes at route
registration, as the production test verifies.

```typescript
// File: tests/production.test.ts
import { it, expect } from "vitest";
import { config, assertProductionConfig } from "../apps/api/src/config.js";
import { createApp } from "../apps/api/src/app.js";
import { keyGen } from "../packages/privacy-pass/src/index.js";
import { b64, currentEpoch } from "../packages/shared/src/index.js";
import { MockPaymentWatcher } from "../packages/zcash/src/index.js";
import { testDatabase } from "./database.js";

it("requires production secrets, forbids mock payments and omits debug routes", async () => {
  const originalConfig = { ...config };
  const envKeys = [
    "MERCHANT_CONFIG_PRIVATE_KEY",
    "MERCHANT_CONFIG_PUBLIC_KEY",
    "PRIVACYPASS_ISSUER_SECRET",
    "PRIVACYPASS_ISSUER_EPOCH",
    "ZCASH_SCANNER_URL",
    "ZCASH_SCANNER_API_KEY",
    "ZCASH_WEBHOOK_SECRET",
    "ISSUER_ORIGIN",
  ];
  const originalEnv = Object.fromEntries(
    envKeys.map((k) => [k, process.env[k]]),
  );
  let database: Awaited<ReturnType<typeof testDatabase>> | undefined;
  let runtime: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    config.BLINDPASS_ENV = "production";
    delete process.env.MERCHANT_CONFIG_PRIVATE_KEY;
    expect(assertProductionConfig).toThrow("MERCHANT_CONFIG_PRIVATE_KEY"); // <1>
    const signing = await crypto.subtle.generateKey("Ed25519", true, [
      "sign",
      "verify",
    ]);
    Object.assign(process.env, {
      MERCHANT_CONFIG_PRIVATE_KEY: b64(
        new Uint8Array(
          await crypto.subtle.exportKey("pkcs8", signing.privateKey),
        ),
      ),
      MERCHANT_CONFIG_PUBLIC_KEY: b64(
        new Uint8Array(await crypto.subtle.exportKey("raw", signing.publicKey)),
      ),
      PRIVACYPASS_ISSUER_SECRET: b64((await keyGen()).privateKey),
      PRIVACYPASS_ISSUER_EPOCH: currentEpoch(),
      ZCASH_SCANNER_URL: "https://scanner.example",
      ZCASH_SCANNER_API_KEY: "test-only",
      ZCASH_WEBHOOK_SECRET: "test-only",
      ISSUER_ORIGIN: "search.example",
    });
    config.ISSUER_ORIGIN = "search.example";
    config.ZCASH_PAYMENT_MODE = "mock";
    expect(assertProductionConfig).toThrow("cannot simulate");
    config.ZCASH_PAYMENT_MODE = "scanner";
    database = await testDatabase();
    // A dependency-injected watcher prevents external network access in this route-registration test.
    runtime = await createApp({ database, watcher: new MockPaymentWatcher() });
    expect(
      (
        await runtime.app.inject({
          url: "/api/offers",
          headers: { origin: "http://localhost:3000" },
        })
      ).statusCode,
    ).toBe(403);
    for (const url of ["/api/admin/stats", "/api/dev/malicious-config/key"]) {
      expect((await runtime.app.inject(url)).statusCode).toBe(404);
    }
    expect(
      (
        await runtime.app.inject({
          method: "POST",
          url: "/api/dev/pay/00000000-0000-4000-8000-000000000000",
          payload: {},
        })
      ).statusCode,
    ).toBe(404);
  } finally {
    await runtime?.app.close();
    await database?.cleanup();
    Object.assign(config, originalConfig);
    for (const key of envKeys) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  }
});
```

> **<1>** Validates that missing keys trigger failures rather than incomplete startup.

> **▶ Try It Out**
> ```bash
> pnpm test tests/production.test.ts
> ```
> Expected output: Test passes indicating dev routes and incomplete configurations are barred in production.

## 13.4 Step 4 — Plan key rotation and incidents

Back up the stable Ed25519 identity and VOPRF keys still needed for grace-period
verification. Test restoration before rotation day. Publish and monitor one
manifest hash per epoch.

> **🔒 SECURITY NOTE: VOPRF key leak — attacker can mint and verify tokens for that epoch. Rotate the cohort and assess already-issued credit risk.**
>
> A compromised VOPRF key effectively grants unlimited access to mint valid passes. Identify when the leak occurred and cycle out the epoch key material urgently.

If the signing key leaks, configuration authenticity is lost and clients need a
new trust anchor through an independent channel.

> **🔒 SECURITY NOTE: Secret zeroization in Node.js is best effort — overwrite owned Buffers when practical, disable core dumps for key-bearing processes, minimize heap snapshots**
>
> V8 does not guarantee immediate zeroization of memory. Taking proactive measures with Buffers and restricting memory dumps helps, but absolute guarantees are difficult to assert in managed languages.

Secret “zeroization” in Node.js is best effort. Overwrite owned Buffers when
practical, avoid copies, disable core dumps for key-bearing processes, minimize
heap snapshots, and rely on process isolation and short lifetimes. Do not claim
that assigning `undefined` erases secret bytes.

## 13.5 Step 5 — Run the release checklist

> **▶ Try It Out**
> ```bash
> pnpm lint
> pnpm typecheck
> pnpm test
> pnpm test:stress
> pnpm build
> pnpm test:e2e
> pnpm audit --audit-level high
> pnpm book:check
> ```
> Expected output: All jobs complete successfully, confirming readiness.

Before accepting money, additionally verify a real testnet Orchard payment and
reorg procedure, HMAC secret rotation, expiry and month-boundary rotation,
backup restoration, rate limiting, proxy log redaction, clock synchronization,
TLS configuration, scanner outage recovery, and the exact refund policy for a
paid invoice whose client loses blinding state.

## 13.6 Step 6 — Mark the next boundary: OHTTP

Oblivious HTTP can place a relay between client and gateway so the relay sees
the client network and the gateway sees the encrypted application request, but
neither sees both under non-collusion. It does not hide request contents from
the final BlindPass API after gateway decryption. Adding it requires shared
configuration, padding, replay policy, relay selection, key rotation, and
failure behavior that never falls back silently.

The mature architecture keeps its claim modest: shielded payment reduces public
chain linkage; VOPRF issuance removes a direct cryptographic purchase-to-token
link; PostgreSQL enforces one spend; encrypted local custody protects stored
bearers; Tor can reduce direct source-IP exposure. The remaining metadata and
endpoint risks are engineering work, not footnotes.

### Build checkpoint

Run the full local flow, capture the payments table and redemptions table, and
attempt to join them without using timing or network data. Then enable request
timing logs in an isolated lab and repeat. The contrast shows why privacy is a
system property: the cryptography removes one link, while operations decide
whether another link takes its place.

The finished repository should now move through five observable states of
confidence: it type-checks, narrow boundary tests pass, PostgreSQL concurrency
tests pass, the optimized web build succeeds, and the full browser flow works.
If a later change cannot identify which checkpoint it preserves, it is too
large to review as one privacy-sensitive change.
