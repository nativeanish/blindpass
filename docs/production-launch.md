# Running BlindPass as a service

For installation without host Node.js/pnpm, follow the [Docker deployment guide](docker-deployment.md). Its `scripts/deploy.sh` helper also covers key generation and future epoch provisioning in containers.

This release adds encrypted purchase recovery, portable wallet backups, purchase history, operator monitoring, payment reconciliation, request budgets, automatic rotation into provisioned epoch keys, and a separate HTTPS deployment. It still needs a real scanner bridge and an operator. No mainnet payment or public deployment has been performed by these changes.

## 1. Provision the payment rail

Deploy a Zcash scanner implementing [the bridge contract](zcash.md). It must derive unique shielded Orchard Unified Addresses, scan with incoming viewing capability, report the configured network and confirmations, authenticate requests, and sign exact webhook bytes. The API never needs a spending key.

Configure its webhook destination as `https://YOUR_HOST/webhooks/zcash/payment`. The API also polls recently created invoices every 30 seconds by default, covering missed notifications and reorgs for seven days. Each pass claims up to 20 due invoices, oldest checked first, and reads four at a time. Multiple instances may safely run against the same database. Increase worker capacity and review this observation window for your service volume and risk policy. Monitor scanner synchronization separately; an API health check does not prove chain health.

For delayed notifications, include `observedAt` (an authenticated ISO timestamp of the original incoming transfer observation). This allows an on-time payment to confirm after its payment deadline, provided the issuance deadline has not passed. Without it, a first observation after expiry requires manual operator review. Never invent earlier observation times. Partial payments, late payments, and automatic refunds are not implemented as self-service workflows.

## 2. Prepare the host and identity

Use a Linux host with Docker Compose, a domain pointing to the host, outbound access to your scanner, and inbound ports 80/443. Keep PostgreSQL and API ports private. Use pnpm 9.10 and Node 24 for local maintenance.

```bash
pnpm install --frozen-lockfile
cp .env.production.example .env.production
pnpm keys:generate
```

`keys:generate` creates `.secrets/production.env` with mode 0600. It generates a stable Ed25519 identity, current and next monthly VOPRF keys, and an operator access key. It refuses to overwrite an existing file. Copy only the printed **public** fingerprint into `NEXT_PUBLIC_BLINDPASS_FINGERPRINT` in `.env.production`. This value is compiled into the browser build.

Fill `.env.production` with your hostname (no URL scheme), TLS contact email, HTTPS/mailto support URL, a long URL-safe database password, scanner URL, scanner API key, and webhook secret of at least 32 characters. Keep `ZCASH_NETWORK=testnet` for verification. The scanner credentials must come from the real bridge; generated placeholders are not connections.

Back up the secret file outside the host before accepting payments. Do not regenerate an existing identity, rotate a live epoch key, or restore the database without its matching keys. Restrict access to deployment environment files and Docker. A managed secrets system is preferable to plaintext environment files at larger scale.

## 3. Deploy the production stack

```bash
docker compose --env-file .env.production -f infra/compose.production.yml config --quiet
docker compose --env-file .env.production -f infra/compose.production.yml up --build -d
```

The stack includes PostgreSQL, the API, Next.js, and Caddy. It uses separate production volumes, a private database network, automatic TLS, service restart policies, health checks, graceful shutdown, and non-root app containers. Only the edge publishes ports. Database migrations run transactionally under an advisory lock and are tracked with checksums. Add new migrations; never edit an applied one.

Caddy access logging is disabled and its runtime log output is discarded because errors may include URLs and capabilities. Use external availability monitoring and the authenticated operator screen. Review any additional CDN, load balancer, log agent, or hosting platform before putting it in front of the service.

The web app uses per-response script nonces and dynamic rendering. Demo, presentation, and debug-admin screens are unavailable in production, while `/demo/privacy` remains a customer-facing explanation. No third-party analytics or service worker caches are installed.

## 4. Verify on testnet, then launch

Use an external wallet to create and pay an invoice, observe confirmation, receive ten credits, and perform a search. Test interrupted issuance, a browser reload, backup download and restoration into an empty profile, replay rejection, missed webhook reconciliation, and a real scanner reorg event on testnet. Confirm the same issuer fingerprint from an independently distributed channel.

