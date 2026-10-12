# Deploy BlindPass with Docker

This guide packages the application, API, credential libraries, search corpus, database migrations, and maintenance commands. You do not need Node.js or pnpm on the deployment host. The Dockerfile is [`infra/Dockerfile`](../infra/Dockerfile); the public deployment is [`infra/compose.production.yml`](../infra/compose.production.yml).

The production stack is four containers: Caddy terminates HTTPS and routes requests to Next.js or Fastify; Fastify connects to PostgreSQL and your external Zcash scanner bridge. Only Caddy publishes ports. Database data and TLS certificates persist in named volumes. Stable issuer keys live outside the images.

**A real Zcash scanner bridge is an external dependency.** This repository includes its HTTP adapter, not a Zcash node, wallet, or scanner implementation. You can run the local simulation immediately. To receive real payments, deploy a bridge implementing [the scanner contract](zcash.md), configure its credentials, and validate a funded testnet transaction. A public lightwalletd URL is not a replacement for the bridge.

## Choose a deployment

| Deployment | Configuration | Payment behavior |
| --- | --- | --- |
| Local demonstration | `docker-compose.yml` | Simulated payments; real credential cryptography |
| Public service | `infra/compose.production.yml` | Scanner-backed payments; mock mode is rejected |
| Container hosting platform | `api` and `web` Dockerfile targets + PostgreSQL + platform ingress | Same production requirements; set environment/secrets explicitly |

Linux Docker hosts and Linux containers on Docker Desktop are supported by the packaging. Bash examples below work on Linux, macOS, and WSL. Managed platforms must support long-running Node services, private service networking, PostgreSQL, and HTTPS; a static website host alone is insufficient. Start with roughly 2 CPU cores, 4 GB RAM, and 20 GB free disk for building and a small deployment, then measure actual load. This is a planning estimate, not a capacity guarantee. Scanner resources are additional.

Use Docker Engine or Docker Desktop with BuildKit and Compose **2.24.4 or newer** (the optional development overlays use `!override`). Check:

```bash
docker version
docker compose version
```

