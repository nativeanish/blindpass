# 21. Code atlas and reading paths

This appendix connects the book's concepts to the current source tree. Read files in a workflow order rather than alphabetically. At each step, ask what the component is allowed to know and what invariant it enforces. Some web route files are absent in this checkout; the remaining web components demonstrate UI patterns but do not by themselves restore the old application flow.

## Read the purchase path

| Read in order                                                             | Responsibility                                      | Question to answer                                          |
| ------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------- |
| [`packages/shared/src/index.ts`](../packages/shared/src/index.ts)         | Types, errors, canonical encoding, signed documents | Which values are public terms and which are bearer secrets? |
| [`packages/zcash/src/index.ts`](../packages/zcash/src/index.ts)           | Watcher interface, mock events, decimal conversion  | Why is a payment observation separate from a credential?    |
| [`apps/api/src/keys.ts`](../apps/api/src/keys.ts)                         | Signing identity, common epoch key, manifest        | What is pinned, and what must survive a restart?            |
| [`apps/api/src/invoices.ts`](../apps/api/src/invoices.ts)                 | Signed invoice and payment state machine            | Where does confirmed payment become issuance authority?     |
| [`infra/migrations/001_initial.sql`](../infra/migrations/001_initial.sql) | Durable constraints                                 | Which duplicate effects are prevented by the database?      |
| [`tests/integration.test.ts`](../tests/integration.test.ts)               | Payment and issuance behavior                       | Which state transitions are asserted under tests?           |

Follow `InvoiceService.create` with a notebook. Record the origin of each field in the signed document: server offer, generated invoice ID, scanner destination, shared manifest, or policy setting. A payment destination should come only from the watcher and be checked by the client against the signed terms. Then follow `InvoiceService.payment` and draw its transaction boundary. Notice that the API does not accept a public request that says “paid”; only the development simulator or authenticated scanner event path can produce the observation.

## Read the credential path

| Read in order                                                                                             | Responsibility                                                  | Question to answer                                  |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------- |
| [`packages/privacy-pass/src/index.ts`](../packages/privacy-pass/src/index.ts)                             | Challenge, blind batch, issuer evaluation, verification, header | Which bytes are secret, blinded, final, and public? |
| [`apps/api/src/issuance.ts`](../apps/api/src/issuance.ts)                                                 | Exactly-once paid batch                                         | Why does an identical request digest matter?        |
| [`packages/blindpass-client/src/index.ts`](../packages/blindpass-client/src/index.ts)                     | Policy, proof finalization, local transitions                   | When are credentials saved and removed?             |
| [`packages/blindpass-server/src/index.ts`](../packages/blindpass-server/src/index.ts)                     | Canonical verification and transactional spend                  | What serializes concurrent uses of one token?       |
| [`tests/crypto.test.ts`](../tests/crypto.test.ts) and [`tests/vectors.test.ts`](../tests/vectors.test.ts) | Cryptographic behavior and independent bytes                    | What is tested beyond a happy-path round trip?      |
| [`tests/replay.test.ts`](../tests/replay.test.ts)                                                         | Race and rollback                                               | What happens if twenty workers use one token?       |

Trace one token through four representations: blinded request, issuer response, finalized serialized token, and spent-token digest. Only the client should know the blinding state and final token before redemption. Only the verifier should create a spent digest. If a new logging or analytics feature moves any representation to a different stage, revisit the threat model.

## Read the resource and client surfaces

[`apps/api/src/app.ts`](../apps/api/src/app.ts) is the composition root and route layer. [`apps/demo-service/src/search.ts`](../apps/demo-service/src/search.ts) is the fixed-cost local resource. Its PostgreSQL full-text query runs inside the redemption transaction; that property is why rollback can restore an unspent credit after local work fails. [`docs/openapi.yaml`](../docs/openapi.yaml) describes the public HTTP contract, including error responses and the application-specific issuance batch envelope.

[`cli/src/main.ts`](../cli/src/main.ts) exposes the complete runnable workflow. [`cli/src/vault.ts`](../cli/src/vault.ts) protects capabilities and credentials on disk. [`cli/src/tor.ts`](../cli/src/tor.ts) provides optional fail-closed SOCKS5h transport. For the browser, [`apps/web/lib/vault.ts`](../apps/web/lib/vault.ts) implements encrypted IndexedDB and Web Locks, while [`apps/web/components/live-demo.tsx`](../apps/web/components/live-demo.tsx) contains the Alice/Bob protocol demonstration. [`apps/web/components/search-form.tsx`](../apps/web/components/search-form.tsx) is a reusable input. Deleted web route files must be rebuilt or restored before claiming an end-to-end browser workflow in this working tree.

## Read the operations and verification surfaces

[`apps/api/src/config.ts`](../apps/api/src/config.ts) rejects production startup with mock payments or missing explicit secrets. [`packages/zcash/src/scanner.ts`](../packages/zcash/src/scanner.ts) implements the bridge adapter and raw-body HMAC verification; it is not a Zcash node or wallet. [`scripts/migrate.ts`](../scripts/migrate.ts) applies the idempotent schema, and [`scripts/dev.ts`](../scripts/dev.ts) launches local services. [`docker-compose.yml`](../docker-compose.yml) is local development infrastructure with loopback ports and mock payments. [`infra/Dockerfile`](../infra/Dockerfile) builds application containers; [`infra/tor/torrc`](../infra/tor/torrc) configures the optional local Tor proxy.

Tests are grouped by the risk they target: [`tests/scanner.test.ts`](../tests/scanner.test.ts) for webhook and address-policy shape, [`tests/policy.test.ts`](../tests/policy.test.ts) for validly signed malicious manifests, [`tests/search.test.ts`](../tests/search.test.ts) for paid search and rollback, [`tests/production.test.ts`](../tests/production.test.ts) for startup and debug-route restrictions, and [`tests/stress.ts`](../tests/stress.ts) for repeated real protocol cycles. Browser tests under [`tests/e2e/`](../tests/e2e/) describe the prior web flows and currently depend on routes missing from the working tree. Run tests against the exact revision and deployment you intend to claim.

## Choose a reading path

For **application development**, read Chapters 1–7, then 11, 13, 14, 16, 17, and the API/client code in this appendix. For **protocol review**, read Chapters 5, 6, 8, 15, and the vector, policy, and replay tests. For **payment integration**, read Chapters 3, 4, 18, and the scanner contract. For **production planning**, read Chapters 8–10 and 19–20, then write a deployment-specific acceptance record. All paths should end with the same question: what have you actually verified in the environment where value will move?
