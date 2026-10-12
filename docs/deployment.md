# Deployment guide

For the complete Docker-only walkthrough, see [Deploy BlindPass with Docker](docker-deployment.md), including the deployment helper, image distribution, backup restoration, and platform setup.

For the public service deployment, use [the production launch runbook](production-launch.md) and `infra/compose.production.yml`. The default stack below remains a local demonstration.

## Local development

Run `pnpm install`, `docker compose up -d postgres`, then `pnpm dev`. The launcher runs the idempotent SQL migration before starting Fastify and Next.js. Search seed data is bundled. Development signing and epoch secrets are generated into `.secrets/` with restricted permissions and are ignored by Git and Docker builds.

Default ports are PostgreSQL 5432, web 3000 and API 3001. `POSTGRES_PORT` and `DATABASE_URL` must agree if changed. The current local checkout uses 55432 because 5432 was occupied. Always browse the configured issuer hostname (`localhost:3000` by default), since a different hostname is a different issuer policy.

## Containers

`docker compose up --build` builds API and web and starts PostgreSQL with health checks. The API runs migrations and persists development keys in `issuer_secrets`; PostgreSQL uses `postgres_data`. Application containers run as the non-root Node user. The bundled Compose configuration explicitly runs mock-payment development mode and binds published ports to loopback.

`docker compose --profile tor up -d tor` optionally starts a SOCKS proxy on loopback port 9050. Tor bootstrap and reachable destination requirements still apply; the web app does not automatically use it. Do not expose the proxy publicly.

Stopping containers preserves named volumes. Removing the database or issuer-secret volume destroys state or makes existing credits unverifiable. Back them up together; never casually reset keys while keeping outstanding credentials.

For the persistent local preview alongside `pnpm dev`, use the smoke configuration (Compose 2.24.4+):

```bash
docker compose -p blindpass-smoke -f docker-compose.yml -f infra/compose.smoke.yml up --build -d
BLINDPASS_E2E_BASE_URL=http://localhost:3100 pnpm test:e2e
docker compose -p blindpass-smoke -f docker-compose.yml -f infra/compose.smoke.yml stop
```

This uses ports 3100, 3101 and 55433 and separate named volumes. It does not change or erase the development database. The browser tests use actual issuance and redemption, including when targeting the optimized container build. Keep the `blindpass-smoke` project name: changing it selects different database/key volumes and creates a different issuer at the same URL, which existing wallets correctly reject. Always upgrade this preview using its original database and signing/epoch keys together.

For a separate release-verification environment, use a different origin as well as different volumes:

```bash
docker compose -f docker-compose.yml -f infra/compose.verify.yml up --build -d
BLINDPASS_E2E_BASE_URL=http://localhost:3200 pnpm test:e2e
docker compose -f docker-compose.yml -f infra/compose.verify.yml stop
```

This fixes the verification project name to `blindpass-verify` and uses web 3200, API 3201, and PostgreSQL 55434. Do not repoint an established browser origin to a fresh verification database. If that has happened, stop the replacement deployment and restore the original deployment with both of its existing volumes; do not erase the browser's trusted fingerprint.

## Zcash network selector

The app header offers **Simulation**, **Devnet (testnet)**, and **Mainnet**.
The current selection comes from the API's payment configuration: `mock` is
Simulation; `scanner` with `testnet` is Devnet; `scanner` with `mainnet` is Mainnet.

To enable switching, set these optional variables on each API deployment to the
public origins of the other app deployments (no path, query, or credentials):

```dotenv
BLINDPASS_SIMULATION_URL=https://simulation.example.com
BLINDPASS_DEVNET_URL=https://devnet.example.com
BLINDPASS_MAINNET_URL=https://app.example.com
```

Only configure origins you operate with the matching payment mode and network.
Unset networks appear as “Not configured”; the current environment is always
available. Restart the API after changing these settings. HTTP origins are
accepted only for localhost development. Each environment must use a different
host or port, database, and issuer keys. The selector opens the target's `/app`
page without carrying queries, invoice IDs, wallet data, or trust pins across
environments. Browser origin isolation keeps each wallet and purchase history
with its deployment. Switching does not reconfigure a running API or activate a
scanner. Devnet and Mainnet require the [real scanner setup](zcash.md), and
production Mainnet retains the `BLINDPASS_ALLOW_MAINNET=true` requirement.

## Issuer policy errors

`ISSUER_POLICY_VIOLATION` blocks a purchase before an invoice is created when issuer configuration validation fails. The message distinguishes an address mismatch, a changed signing identity, a changed configuration within the same month, an incorrect credit period, and invalid signatures or policy fields.

