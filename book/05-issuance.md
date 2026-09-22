# 5. Issue blind credentials

Blind issuance is the privacy boundary at the center of BlindPass. A client wants a valid token from the issuer, but the issuer must not learn the token input it will later see during redemption. The repository uses the Cloudflare Privacy Pass and VOPRF libraries for RFC 9578 token type `0x0001`, using VOPRF(P-384, SHA-384). Its own wrapper handles application policy and strict wire checks; it does not implement curve arithmetic.

## Understand the five operations

For each of ten credits, the client generates a fresh nonce and a blinded token request. The issuer evaluates the blinded request under the common epoch secret and returns an evaluated element and proof. The client verifies that proof against the advertised public key and unblinds locally. Later, a verifier holding the issuer secret checks the token authenticator. The private verifier can accept a valid token without consulting the invoice database.

The proof establishes that the evaluation matches the advertised VOPRF key. It does not establish that an invoice was paid, that the merchant gave all clients the same key, or that the JavaScript downloaded by a browser is trustworthy. Those are separate payment, configuration, and software-distribution controls.

[`createBlindBatch`](../packages/privacy-pass/src/index.ts) creates ten independent `privateVerif.Client` instances and retains their blinding state in memory. It returns only serialized blinded requests to the application. `finalize` requires exactly ten responses, enforces response byte lengths, and asks the library to verify and finalize every token. The client stores the batch only after all finalizations succeed.

## Bind common context, never invoice metadata

The token format does not have a free-standing application expiry or class field. BlindPass builds a `TokenChallenge` whose context hashes canonical JSON containing a domain string, `search-v1`, the UTC monthly epoch, and a common expiry. The challenge also includes the common issuer and origin scope. The current code issues during a calendar month and accepts verification through a shared seven-day grace period. All buyers in that class and epoch get the same key, batch size, and dates. Invoice IDs, purchase timestamps, and addresses must not enter token inputs: any of them would allow the merchant to partition or identify a token later.

The application sends ten standard token requests in one JSON body. This is an application batch envelope, not an implementation claim for a generic IETF batched-token draft or the complete standard issuance HTTP interface. Naming this boundary accurately matters when another team tries to interoperate with a different Privacy Pass server.

## Make issuance one-time and retryable

[`IssuanceService.issue`](../apps/api/src/issuance.ts) checks that the batch contains exactly ten distinct requests. Inside a PostgreSQL transaction it locks the invoice and authorization, compares the client's configuration hash to both invoice and current manifest, checks the deadline and confirmed state, evaluates the batch, stores the request digest and response set, and marks issuance complete. If the same request transcript arrives again, it returns the stored responses. If a new transcript arrives for the same paid invoice, it returns `ISSUANCE_ALREADY_COMPLETED`.

This is the correct shape for idempotency: retry the _same_ operation, do not silently issue a second set of credits. There is a hard limitation. The client retains blinding state only in memory. If the server commits and the client process crashes before finalization or encrypted storage, the saved response cannot be finalized by a newly generated client. The reference design may lose the credits. A production design needs a recoverable, encrypted pending issuance record, with a carefully specified lifecycle and crash tests, or an explicit refund/replacement protocol that preserves unlinkability. Simply permitting another request transcript would create unbounded issuance.

## Exercise: find the link that must not exist

Read the request and response shapes in [`docs/openapi.yaml`](../docs/openapi.yaml), then inspect the two tables in the migration. The issuer can know which invoice authorized the batch and can retain blinded requests and evaluated responses. The redeemed-token table sees only a hash of a finalized token and common epoch. Explain why storing a `token_hash` on the issuance row would defeat the design, and why storing the blind request digest there does not itself identify a later correctly finalized token.
