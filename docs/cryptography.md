# Cryptography

BlindPass uses `@cloudflare/privacypass-ts` **0.9.0**, `@cloudflare/voprf-ts` **1.0.0**, and its supported Noble provider. The issuer and client use RFC 9578 token type `0x0001`: VOPRF(P-384, SHA-384). No curve arithmetic, proof system, hash-to-curve, blinding algorithm, or anonymous-credential primitive is implemented by this project.

## What the protocol does

A verifiable oblivious pseudorandom function lets a client obtain a keyed function evaluation without revealing its input to the issuer. Here the client input contains the RFC token type, a fresh random 32-byte nonce, a challenge digest, and a public key identifier. The client blinds that input locally. The issuer evaluates the blinded element using the common epoch key and returns an evaluated element with a DLEQ proof. The library verifies that proof against the expected public key while finalizing; a wrong key or invalid proof aborts the operation.

The client unblinds locally and obtains the token authenticator. A later presentation includes the token input and authenticator. Because this is a privately verifiable token, the resource verifier needs the epoch private key. It recomputes the function output and compares the authenticator through the library.

The DLEQ proof establishes consistency with the advertised VOPRF key. It does not prove that payment occurred, that the merchant is honest, or that every buyer received the same configuration. Payment authorization and configuration consistency are separate application controls.

## What each side receives

| Phase | Client | Merchant |
| --- | --- | --- |
| Purchase | Signed invoice and random invoice capability | Invoice, payment address, payment observation |
| Issuance | Nonces, blinding state, evaluated elements and proofs | Invoice authorization plus 10 blinded requests |
| Finalization | 10 unblinded tokens | Nothing additional |
| Redemption | Search result | One unblinded token, its validity, network metadata and query |

The issuer stores an issuance request digest and evaluated responses for identical-request retry. These are blind transcripts, not final token values. `redeemed_tokens` stores only a domain-separated hash and the common epoch, with reservation/spend state and timestamps. There is no invoice foreign key.

## Common application context

The standard token format has **no independent token-class or expiry field**. BlindPass binds the class, common calendar epoch, and common expiry into a 32-byte redemption context using SHA-256 over a canonical JSON object with domain `blindpass-context-v1`. The standard library then hashes the serialized `TokenChallenge`. Issuer and origin names are common to all buyers. The issuer key is shared for the epoch.

BlindPass enforces this challenge on redemption. A successful authenticator under the right key is insufficient if the application context is wrong. Epoch issuance stops at the next UTC month boundary. Verification ends seven days later, allowing the previous month's credits to be used during a common grace period. Dates are deterministic across clients, never invoice-specific.

Ten independent RFC 9578 requests travel in an application JSON batch. This envelope is **not** a claim to implement the IETF generic batched-token draft or the RFC single-token issuance HTTP media-type interface. The credential bytes and authorization header follow the selected RFC protocol.

## HTTP and token storage

Redemption uses RFC 9577 syntax:

```http
Authorization: PrivateToken token="<padded base64url serialized token>"
```

The wrapper enforces exactly 146 canonical token bytes, 52 request bytes, and 145 response bytes, since permissive deserializers must not allow alternate encodings to bypass spent-token checks. The spent-token key is:

```text
SHA-256(UTF8("blindpass-spent-token-v1") || canonical_token_bytes)
```

This domain-separated digest indexes high-entropy tokens; it is not password hashing. PostgreSQL's unique `(token_hash, issuer_epoch)` constraint provides authoritative replay protection.

## Operational signatures

Ed25519 signs the application configuration and invoice documents. This provides document integrity under a trusted signing identity; it is not the anonymous-credential protocol. Clients either pin a known fingerprint or persist the identity seen at first trusted bootstrap. Trust on first use cannot detect a malicious identity on the very first connection. A shared configuration fetched from the same malicious merchant is not a public transparency log; pin distribution and independent consistency checking remain operational responsibilities.

## Limits and review

Protocol blindness prevents direct cryptographic matching of the correctly generated issuance transcript to a redemption. It does not stop timing, source IP, query, browser, or small-set correlation. The merchant still sees the query at its API, and still knows which invoice authorized a batch. JavaScript providers do not promise constant-time execution. Cloudflare describes its library as offered without a guarantee; this reference application and its composition have not received an independent security audit. Production use needs review and hardened key management.

## Validation

`pnpm test:crypto` exercises real requests, proof validation, finalization, valid verification, forgery, expiry, and class/key mismatch. `pnpm test` also exercises a published RFC 9578 reference-implementation vector (request bytes, evaluated point, resulting token, and proof verification), PostgreSQL concurrency, and the absence of invoice access in the redemption module. `pnpm test:stress` performs 10,000 real issue/finalize/redeem cycles using PostgreSQL, across separate test workers.

## Primary references

- [RFC 9576 — Privacy Pass architecture](https://www.rfc-editor.org/rfc/rfc9576.html)
- [RFC 9577 — HTTP authentication scheme](https://www.rfc-editor.org/rfc/rfc9577.html)
- [RFC 9578 — Issuance protocols, section 5](https://www.rfc-editor.org/rfc/rfc9578.html#section-5)
- [RFC 9497 — OPRFs](https://www.rfc-editor.org/rfc/rfc9497.html)
- [Cloudflare Privacy Pass implementation](https://github.com/cloudflare/privacypass-ts)
- [Cloudflare VOPRF implementation and security caveats](https://github.com/cloudflare/voprf-ts)