- **Address mismatch:** open the exact configured hostname and port. For the isolated stack, use `http://localhost:3100/app/buy`, not `127.0.0.1:3100`. Do not change `ISSUER_ORIGIN` on an existing issuer database to accommodate an alias.
- **Identity mismatch:** compare the stable merchant fingerprint with the independently trusted fingerprint, the browser build's `NEXT_PUBLIC_BLINDPASS_FINGERPRINT`, and the original deployment. Restore the matching signing keys if deployment secrets were replaced. Do not regenerate keys or silently overwrite a wallet pin.
- **Configuration changed:** restore the registered monthly issuer secret and policy. The same month must not acquire a different key for different clients.
- **Credit period mismatch:** check the device and server UTC dates, then verify that monthly key rotation is healthy.

Keep browser wallet data intact and export an encrypted backup before recovery work. A successful purchase in an empty profile confirms that fresh-client validation passes; it does not resolve a previous wallet's trust mismatch. Do not clear browser storage, remove Docker volumes, or reset an existing wallet to hide this error.

## Production configuration

Use `infra/compose.production.yml` and `.env.production.example`. Set `SUPPORT_URL` and a strong `OPERATOR_API_KEY` in addition to the payment configuration. Set `BLINDPASS_ENV=production`, scanner mode, real `DATABASE_URL`, stable `ISSUER_ORIGIN`, and the scanner URL/API/HMAC secrets. Production refuses mock payments or missing explicit keys.

Required signing material:

- `MERCHANT_CONFIG_PRIVATE_KEY`: base64url-encoded Ed25519 PKCS#8 private key.
- `MERCHANT_CONFIG_PUBLIC_KEY`: base64url-encoded Ed25519 raw public key.
- `PRIVACYPASS_ISSUER_KEYS`: preferred JSON keyring of current, next, and unexpired previous epoch secrets.
- `PRIVACYPASS_ISSUER_SECRET` (legacy single-epoch configuration): base64url-encoded library-generated P-384 VOPRF private scalar.
- `PRIVACYPASS_ISSUER_EPOCH`: the UTC month for that key, e.g. `2026-09`.
- `PRIVACYPASS_PREVIOUS_KEYS`: optional JSON map of still-valid prior epoch names to their encoded secret keys.

Use a secrets manager. Do not put values in source control, image layers, shell history or logs. Generate issuer keys with the library’s `keyGen()` and Ed25519 using Web Crypto or a compatible audited key-management tool. The application refuses to overwrite the public key already registered for an epoch. Validate configured public/private signing pairs operationally before rollout.

Distribute the merchant identity fingerprint independently. CLI clients accept `BLINDPASS_PINNED_FINGERPRINT`. Browser deployments can build with `NEXT_PUBLIC_BLINDPASS_FINGERPRINT`; this is public identity data, not a secret. Browser same-origin code remains trusted. Publish the shared epoch manifest through an independent channel when cross-client consistency matters.

## Routing and TLS

Serve web and API under one origin, with `/api/*` and `/.well-known/*` proxied to Fastify. Route `/webhooks/zcash/payment` only to the API and authenticate it as documented. Set `API_INTERNAL_URL` when building the web image if its internal API location differs; Next.js rewrites are build configuration. The included Docker web stage builds against `http://api:3001`.

Use TLS outside localhost. Configure browser security headers and a deployment-specific CSP. Do not inject third-party analytics or scripts into credential pages. Review CDN/proxy logs: authorization headers, path capabilities, raw URLs, query strings, scanner keys and IPs must not be retained by default. The application disables request logging, but cannot enforce upstream behavior.

## Epoch rotation

Provide `PRIVACYPASS_ISSUER_KEYS` as a JSON map of epoch names to library-generated private keys. The running service switches into a preprovisioned key automatically every calendar month and retains previous verification keys through grace. Missing keys fail readiness and new purchases; active credits remain redeemable. `pnpm keys:generate` creates the current and next key. `pnpm keys:provision YYYY-MM` adds a future key without replacing any identity; recreate the API to load the extended keyring before cutoff. All nodes must share the same keys, signing identity, database, and synchronized clock.

## Operational requirements

Before accepting real value: security review, real scanner validation, confirmation policy appropriate to the network, transaction reconciliation, database backups, migration rehearsal, clock synchronization, availability monitoring and a disclosed manual refund contact. Limit body sizes and configure capacity/DoS controls without persistent per-client tracking unless explicitly disclosed. The fixed-cost reference search is safe to roll back; external resource execution needs separate idempotency and failure design.

Development admin statistics, payment simulator and malicious-configuration debug routes are absent from production. The separate `/api/ops/status` endpoint requires `OPERATOR_API_KEY` and exposes aggregate counts only. The admin page may render a denial state if directly requested, but cannot retrieve the underlying data. Production debug absence is tested at the API boundary.

## Testing and release

Run lint, strict typechecking, all unit/integration tests, the 10,000-token gate, production build, Playwright tests and dependency audit. CI uses a fresh PostgreSQL service and generated test-only keys. Tests create random schemas and clean up only their own schemas. Never run test tracing against real bearer credentials: browser traces can capture ephemeral protocol traffic.

See `docs/verification.md` for the checks actually performed on this build, including any external integration limits.