Install Docker using its [official installation instructions](https://docs.docker.com/engine/install/). Enable Docker to start at boot on your host. Treat Docker access as privileged access to the host and deployment secrets.

## 1. Get the source

Use your repository checkout, or extract the supplied archive:

```bash
tar -xzf blindpass-source.tar.gz
cd blindpass
```

Run subsequent commands from this directory unless using `scripts/deploy.sh`, which locates the repository itself. The archive includes source, lockfile, configuration templates, tests, and documentation. It deliberately excludes live environment files, issuer keys, databases, dependencies, build output, videos, and Git history. To migrate an existing service, transfer its original configuration and keys through a separate secure channel and restore its current database; do not initialize a new identity.

## 2. Optional: run the local demonstration

```bash
docker compose up --build -d --wait --wait-timeout 300
docker compose ps
```

Open **http://localhost:3000**. Buy ten credits, simulate confirmation, receive credits, and search. The database and API publish only to loopback. Local ports are 3000, 3001, and 5432; set `POSTGRES_PORT=55432` in your local `.env` if only the database port conflicts. For alternate app ports use the existing [isolated preview instructions](deployment.md#containers).

```bash
docker compose stop
docker compose start
```

Keep the same Compose project name and its `postgres_data` and `issuer_secrets` volumes across restarts. This demonstration is not the public production stack. Never send funds to a simulated payment address.

## 3. Prepare the public host

1. Point your domain's A record to the host. If you publish an AAAA record, IPv6 must also reach the host.
2. Allow inbound TCP 80 and 443; UDP 443 is optional for HTTP/3. Retain your SSH access. Do not publish database/API ports.
3. Allow outbound DNS, HTTPS for certificate issuance/image builds, and access to the scanner bridge.
4. Keep host time synchronized. Webhook timestamp validation and credential epochs depend on UTC time.
5. Ensure no other service occupies ports 80/443. If your platform owns ingress, use the platform instructions below instead of starting Caddy.

## 4. Initialize keys using Docker

For a **new service**:

```bash
./scripts/deploy.sh init
```

This builds the `tools` image, copies `.env.production.example` to `.env.production` if absent, and writes `.secrets/production.env` with restricted permissions. The tools container runs as your host UID/GID, so generated files remain yours. It creates a stable Ed25519 signing identity, an operator API key, and current/next monthly Privacy Pass keys. It prints only the public fingerprint. Existing key files are retained; the key generator also refuses to overwrite files.

Copy the printed value to `NEXT_PUBLIC_BLINDPASS_FINGERPRINT` in `.env.production`. Back up the key file separately before receiving payments. **Do not regenerate identity or epoch keys when rebuilding, updating, or moving a service.** Existing wallets pin the identity, and outstanding credentials depend on the original epoch keys.

If you already have production keys, put the original file at `.secrets/production.env` and use its original public fingerprint. Custom absolute paths are supported:

```bash
export BLINDPASS_ENV_FILE=/srv/blindpass-config/service.env
export BLINDPASS_KEYS_FILE=/srv/blindpass-config/issuer.env
```

Create the parent directories first. Keep these exports for every helper invocation for that deployment. The raw Compose commands below assume the default paths. Compose CLI `--env-file` interpolation and container `env_file` loading are distinct mechanisms; the helper sets both paths consistently. See [Docker's environment file documentation](https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/).

For an independent second service, also choose a stable, distinct `COMPOSE_PROJECT_NAME` and unique image tags. Separate Caddy stacks need separate hosts/IPs or a shared ingress configuration because both cannot bind the same host ports. Never change the project name of an established service during an ordinary update.

## 5. Fill `.env.production`

Edit the file using a local editor. Do not paste secrets into shell commands or public logs.

| Setting | Value |
| --- | --- |
| `ISSUER_ORIGIN` | Exact public hostname, e.g. `search.example.com`; no scheme, path, or port |
| `ACME_EMAIL` | Your certificate contact email |
| `SUPPORT_URL` | Your HTTPS support URL or `mailto:support@example.com` |
| `POSTGRES_PASSWORD` | Long random URL-safe password; hex avoids database-URL escaping problems |
| `NEXT_PUBLIC_BLINDPASS_FINGERPRINT` | Public fingerprint from key generation; compiled into the web image |
| `ZCASH_NETWORK` | `testnet` for initial validation |
| `ZCASH_SCANNER_URL` | Reachable bridge base URL, preferably HTTPS |
| `ZCASH_SCANNER_API_KEY` | Actual bridge API credential |
| `ZCASH_WEBHOOK_SECRET` | Shared HMAC secret, at least 32 characters, matching the bridge |
| `ZCASH_CONFIRMATIONS` | Required confirmations, initially `3` |
| `BLINDPASS_ALLOW_MAINNET` | `false` until you deliberately enable mainnet |
| `BLINDPASS_API_IMAGE`, `BLINDPASS_WEB_IMAGE` | Local tags by default, or immutable registry release tags |

Generate a database password locally with `openssl rand -hex 32` and store it in the environment file. The scanner API credential comes from your bridge; a random placeholder does not connect it. Optional network-selector origins and rate limits are explained in the template and [deployment reference](deployment.md).

```bash
chmod 600 .env.production .secrets/production.env
```

The production Compose file forces `BLINDPASS_ENV=production` and `ZCASH_PAYMENT_MODE=scanner`. Keys and live `.env` files are excluded from Docker builds. Runtime secrets still exist in the container environment and are visible to Docker administrators. Use a platform secrets manager when available.

`localhost` in a container means that container, not the host. Give the scanner a hostname reachable from the API container. Keep spending keys outside BlindPass; viewing capability belongs in the scanner.

## 6. Validate, build, and start

```bash
./scripts/deploy.sh check
./scripts/deploy.sh build
./scripts/deploy.sh up
./scripts/deploy.sh status
```

Equivalent raw commands:

```bash
docker compose --env-file .env.production -f infra/compose.production.yml config --quiet
docker compose --env-file .env.production -f infra/compose.production.yml build --pull api web
docker compose --env-file .env.production -f infra/compose.production.yml up -d --wait --wait-timeout 300
```

Use `config --quiet`: ordinary `config` output expands credentials. Configuration validation checks Compose syntax and required interpolation; application startup performs additional production validation. Neither proves scanner connectivity or payment correctness.

Migrations run automatically before the API starts, inside a database transaction under an advisory lock. Applied migration checksums are recorded. The bundled search corpus is seeded by application startup. API readiness waits for the database and a valid active issuer epoch; web readiness waits for the app; Caddy starts after web readiness. Apps run as non-root users. Production logs use bounded rotation.

Caddy requests and renews certificates automatically. `up --wait` does not certify public DNS or successful certificate issuance: verify the public HTTPS endpoint next. Access logging is disabled and Caddy runtime logs are discarded to avoid retaining capability URLs. Review any additional proxy or platform logging separately.

## 7. Verify the deployed service

Replace `search.example.com` with your hostname:

```bash
curl --fail --show-error https://search.example.com/api/live
curl --fail --show-error https://search.example.com/api/health
curl --fail --show-error https://search.example.com/api/service
```

Open `/app` and `/operator`. Enter the operator key from your restricted key file in the dashboard; never include it in a URL. Confirm the displayed network and public issuer fingerprint.

Configure the scanner callback as `https://search.example.com/webhooks/zcash/payment`. It must sign exact request bytes as specified in [the bridge contract](zcash.md#payment-webhook). The API also polls invoices for missed events. API health is not a scanner synchronization check.

Before accepting real value, complete a funded testnet flow: create an invoice, pay from an external compatible wallet, observe confirmations, receive credentials, search, reload the wallet, and export/restore an encrypted wallet backup. Test scanner callback retries and missed callbacks. `/demo` and simulation/debug endpoints are unavailable in production. A separately deployed simulation can provide the public demo, with its own hostname, database, and keys.

For mainnet, configure a mainnet scanner and set `ZCASH_NETWORK=mainnet` plus `BLINDPASS_ALLOW_MAINNET=true`. Prefer a separate mainnet deployment with separate origin, database, and issuer identity; never share testnet and mainnet state. Keep the original environment available for any outstanding credits. The project does not send a mainnet payment on your behalf.

## 8. Monitoring and ordinary operations

```bash
./scripts/deploy.sh status
./scripts/deploy.sh logs api
./scripts/deploy.sh logs web
./scripts/deploy.sh logs postgres
./scripts/deploy.sh stop
./scripts/deploy.sh up
```

The helper displays only the last 100 log lines. Monitor HTTPS uptime, `/api/health`, disk space, PostgreSQL backups, scanner synchronization, and monthly key readiness. The `/operator` screen provides aggregate reconciliation and epoch status. Docker health checks mark a process unhealthy; Docker does not automatically restart a still-running unhealthy process merely because of that status. Restart policies handle process exits/host restarts. Alert and investigate persistent unhealthiness.

Do not use `docker compose down -v` on a deployment you need to keep. The production project's default volume names begin `blindpass-production_`; changing the project name selects different volumes. Keep the name stable during updates and migration.

### Provision future issuer epochs

The API can only rotate to keys already in its keyring. Provision the required UTC month before the current/next coverage runs out (replace `YYYY-MM`):

```bash
./scripts/deploy.sh provision YYYY-MM
# Back up the updated key file, then load it into the API:
docker compose --env-file .env.production -f infra/compose.production.yml up -d --force-recreate api
```

Keep previous keys through their verification grace period. Provisioning refuses to replace an existing epoch. All replicas must share keys and the database. This is routine monthly maintenance, not a signing-identity rotation.

## 9. Database backups and recovery

```bash
./scripts/deploy.sh backup
```

This writes a PostgreSQL custom-format dump under `backups/`, with restricted file permissions and a timestamp. Failed dumps never receive the completed `.dump` name. The dump is **not encrypted**. Encrypt and copy it off-host, and separately back up `.secrets/production.env` and `.env.production`. Schedule backups with your host scheduler and configure retention; the helper does not install a scheduler or delete old backups. Prefer managed PostgreSQL point-in-time recovery for an active paid service.

Rehearse restoration into a **new isolated PostgreSQL container**, without starting a public API against it. Example using the same PostgreSQL major version, from the project root:

```bash
docker run -d --name blindpass-restore-drill --network none \
  -e POSTGRES_HOST_AUTH_METHOD=trust \
  -e POSTGRES_USER=blindpass -e POSTGRES_DB=blindpass postgres:17-alpine
docker exec blindpass-restore-drill pg_isready -U blindpass
# Repeat the readiness check until it succeeds; then substitute the actual backup path:
docker exec -i blindpass-restore-drill pg_restore -U blindpass -d blindpass \
  --exit-on-error --no-owner < backups/YOUR-BACKUP.dump
docker exec blindpass-restore-drill psql -U blindpass -d blindpass \
  -c 'SELECT name, applied_at FROM schema_migrations ORDER BY name;'
docker stop blindpass-restore-drill
# Remove only this disposable drill container and its anonymous volume when finished:
docker rm -v blindpass-restore-drill
```

Trust authentication above is limited to a disposable container with **no network and no published ports**. Never apply that setting to the production database.

A stale backup can forget spent credits and allow replay. Do not reopen redemption against an old snapshot: recover the spent ledger through the last accepted transaction, or keep redemption offline until affected epochs expire. Restore the corresponding original issuer keys. A database dump does not contain those keys, and a new identity does not repair lost state. Validate backup freshness and recovery with your service's actual data before a host migration.

## 10. Upgrade, rollback, and move hosts

For an upgrade:

1. Back up the database and matching keys. Review new migrations for backward compatibility.
2. Record the current image tags/digests. Use a new immutable tag for each release in `.env.production` rather than overwriting a production release tag.
3. Deploy the new source (retain `.env.production` and `.secrets`) and run `check`, `build`, and `up`.
4. Verify readiness and the customer flow. Plan a maintenance window; this single-host Compose setup does not provide zero-downtime failover.

For an application rollback, set the old API/web image tags and run:

```bash
docker compose --env-file .env.production -f infra/compose.production.yml up -d --no-build --wait
```

Only do this if the old application is compatible with the migrated schema. Old application images may not understand new migrations. Do not automatically restore an old database as a rollback strategy; that can lose spent-token records.

For a host move, stop new traffic and stop `edge`, `web`, and `api`, then take the final database backup while PostgreSQL remains running. Transfer the source/images, restricted configuration, original keys, and final database state securely. Start PostgreSQL on the new host, restore into its empty database, then start the apps and validate before switching DNS. Keep the old stack offline so writes cannot diverge. The public hostname and issuer identity remain the same. Preserve Caddy `/data` securely or allow certificate reissuance subject to certificate authority limits. Retain the old host/backup until verification completes.

Changing `POSTGRES_PASSWORD` in the environment does not update an already-initialized database role. Coordinate `ALTER ROLE`, configuration, and app recreation during a database credential rotation.

## 11. Registries, multiple architectures, and offline transfer

The API and web are separate targets of one Dockerfile. Build for the destination architecture. For a registry that you control, substitute the registry and release name, and set the public fingerprint:

```bash
docker login registry.example.com
docker buildx create --name blindpass-builder --use
docker buildx build --platform linux/amd64,linux/arm64 \
  -f infra/Dockerfile --target api \
  -t registry.example.com/team/blindpass-api:RELEASE --push .
docker buildx build --platform linux/amd64,linux/arm64 \
  -f infra/Dockerfile --target web \
  --build-arg NEXT_PUBLIC_BLINDPASS_FINGERPRINT=YOUR_PUBLIC_FINGERPRINT \
  -t registry.example.com/team/blindpass-web:RELEASE --push .
```

Buildx needs a compatible builder/emulation setup. See [Docker multi-platform builds](https://docs.docker.com/build/building/multi-platform/). The local validation record below identifies which architecture was actually tested; the commands are not a claim of ARM validation.

Set `BLINDPASS_API_IMAGE` and `BLINDPASS_WEB_IMAGE` to those tags on the server, supply its configuration/keys, then:

```bash
./scripts/deploy.sh pull
docker compose --env-file .env.production -f infra/compose.production.yml up -d --no-build --wait
```

The web fingerprint is public but build-specific: rebuild the web image for a different issuer identity. Tags can also be replaced with immutable image digest references when consuming prebuilt images.

For transfer without a registry, `docker image save` the API, web, `postgres:17-alpine`, and `caddy:2-alpine` images into a tar archive on the build host; transfer it and use `docker image load` on the destination. This transfers images, **not** volumes or runtime secrets. Match CPU architecture. A fresh source-only build still needs registry/package network access; real payment scanning and public certificate issuance also need network connectivity.

## 12. Managed container platforms

Create a persistent PostgreSQL service and two application services from the repository:

| Service | Dockerfile/target | Port | Readiness |
| --- | --- | --- | --- |
| API | `infra/Dockerfile`, `api` | `3001` (`API_PORT` configurable) | `/api/health` |
| Web | `infra/Dockerfile`, `web` | `3000` (`PORT` configurable) | `/app` |

Supply the API with production configuration and the generated issuer secrets through the platform's secret/environment manager. Supply a platform-appropriate `DATABASE_URL` including its required TLS settings. The API runs migrations at startup and requires outbound scanner access. Keep PostgreSQL private. Web needs `BLINDPASS_ENV=production`, `NODE_ENV=production`, and private connectivity to the API.

Set the web **build arguments** `NEXT_PUBLIC_BLINDPASS_FINGERPRINT` and `API_INTERNAL_URL` to the issuer fingerprint and actual private API origin (e.g. `http://blindpass-api:3001`). Set the same `API_INTERNAL_URL` at runtime. Next.js rewrites are compiled at build time; changing only the runtime value does not rewrite the built routing configuration.

Expose one public HTTPS hostname. Route `/api/*`, `/.well-known/*`, and `/webhooks/*` to the API, and everything else to the web service. Alternatively route all traffic to the web container and use its correctly built internal rewrites. Preserve the original paths, authorization headers, and exact webhook body. Disable URL/query/header logging that could capture bearer capabilities. Use your platform's TLS/ingress in place of Caddy. Avoid scale-to-zero or ephemeral databases for a continuously reconciling paid service. Horizontal scaling also needs a shared database/keyring and a review of per-process request limits.

## Troubleshooting

| Symptom | Check/action |
| --- | --- |
| Missing required variable during Compose loading | Fill `.env.production`; run helper `init`; use `--env-file` and `config --quiet` |
| Key-generation permission denied | Ensure the bind-mounted key directory belongs to your host UID/GID; use the helper's non-root invocation |
| API exits with production configuration error | Read the last API log lines; supply actual keys, support URL, scanner credentials, and a valid hostname |
| API unhealthy at a month boundary | Provision the missing epoch, preserve prior keys, and recreate the API |
| Database authentication fails after a password edit | Existing PostgreSQL volumes retain the old role password; coordinate role rotation rather than deleting the volume |
| `502` from web or edge | Verify API/web health and private DNS; rebuild web if its compiled API origin changed |
| HTTPS certificate unavailable | Check A/AAAA records, port 80/443 reachability, host clock, and certificate rate limits |
| No real payment detected | Check bridge network, sync height, incoming viewing capability, API credentials, signed webhooks, and reconciliation status |
| `ISSUER_POLICY_VIOLATION` | Restore the exact original hostname, identity, and epoch keys; see [issuer policy recovery](deployment.md#issuer-policy-errors) |
| Build runs out of memory/disk | Build on a larger host and distribute images; exclude unrelated artifacts from the context; check Docker disk usage |

## Validation and limitations

See [Docker verification](docker-verification.md) for the executed image builds, startup checks, browser flow, and backup rehearsal. Live scanner operation, funded testnet payments, public DNS/TLS issuance, registry publication, and alternate CPU architectures must be verified in your destination environment. No production secrets, real funds, or existing issuer databases are needed for the isolated packaging tests.

To regenerate the source bundle after edits, run `python3 scripts/package-release.py` on a development machine. It writes `artifacts/deployment/blindpass-source.tar.gz` and `SHA256SUMS`. Python is needed only to create the bundle, not to deploy its containers. Verify a downloaded bundle from its directory with `sha256sum -c SHA256SUMS`.
