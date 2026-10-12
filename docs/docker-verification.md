# Docker packaging verification

Executed on 2026-10-12 on Linux AMD64, Docker Engine 29.9.0 and Docker Compose 5.6.0. Existing application source changes were retained. Checks used newly created local projects and test keys, not a production database or real payment credentials.

| Check | Result |
| --- | --- |
| `infra/Dockerfile` API, web, and tools targets | Built successfully using the frozen pnpm lockfile; web production build completed |
| Web build with a generated public issuer fingerprint | Built successfully |
| `bash -n scripts/deploy.sh` | Passed |
| Docker-only `init` with isolated config/key paths | Generated signing identity, operator key, current/next epoch keys; repeat initialization preserved existing keys |
| Future epoch `provision` | Added the future month while preserving signing identity/operator key; resulting key file mode `0600` |
| Production Compose `config --quiet` | Passed with isolated environment files |
| Local Docker stack | PostgreSQL, API, and optimized web became healthy; migrations and bundled search seeding completed |
| Browser tests against `http://localhost:3300` | Four passed: purchase/issuance/search, two-client protocol and attack checks, public/mobile pages, interrupted issuance and wallet backup restoration |
| Production-mode stack | PostgreSQL, API, and pinned web became healthy on private test networks |
| Production endpoints | API live/health/service returned 200; operator status without authorization returned 401; debug admin API returned 404 |
| Production web routing | App, public privacy explanation, and proxied API health returned 200; demo, presentation, and admin returned 404 |
| Caddy configuration | `caddy validate` passed; no public TLS certificate was requested |
| Database backup helper | Produced a restricted custom-format PostgreSQL dump |
| Restore rehearsal | Restored the dump into a separate network-isolated PostgreSQL 17 container; both migrations and all 1,806 search documents were present |
| Source archive | Extracted successfully; includes executable deployment helper, guides, Docker configuration, lockfile, and search corpus; live environment files, secret directories, dependencies, and generated artifacts excluded |
| Build from extracted archive | Web target built successfully from the extracted source, independently of host `node_modules` |
| API image exclusions | Confirmed live network env files, production key file, and generated artifacts absent |

The production-mode test used an intentionally unreachable `scanner.invalid` URL and synthetic scanner credentials to check application configuration and startup only. It created no production invoices and made no funded payment. API readiness does not verify scanner readiness. The test disabled the public Caddy service and used internal requests for the private web container.

The browser tests exercised simulated payment confirmation and real credential issuance/redemption. They do not establish live Zcash integration, an independent security audit, load capacity, or protection against every side channel.

Not exercised: real scanner/address derivation and chain synchronization, funded testnet/mainnet transactions, public DNS and ACME issuance, registry pushes, ARM64 execution, managed cloud platform rollout, or recovery of an active paid service's latest spent-token ledger. Those remain destination-specific checks.

Reproduction instructions are in [the Docker deployment guide](docker-deployment.md). The existing browser tests can target an isolated Docker deployment with:

```bash
BLINDPASS_E2E_BASE_URL=http://localhost:3300 pnpm exec playwright test tests/e2e/app.spec.ts tests/e2e/recovery.spec.ts
```

Run browser tracing only against disposable test credentials. Test containers are stopped after verification; their isolated volumes are retained rather than removing any existing state.
