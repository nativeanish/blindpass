# 19. Deploy and operate the production architecture

Production readiness is a property of the complete deployed system: application, database, scanner, wallet operations, browser delivery, reverse proxy, secrets, backups, and people. The repository's `BLINDPASS_ENV=production` guard blocks some dangerous defaults, but it cannot supply a scanner, a trustworthy client distribution channel, or an incident response process.

## Choose an initial topology with one spend authority

A sensible first topology has a public HTTPS edge, stateless API instances behind it, one PostgreSQL write authority for spent-token inserts, a scanner bridge on a restricted network, and a separately secured wallet. Route the web origin's `/api/*` and `/.well-known/*` paths to Fastify, and route the scanner webhook only to the API. The current Compose file binds local ports and runs mock payments; it is a development artifact, not that topology. The current web build uses a static export and has no app-level proxy rewrite in [`next.config.ts`](../apps/web/next.config.ts), so edge routing must be specified in deployment configuration.

All API nodes must use the same merchant signing identity, active epoch VOPRF key, previous grace-period keys, issuer hostname, and database. A split rollout with different keys can cause clients to pin conflicting manifests or fail redemption depending on which node they reach. Roll out configuration atomically enough to preserve one common epoch view. Monitor the active key ID on every node and compare it to the database registration.

The database is the authoritative replay ledger. Read replicas cannot decide whether a token is unspent. Multi-region active-active writes require globally serialized uniqueness for each spent hash; ordinary independent regional databases do not provide it. Prefer one write region until a stronger distributed protocol is designed and tested.

## Define secret custody and rotation

The API needs an Ed25519 signing private key and one current VOPRF issuer secret; the verifier needs current and unexpired previous VOPRF keys. The scanner needs an incoming viewing capability, API credential, and webhook secret. These are different blast-radius domains. Store them in a managed secret system with separate access roles and audited retrieval. Avoid environment dumps, container image layers, command-line arguments, and support bundles containing them. The browser's expected signing fingerprint is public but must be delivered through a trustworthy path.

At a UTC month boundary, stop issuing under the old epoch, load one previously generated next-epoch key on every node, and retain the old key through its seven-day verification grace. The current process loads keys at startup, so a coordinated restart is required. Run a rehearsal with clocks near a synthetic boundary: create an invoice before cutoff, confirm it near cutoff, issue within its deadline, verify old tokens during grace, and reject after expiry. Back up epoch secrets with the database; a restored database paired with a different key cannot verify outstanding credits.

Signing-key rotation is a different event. Clients pin or cache a merchant identity fingerprint. Replacing that identity without a signed transition or independent announcement can lock clients out or create a phishing opportunity. Design an explicit rotation protocol before an emergency forces one. Also define what happens if a VOPRF key leaks: an attacker with the private verifier/issuer key could forge valid tokens for that epoch. A response may require suspending issuance/redemption, publishing a new shared epoch policy, and compensating users; each choice affects outstanding anonymous credits.

## Control observability without creating a user history

The API disables routine request logs and records aggregate error counts. Production telemetry should expose health, DB availability, scanner lag, invoice state counts, issuance latency, redemption success/replay rates, key epoch, and queue backlog without recording capabilities, raw tokens, queries, IPs, or per-user correlation IDs. Metrics with high-cardinality labels can become an accidental log. Use synthetic canary values to verify redaction at every hop: edge, CDN, application, APM, database, scanner, and backups.

Retention must be explicit. Invoice and payment evidence may have business or legal retention requirements; redeemed-token hashes need to remain long enough to reject replay until token expiry, with a cautious cleanup policy. Deleting spent hashes before a token can no longer verify could permit reuse. Backup copies extend practical retention and should be included in the privacy notice and access model. A production data inventory should name each table, log, secret, backup, operator, purpose, and deletion horizon.

## Capacity and abuse economics

Issuance performs ten VOPRF evaluations while holding database locks, and redemption performs cryptographic verification plus a transactional search. A malicious actor can send malformed or expensive requests without paying. Set body limits, bounded concurrency, timeouts, and rate controls at the edge, but evaluate whether IP-based controls create a long-lived identifier or penalize Tor users. Monitor CPU, DB pool occupancy, lock waits, and 95th/99th percentile latency under stress. The repository's 10,000-cycle gate exercises correctness and some load; it is not a capacity plan for your infrastructure.

The sample search is a PostgreSQL full-text query over a local corpus. Indexes and a result cap of 20 bound its work. If replacing it with a remote paid API, add a durable job or outbox and define whether a credit is consumed on acceptance, completion, or delivery. The existing transaction callback cannot roll back external effects. That is a product and accounting decision as much as an implementation detail.

## Deployment gate

Before traffic, require a reviewed production configuration with scanner mode, explicit keys, TLS, correct origin, edge route tests, DB migration and restore, key backup and rotation rehearsal, scanner testnet evidence, replay race tests against the deployed DB, secret/log inspection, and an independent security review. Record a dated result with limits, as [`docs/verification.md`](../docs/verification.md) does for the reference build. A deployment that merely passes `assertProductionConfig()` has passed a useful startup check, not this gate.
