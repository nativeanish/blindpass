# 6. Verify and spend exactly once

At redemption, the API must answer two questions: is this a valid `search-v1` token for an accepted epoch, and has this exact token already been spent? Both must be true before it executes the paid search. The client sends one RFC 9577 authorization header and a query. No invoice capability travels with the request.

```http
Authorization: PrivateToken token="<padded base64url token>"
```

## Verify the right credential

[`TokenIssuer.verify`](../packages/privacy-pass/src/index.ts) enforces canonical token bytes, asks the library to verify the authenticator, checks the public-key ID, validity interval, token class, and expected challenge digest. A valid authenticator under the wrong epoch or context is not authority for this search. The wrapper also checks exact request, response, and token byte lengths because permissive deserialization could otherwise admit alternate encodings of one logical token.

Canonical encoding is connected directly to replay protection. If two different byte strings could represent the same credential, hashing the raw bytes would create two spent keys and might allow a second redemption. The server parses the header and rejects noncanonical encodings before deriving the spent hash.

The spent key is SHA-256 over a domain string followed by the canonical token bytes. Domain separation prevents accidental reuse of this digest in another application context. This is a hash of a high-entropy credential, not password hashing. The table stores the digest and shared epoch; it does not store the raw bearer token, query, IP address, or invoice ID.

## Put replay defense in the database

The verifier uses PostgreSQL's primary key on `(token_hash, issuer_epoch)` as the authority. [`RedemptionService.redeem`](../packages/blindpass-server/src/index.ts) begins a transaction, inserts the hash with `ON CONFLICT DO NOTHING`, executes the protected work, marks the row `spent`, and commits. If another request presents the same token at the same time, its insert waits for the first transaction's outcome. On commit it sees a conflict and receives `TOKEN_ALREADY_SPENT`. On rollback it may proceed because no charge occurred.

This is stronger than checking a cache or querying before insert. A read-then-write sequence can race; two workers can both read “not spent.” A process-local mutex does not coordinate multiple API instances. The unique database key is the serialization point all instances share.

The local search function accepts the transaction handle. If it fails before producing a response, the reservation rolls back with it. This pattern is valid because PostgreSQL full-text search is a reversible local operation. If the paid work sends an email, calls a remote service, transfers funds, or starts a long job, rolling back the database does _not_ undo that side effect. Such resources need a separate durable job and outcome protocol. Do not reuse this middleware for arbitrary work merely because it accepts a callback.

## Handle ambiguous outcomes from the client side

The client persists removal of a token _before_ transport. If it gets a definite `SERVICE_TEMPORARILY_UNAVAILABLE` or invalid-request response, it restores the token. If the connection fails ambiguously, it leaves the token removed: the server may have committed a spend even though the response was lost. This favors avoiding accidental replay over preserving every credit. There is no automatic second-token retry, which could charge twice. A production client should make this ambiguity visible to users and may need a privacy-preserving receipt or status mechanism; such a mechanism must not reintroduce invoice linkage.

## Exercise: run a race in your head

Twenty requests present the same valid token simultaneously to two API instances sharing PostgreSQL. All pass cryptographic verification. Which line ensures at most one successful search? What happens if the winning search throws before commit? Confirm your answer with [`tests/replay.test.ts`](../tests/replay.test.ts). Then consider why a Redis cache used only for performance cannot be the sole replay authority unless it offers a rigorously equivalent atomic and durable guarantee.
