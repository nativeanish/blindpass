# 4 The Blind Issuance Pipeline

> **Part II — Credentials · Build checkpoint 1 of 3**

This chapter turns the cryptographic lab into a paid issuance pipeline. Build
from the client inward: define the common challenge, create one independent
client per credit, add issuer evaluation, and only then wrap it in the invoice
transaction.

A paid invoice should authorize exactly ten evaluations, yet the invoice must
never become part of a final token. This creates a sharp boundary: HTTP
authorization proves the right to call the issuer; VOPRF input defines the
credential that can later be redeemed. Mixing them creates a permanent tag.

## 4.1 Step 1 — Derive one common challenge

`challengeFor` hashes a canonical object containing a domain label, shared
token class, monthly epoch, and common expiry. It then builds the RFC 9577
`TokenChallenge`. Invoice ID, capability, payment address, transaction ID, and
purchase time are absent.

```mermaid
sequenceDiagram
  participant C as BlindPass client
  participant A as Fastify issuance API
  participant P as PostgreSQL
  participant I as RFC 9578 issuer
  C->>C: fetch and validate signed common manifest
  C->>C: make 10 Client instances and blinded requests
  C->>A: capability, request[10], configuration hash
  A->>P: lock invoice and issuance authorization
  P-->>A: paid + unused
  A->>I: evaluate 10 serialized TokenRequests
  I-->>A: 10 TokenResponses with DLEQ proofs
  A->>P: persist retry transcript; mark completed
  A-->>C: responses + signed configuration
  C->>C: verify configuration and proofs; unblind locally
```

Here is the complete cryptographic adapter. The application never implements
curve arithmetic itself.

{{blindpass-include:packages/privacy-pass/src/index.ts}}

Build this module in five passes:

1. Import `provider.ts` first and re-export only the standardized types callers
   need.
2. Implement `challengeFor`. Hash a domain-separated canonical object and place
   its digest in `TokenChallenge`; do not add invoice data.
3. Implement `createBlindBatch`. Construct ten separate client objects, then
   keep those objects closed over by `finalize` so their secret blinders never
   leave the process.
4. Implement `TokenIssuer.evaluate` and `verify` with exact byte-length and key
   checks around the library calls.
5. Add RFC 9577 header serialization and the domain-separated spent hash.

The important lines deserve slow reading:

- One `privateVerif.Client` instance owns one nonce and blinder. Reusing a
  client object for multiple requests would couple state.
- `Promise.all` does not turn ten requests into a protocol-level batch. The
  JSON envelope carries ten independent RFC 9578 messages.
- A response must be exactly 145 bytes before deserialization. The finalized
  token must later be exactly 146 bytes and canonically encoded.
- `client.finalize` verifies the proof before it returns a token. A malicious
  response causes the entire batch operation to fail before storage.
- Verification first checks the VOPRF authenticator, then the common key,
  epoch, class, dates, and challenge digest.
- The spent hash has a domain prefix. The same raw token hashed for another
  feature cannot collide semantically with the redemption set.

Trace one array index through the module. `clients[i]` creates `requests[i]`;
the issuer returns `responses[i]`; `clients[i].finalize(responses[i])` recovers
the corresponding token. Reordering responses fails proof finalization because
each client retains a different blinder and input.

## 4.2 Step 2 — Consume a paid authorization once

Issuance itself is a database state transition. The transaction locks both the
invoice and its authorization row. It computes a hash of the ordered request
array, stores the responses, and returns those same responses only when a retry
presents the same transcript.

{{blindpass-include:apps/api/src/issuance.ts}}

The server evaluates inside the transaction. Holding locks across elliptic
curve work is a conscious trade: it makes the state change easy to audit and
bounds each invoice to one in-flight issuance. At larger scale, a durable
`issuing` state and job id can shorten transactions, but recovery must preserve
the exact request transcript. Never “retry” by evaluating a new batch after a
client may have received the old responses; that mints extra credits.

Write `issue` as a sequence of guards before mutations. Validate batch shape
outside the transaction. Inside it, hash the capability and lock the invoice;
compare configuration hashes; lock the authorization; handle an identical
completed request as a retry; reject expiry or unpaid state; evaluate; then
persist both response and completion state. The order ensures every early exit
leaves the rows unchanged.

The `configurationHash` check closes a confused-deputy path. An invoice signed
for epoch A cannot silently issue against epoch B after rotation. The capability
is hashed before lookup, so a database read does not expose bearer secrets.

## 4.3 Step 3 — Exercise success and malicious responses

{{blindpass-include:tests/crypto.test.ts}}

The modified response test flips one bit after the issuer has produced a valid
proof. Finalization rejects it. The appended-byte check protects canonical
authorization parsing. The expiry, class, and key tests show that possession of
a cryptographically valid token is insufficient when application policy does
not match.

Run this slice:

```bash
pnpm test:crypto
pnpm exec vitest run tests/integration.test.ts -t "issues only"
```

### Pitfalls

Do not strip base64url padding because another ecosystem calls unpadded values
“base64url.” RFC 9578's directory encoding includes padding, and BlindPass
enforces one spelling. Do not serialize client blinding state into server logs.
Do not issue a partial batch and report success: the buyer paid for a fixed
denomination, so response count is an invariant. Do not derive a per-invoice
issuer key; that is a perfect partition tag disguised as key management.

### Build checkpoint

You now have real blinded issuance: payment authorizes an evaluation count,
while common policy and fresh client randomness determine the final tokens.

Do not proceed until the vector, crypto, and issuance-idempotency cases all pass.
