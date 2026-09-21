# Deployment guide

## Local development

Run `pnpm install`, `docker compose up -d postgres`, then `pnpm dev`. The launcher runs the idempotent SQL migration before starting Fastify and Next.js. Search seed data is bundled. Development signing and epoch secrets are generated into `.secrets/` with restricted permissions and are ignored by Git and Docker builds.

Default ports are PostgreSQL 5432, web 3000 and API 3001. `POSTGRES_PORT` and `DATABASE_URL` must agree if changed. The current local checkout uses 55432 because 5432 was occupied. Always browse the configured issuer hostname (`localhost:3000` by default), since a different hostname is a different issuer policy.

## Containers

`docker compose up --build` builds API and web and starts PostgreSQL with health checks. The API runs migrations and persists development keys in `issuer_secrets`; PostgreSQL uses `postgres_data`. Application containers run as the non-root Node user. The bundled Compose configuration explicitly runs mock-payment development mode and binds published ports to loopback.

`docker compose --profile tor up -d tor` optionally starts a SOCKS proxy on loopback port 9050. Tor bootstrap and reachable destination requirements still apply; the web app does not automatically use it. Do not expose the proxy publicly.

Stopping containers preserves named volumes. Removing the database or issuer-secret volume destroys state or makes existing credits unverifiable. Back them up together; never casually reset keys while keeping outstanding credentials.

To test containers alongside `pnpm dev`, use the isolated smoke configuration (Compose 2.24.4+):

```bash
docker compose -p blindpass-smoke -f docker-compose.yml -f infra/compose.smoke.yml up --build -d
BLINDPASS_E2E_BASE_URL=http://localhost:3100 pnpm test:e2e
docker compose -p blindpass-smoke -f docker-compose.yml -f infra/compose.smoke.yml stop
```

This uses ports 3100, 3101 and 55433 and separate named volumes. It does not change or erase the development database. The browser tests use actual issuance and redemption, including when targeting the optimized container build.

## Production configuration

Start from a separate production deployment configuration. Set `BLINDPASS_ENV=production`, scanner mode, real `DATABASE_URL`, stable `ISSUER_ORIGIN`, and the scanner URL/API/HMAC secrets. Production refuses mock payments or missing explicit keys.

Required signing material:

- `MERCHANT_CONFIG_PRIVATE_KEY`: base64url-encoded Ed25519 PKCS#8 private key.
- `MERCHANT_CONFIG_PUBLIC_KEY`: base64url-encoded Ed25519 raw public key.
- `PRIVACYPASS_ISSUER_SECRET`: base64url-encoded library-generated P-384 VOPRF private scalar.
- `PRIVACYPASS_ISSUER_EPOCH`: the UTC month for that key, e.g. `2026-09`.
- `PRIVACYPASS_PREVIOUS_KEYS`: optional JSON map of still-valid prior epoch names to their encoded secret keys.

Use a secrets manager. Do not put values in source control, image layers, shell history or logs. Generate issuer keys with the library’s `keyGen()` and Ed25519 using Web Crypto or a compatible audited key-management tool. The application refuses to overwrite the public key already registered for an epoch. Validate configured public/private signing pairs operationally before rollout.

Distribute the merchant identity fingerprint independently. CLI clients accept `BLINDPASS_PINNED_FINGERPRINT`. Browser deployments can build with `NEXT_PUBLIC_BLINDPASS_FINGERPRINT`; this is public identity data, not a secret. Browser same-origin code remains trusted. Publish the shared epoch manifest through an independent channel when cross-client consistency matters.

## Routing and TLS

Serve web and API under one origin, with `/api/*` and `/.well-known/*` proxied to Fastify. Route `/webhooks/zcash/payment` only to the API and authenticate it as documented. Set `API_INTERNAL_URL` when building the web image if its internal API location differs; Next.js rewrites are build configuration. The included Docker web stage builds against `http://api:3001`.

Use TLS outside localhost. Configure browser security headers and a deployment-specific CSP. Do not inject third-party analytics or scripts into credential pages. Review CDN/proxy logs: authorization headers, path capabilities, raw URLs, query strings, scanner keys and IPs must not be retained by default. The application disables request logging, but cannot enforce upstream behavior.

## Epoch rotation

Generate one key for the next shared month. Deploy at the boundary and restart the issuer so its active manifest changes coherently. Retain the previous epoch key until its common expiry seven days after the month boundary. All nodes must share the same current key, signing identity, database and manifest. Keep clocks synchronized. Monitor upcoming issuance cutoff; the service rejects new invoices once the loaded epoch ends rather than inventing per-invoice dates.

## Operational requirements

Before accepting real value: security review, real scanner validation, confirmation policy appropriate to the network, transaction reconciliation, database backups, migration rehearsal, clock synchronization, availability monitoring and a disclosed manual refund contact. Limit body sizes and configure capacity/DoS controls without persistent per-client tracking unless explicitly disclosed. The fixed-cost reference search is safe to roll back; external resource execution needs separate idempotency and failure design.

Admin statistics, payment simulator and malicious-configuration debug routes are absent from production. The admin page may render a denial state if directly requested, but cannot retrieve the underlying data. Production debug absence is tested at the API boundary.

## Testing and release

Run lint, strict typechecking, all unit/integration tests, the 10,000-token gate, production build, Playwright tests and dependency audit. CI uses a fresh PostgreSQL service and generated test-only keys. Tests create random schemas and clean up only their own schemas. Never run test tracing against real bearer credentials: browser traces can capture ephemeral protocol traffic.

See `docs/verification.md` for the checks actually performed on this build, including any external integration limits.