Do not accept mainnet payments until the scanner, support process, backups, and recovery drills have passed. Then set `ZCASH_NETWORK=mainnet` and `BLINDPASS_ALLOW_MAINNET=true`, configure the scanner for mainnet, and recreate the stack. Mainnet requires both explicit settings. The operator is responsible for pricing, support, refunds, and service terms appropriate to their launch.

## Operations

Open `/operator` and enter `OPERATOR_API_KEY` from the restricted key file. It is held in page memory only and sent in the Authorization header. The dashboard shows aggregate invoice states, payments, issued/redeemed totals, reconciliation results, epoch cutoffs, and error counts. It contains no raw tokens, queries, payment addresses, or joined payment/redemption histories. Rotate the operator access key by changing the secret file and recreating the API; this does not rotate the issuer identity.

- `/api/live`: process liveness, no database dependency.
- `/api/health`: database readiness and active epoch readiness. Returns 503 when rotation is required; does not certify scanner chain health.
- `/api/service`: public network, support, expiry, and fingerprint.
- `/api/ops/status`: authenticated aggregate status; never expose the operator key in query parameters.

Request budgets are per API process: 600 requests/minute for the service, 30 invoice creations/minute, and 30 operations requests/minute by default. They retain aggregate counters instead of IP identities. This is a baseline resource budget, not distributed DDoS protection. Scale and edge protection require capacity testing. Health endpoints are excluded so a busy service remains observable.

### Epoch rotation

The API checks the calendar every five seconds and automatically switches to the next **preprovisioned** key, retaining unexpired verification keys. If the next key is missing, it fails readiness and new purchases fail closed. Existing credits remain verifiable until their shared expiry. Recovery of already committed issuance uses the original manifest through its grace period.

Provision the following month well before cutoff:

```bash
pnpm keys:provision YYYY-MM
docker compose --env-file .env.production -f infra/compose.production.yml up -d --force-recreate api
```

Replace `YYYY-MM` with the month you need. The tool preserves existing keys and refuses to overwrite an existing epoch. Back up the updated key file. Recreating the API reloads the keyring; the calendar switch itself then requires no restart. All replicas must share the same keyring, identity, and database. Do not delete previous keys during their verification grace period.

### Backup and restore

Use automated, access-restricted PostgreSQL backups, preferably managed point-in-time recovery. Back up `.secrets/production.env` and deployment configuration through a separate encrypted secret backup system. For a manual database snapshot from this stack:

```bash
mkdir -p backups
chmod 700 backups
umask 077
docker compose --env-file .env.production -f infra/compose.production.yml exec -T postgres pg_dump -U blindpass -Fc blindpass > backups/blindpass.dump
```

Test restoring into a **separate** database with its matching keys before relying on a backup. A stale database restore can forget spent-token records and accept previously spent tokens. Never open an old snapshot directly to public redemption; recover the spent ledger through the last accepted transaction, or halt redemption until affected epochs expire. Backups also contain payment data and must have an explicit retention policy.

### Customer recovery

Browser and CLI clients persist encrypted blinding state before contacting the issuer. An interrupted issuance resumes the same transcript; it cannot mint a second batch. Browser wallet backups use PBKDF2-SHA-256 (600,000 iterations) and AES-256-GCM, cover pending purchases, and are bound to the original issuer. Restore is allowed only into an empty wallet. Old backups do not recreate spent credits. Without the encrypted backup and passphrase, clearing local data destroys access; the operator cannot reset a bearer wallet.

An ambiguous search response sets aside the credit rather than replaying it. The wallet displays that count. Confirmed server rejection before completion restores the credit. This release does not offer anonymous refund tokens or search-result replay storage.

## Release verification

```bash
pnpm release:check
pnpm test:stress
pnpm test:e2e
pnpm audit --audit-level high
```

Use a disposable PostgreSQL instance for tests. See [the release verification record](production-verification.md) for checks actually executed and outstanding external launch work. Independent review of the cryptographic composition, live scanner validation, real backup restore drills, and public-host load testing remain required evidence before claiming an audited production service.
