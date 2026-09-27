# 13 Operational Security & Threat Realities

> **Part V — Assurance · Build checkpoint 2 of 2**

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

{{blindpass-include:apps/api/src/config.ts}}

The production guard requires database, Ed25519, VOPRF, scanner, and webhook
secrets. It rejects mock payments, localhost issuer names, and accidental
mainnet activation. `BLINDPASS_ALLOW_MAINNET=true` is a deliberate tripwire; it
does not certify that the scanner or keys are safe for funds.

The database pool and process entry point are small enough to audit in full.

{{blindpass-include:apps/api/src/db/connection.ts}}

{{blindpass-include:apps/api/src/main.ts}}

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

{{blindpass-include:docker-compose.yml}}

{{blindpass-include:infra/Dockerfile}}

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

Prefer metrics such as total issuance failures by code and queue latency. Avoid
high-cardinality labels containing token hashes, invoice IDs, IPs, or query
text. Define retention before collecting data. Restrict debug routes at route
registration, as the production test verifies.

{{blindpass-include:tests/production.test.ts}}

## 13.4 Step 4 — Plan key rotation and incidents

Back up the stable Ed25519 identity and VOPRF keys still needed for grace-period
verification. Test restoration before rotation day. Publish and monitor one
manifest hash per epoch. If a VOPRF key leaks, an attacker can mint and verify
tokens for that epoch; rotate the cohort and assess already-issued credit risk.
If the signing key leaks, configuration authenticity is lost and clients need a
new trust anchor through an independent channel.

Secret “zeroization” in Node.js is best effort. Overwrite owned Buffers when
practical, avoid copies, disable core dumps for key-bearing processes, minimize
heap snapshots, and rely on process isolation and short lifetimes. Do not claim
that assigning `undefined` erases secret bytes.

## 13.5 Step 5 — Run the release checklist

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:stress
pnpm build
pnpm test:e2e
pnpm audit --audit-level high
pnpm book:check
```

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

### Part V and book checkpoint

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
