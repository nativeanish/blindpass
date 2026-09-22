# 9. Test the invariants

Tests for a privacy system should prove the boundaries, not merely count happy-path requests. BlindPass's test suite covers cryptographic vectors, policy failures, payment states, replay races, scanner authentication, vault behavior, and browser interactions. The book's lab remains valuable even if a previous verification record exists: rerun the checks against the exact code and environment you intend to review.

## Build a test matrix from claims

| Claim                                         | Failure injection                     | Evidence to seek                                |
| --------------------------------------------- | ------------------------------------- | ----------------------------------------------- |
| Client accepts only the advertised issuer key | Return a different key or bad proof   | Finalization rejects, no credits saved          |
| One paid invoice issues one batch             | Retry with a new blind transcript     | `ISSUANCE_ALREADY_COMPLETED`                    |
| Duplicate payment events do not add authority | Deliver the same event ID twice       | One authorization row                           |
| Reorg before issuance revokes authority       | Emit a reorg observation              | Issuance rejects until a new valid confirmation |
| One token buys one search                     | Submit it concurrently many times     | One success, remaining requests rejected        |
| Failed local work does not charge             | Throw inside protected transaction    | Reservation rolls back                          |
| Merchant cannot tailor a token class silently | Sign a malicious manifest             | Client policy rejects despite valid signature   |
| Malformed scanner callbacks cannot authorize  | Change raw webhook bytes or timestamp | HMAC/freshness validation rejects               |

The tests under [`tests/`](../tests/) implement these cases. The published RFC vector under [`tests/vectors/`](../tests/vectors/) checks bytes against an independent reference, which is stronger than testing two calls to the same library against each other. The stress test performs real issue/finalize/verify/redemption cycles with PostgreSQL. It demonstrates behavior under its tested concurrency and environment; it is not a formal proof or security audit.

## Run the appropriate gates

With PostgreSQL running:

```bash
pnpm lint
pnpm typecheck
pnpm test:crypto
pnpm test
pnpm build
```

`pnpm test` includes database integration tests that create isolated schemas. Use a disposable database with schema privileges. `pnpm test:stress` is a longer gate intended to exercise 10,000 cycles. Playwright browser checks require Chromium installation and the expected application routes. In the current working tree, several routes are deleted, so treat browser results as dependent on restoring or rebuilding those routes rather than as a gate for the CLI chapters.

Do not treat a past green test record as evidence that a changed lockfile, environment, scanner bridge, browser bundle, or deployment is safe. [`docs/verification.md`](../docs/verification.md) records what was tested on a specific date and explicitly lists what was not tested. That pattern is worth copying into a production release note.

## Test the database constraint under contention

The crucial replay assertion is not “the second sequential request failed.” It is “concurrent requests through independent workers cannot both commit a spend.” The test should synchronize requests to increase overlap, send the same token to all workers, count successful protected operations, and inspect the spent table. One successful operation and one spent row are the expected result. A service failure before commit should leave no spent row. A response lost _after_ commit is a separate client ambiguity test.

## Test the boundaries you do not own

The default suite cannot prove a real Zcash scanner's address derivation, chain observation, or reorg reporting because no scanner is bundled. It cannot prove a live Tor circuit from an unavailable-proxy test, nor can an accessibility scanner establish complete accessibility. A production verification plan needs contract tests against the deployed bridge, testnet payments from an external wallet, reverse-proxy log inspection, secret rotation rehearsal, backup restore, load testing, and independent security review. Track each as an explicit gate and record the result; do not imply that the demo performed it.

## Exercise: add one meaningful failure case

Choose an invariant above and inspect its existing test. Change the threat, not only an input string: for example, simulate two different signed manifests shown to first-time clients, a process crash after server issuance commit, or a lost search response after spend commit. Write the expected user-visible result and database state before writing a test. Some of these cases expose an intentional limitation rather than a passing behavior; documenting that is still useful verification.
