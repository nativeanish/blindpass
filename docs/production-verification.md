# Service upgrade verification

Verification performed on 2026-10-06 with Node 24, pnpm 9.10, PostgreSQL 17, Next.js 16.3.6, and Chromium. Payment events in local and browser tests are simulated; credential generation, proof verification, storage, and redemption use the real implementation.

## Executed checks

| Check | Result |
| --- | --- |
| ESLint and TypeScript (API, SDKs, CLI, web) | Passed |
| Unit/integration suite | 36 tests across 16 files passed |
| Optimized Next.js build | Passed |
| Chromium browser suite | 5 scenarios passed in development and optimized Docker builds |
| Accessibility | No serious/critical axe violations on landing, overview, purchase, wallet, purchase history, help, operator login, privacy, and docs routes |
| Mobile layout | No horizontal page overflow on the new wallet, purchase history, help, and operator routes at 390 px |
| RFC 9578 / PostgreSQL stress gate | 10,000 real issue/finalize/redeem cycles passed (168.1 seconds) |
| Production Compose configuration | Parsed successfully with validation-only settings; not deployed publicly |
| Caddy production configuration | Validated with the actual Caddy image |
| API and web Docker images | Built; isolated stack reached healthy status |
| Production web route restrictions | `/admin`, `/demo`, `/presentation` return 404; `/demo/privacy`, `/app/wallet`, `/operator` remain available |
| Key tooling | Generated current/next keys, provisioned a future month, and verified mode 0600 without printing secrets |
| Dependency audit at high threshold | Passed; Next.js and source-map-js advisories remediated |
| Diff whitespace and changed-source formatting | Passed |

The audit still reports one low-severity advisory for npm package `cli@0.1.0`, with an empty dependency-path list. `pnpm why cli` finds no installed external `cli` dependency; this workspace has a private `@blindpass/cli` package. The audit output is disclosed rather than suppressed.

## Recovery and integrity evidence

- Serialized recovery requests and final tokens match the upstream Privacy Pass client when given the same nonce and blinder inputs; corrupted proofs are rejected.
- A lost response after issuer commitment survives client reconstruction; concurrent recovery attempts store exactly one batch.
- A failed final wallet save leaves the original recovery transcript available.
- Pending issuance can be exported in an encrypted backup, restored into an empty wallet, and completed.
- Backups reject wrong passwords, modified ciphertext, wrong origins, and attempts to overwrite an occupied wallet.
- An empty build-time fingerprint does not bypass an existing locally trusted issuer pin.
- Invalid local input and a definite rate-limit rejection preserve credits; ambiguous transport failure sets a credit aside.
- Missed scanner notifications are reconciled idempotently. An authenticated on-time observation can confirm after the payment deadline. On-time detected payments remain in the confirmation flow after the payment deadline. A reorg for a different transfer cannot revoke the accepted transfer.
- Provisioned month-boundary rotation retains old-credit redemption and returns the original signed manifest when recovering a committed old batch.
- Aggregate request limits return 429 with retry information. Liveness/readiness stay reachable, oversized payloads return 413, and operator totals require authentication.
- Existing proof, replay-race, rollback, policy, vector, CLI, search, scanner, and architecture-boundary tests still pass.

The browser suite also aborts a real issuance response after the server commits, reloads the page, resumes the purchase, downloads a backup, restores it in a fresh browser context, and spends a restored credit. Desktop and mobile screenshots were inspected.

## Environment notes

An existing local PostgreSQL database had a registered issuer key that differed from the checkout's secret files. Startup correctly refused to replace it. Browser testing used a separate database and an isolated Compose project; existing invoices and keys were not reset. Development and optimized browser tests use simulated payments explicitly labeled in the UI.

### Local issuer continuity repair

The release-verification project reused the persistent preview's `localhost:3100` origin with different signing keys. Fresh-browser tests passed, but an existing wallet correctly rejected the replacement identity. On 2026-10-06 the verification project was stopped with its volumes preserved, and the original `blindpass-smoke` database and issuer-key volumes were brought back using the updated application images. The original keys and database were backed up with restricted local file permissions before migration.

The restored service's signing fingerprint matches its original September manifest. All three existing invoices and three redemption records remained present before the recovery checks; October rotation added a new epoch while retaining the original signing identity and unexpired September verification key. A Chromium wallet seeded with the original September manifest and trusted fingerprint completed simulated payment, received ten credits, spent one, and retained nine after reload without browser errors. This specifically checks an existing trust pin, rather than only a fresh wallet.

The smoke configuration now fixes its project name to `blindpass-smoke`. A separate `infra/compose.verify.yml` uses `blindpass-verify`, `localhost:3200`, API port 3201, and database port 55434 so future verification does not replace the preview's issuer. Both Compose configurations were parsed and their project names, public issuer addresses, and ports checked. The browser's issuer checks remain enforced.

## Evidence still required for public launch

A configured and synchronized real Zcash scanner, a domain and host, externally funded testnet flow, real scanner reorg testing, deployment-specific load tests, secret-manager integration if desired, point-in-time database recovery drills, operator support/refund processes, and independent security review have not been performed by this change. There is no claim of mainnet settlement, public deployment, or an independent audit.

Follow [the launch runbook](production-launch.md) before accepting value. The service currently sells a fixed pack for the bundled technical corpus; it is not a live general-purpose web search engine or a multi-merchant billing platform.
