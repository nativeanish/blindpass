# Verification record

Verified locally on 21 September 2026 with Node.js 24, pnpm 9.10, PostgreSQL 17, and Chromium/Playwright. This is a working reference implementation, not an independent security audit.

## Cryptographic gate

- 10,000 actual RFC 9578 P-384/SHA-384 request/evaluate/proof-verify/finalize/verify cycles, each redeemed against PostgreSQL: **passed**. Final-lockfile run: 175.1 seconds, 16 isolated worker processes.
- Published RFC 9578 reference implementation vector: request bytes, evaluated point and final token match; library proof verification and token verification pass.
- Altered tokens, wrong keys, wrong context, expired credentials and malicious merchant-signed configurations are rejected.
- Twenty concurrent submissions of one credential produce one success and nineteen `TOKEN_ALREADY_SPENT` responses.

The initial crypto gate preceded payment implementation. Later test runs use independent randomly named PostgreSQL schemas, not the demo's spent-token table. The initial 10,008 development-only stress/unit fixtures were removed from that table; every one preceded the first demo invoice. No purchased demo credentials or invoice records were removed.

## Application checks

- `pnpm lint`: passed.
- `pnpm typecheck`: passed, including the Next.js app.
- `pnpm test`: 24 tests across 12 files, covering crypto, official vector, schema separation, payments, reorgs, duplicate events, idempotent issuance, replay, failed-service reservation release, scanner authentication, malicious configuration, encrypted vault, real CLI workflow, production route restrictions and unavailable Tor proxy.
- `pnpm build`: optimized Next.js production build, all application routes generated.
- `pnpm test:e2e`: purchase/payment simulation, ten real credits, search and persisted nine-credit balance; two-client issuance and shuffled redemption; replay/forgery/four issuer-policy attacks; privacy audit; side-channel assumptions; mobile overflow and presentation keyboard navigation.
- Axe checks on landing, wallet, purchase, privacy explorer and developer docs report no serious or critical violations. This automated check is not a full accessibility certification.

The CLI test launches the real command process against an isolated real API/database, uses an encrypted temporary vault, and runs offers, buy, payment simulation, issue, balance, search, invoices, inspect and privacy audit. No bearer credentials are printed.

## Container checks

API and web images build successfully. A separate `blindpass-smoke` Compose project starts PostgreSQL, runs migrations and search seeding, creates persistent development keys, serves the optimized web build and proxies API health checks correctly. Application processes run as the non-root Node user. The smoke configuration exercises non-default web/API/database ports without disturbing `pnpm dev`.

All four Playwright tests pass against the optimized Docker deployment as well (16.9 seconds), including the actual purchase-to-search flow, two-client attack demonstration and automated accessibility checks. The same four tests pass against the development servers (20.8 seconds).

The optional Tor container image builds, and `tor --verify-config -f /etc/tor/torrc` reports a valid configuration. This is a configuration check, not evidence of a live Tor circuit.

## Dependency audit

`pnpm audit --audit-level high` passes. A high-severity transitive SJCL advisory was fixed by pinning the patched `sjcl@1.0.9` through a workspace override. SJCL comes from the library's RSA dependency; this application uses its Noble-backed VOPRF implementation. The VOPRF tests and full stress gate were rerun after the override.

pnpm 9's audit reports one low-severity advisory for `cli@0.1.0`. This is a workspace-name collision with the unrelated registry package `cli`: the actual workspace is `@blindpass/cli@0.1.0`, `pnpm why cli` returns no dependency, and the lockfile contains no installed registry `cli` package. This finding has not been silently suppressed. Review it again when upgrading the package manager.

## Deliberately not claimed

- No real shielded Zcash transaction was sent or observed. Payment simulation is prominently labeled. Real address derivation/scanning requires the documented external scanner.
- No live Tor exit was required or claimed. SOCKS5h enforcement and unavailable-proxy fail-closed behavior are tested; actual Tor connectivity depends on a reachable proxy and destination.
- GitHub Actions configuration is supplied; this local run is not a claim that hosted CI has executed.
- No independent cryptographic/security audit, production deployment, censorship resistance, total anonymity, or measured real-world 50/50 anonymity probability is claimed.
- Browser crash recovery for in-flight blinding state and automatic refund/replacement credentials remain explicit limitations, not hidden implementations.
