# 2 Oblivious Pseudorandom Functions in Practice

The VOPRF lets a client obtain `F_k(x)` without revealing `x` to the server and
without letting a cheating server substitute another function unnoticed. In
BlindPass, `x` contains the token type, a fresh nonce, a challenge digest, and
the issuer key identifier. The final authenticator is derived from that input;
the issuer sees only a blinded curve element during issuance.

## 2.1 From hash input to blind evaluation

Let `G` be the prime-order P-384 group with generator `g`, order `q`, issuer
secret scalar `k`, and public key `K = kG`. `HashToGroup(x)` maps arbitrary
bytes to a valid group element `M`. The client samples nonzero `r` uniformly
from `Z_q` and computes:

```text
M = HashToGroup(x)
B = r · M                 client -> issuer
Z = k · B = k · r · M     issuer -> client
N = r^-1 · Z = k · M      client unblinds
y = Finalize(x, N)         token authenticator
```

The client never sends `M`, `r`, or `x`. Because scalar multiplication
commutes, unblinding recovers the same group element the issuer would compute
for an ordinary PRF evaluation. Reusing `r` or sampling it predictably breaks
privacy, so randomness belongs to the reviewed library.

The V in VOPRF adds a proof that `(G, K)` and `(B, Z)` share the same discrete
logarithm `k`. RFC 9497 constructs a DLEQ proof as a Fiat-Shamir challenge and
response. Conceptually, the issuer samples `t`, commits to `tG` and `tB`, hashes
the transcript to `c`, and returns `s = t - c·k mod q`. The verifier checks the
reconstructed commitments. A proof binds the evaluation to the advertised
public key without revealing `k`.

```mermaid
sequenceDiagram
  participant C as Client
  participant I as Issuer (k, K=kG)
  C->>C: x = 0x0001 || nonce || H(challenge) || key_id
  C->>C: M = HashToGroup(x); B = rM
  C->>I: TokenRequest(B, truncated key id)
  I->>I: Z = kB; proof = DLEQ(G,K,B,Z)
  I-->>C: TokenResponse(Z, proof)
  C->>C: verify proof; N = r^-1 Z; y = Finalize(x,N)
```

## 2.2 Use the standardized implementation

P-384 point decoding, hash-to-curve, scalar sampling, proof transcripts, and
wire lengths are exactly the places where “small” custom implementations fail.
BlindPass installs the Noble provider before Privacy Pass captures its group
implementation.

{{blindpass-include:packages/privacy-pass/src/provider.ts}}

This four-line module matters. Import order is a cryptographic dependency. All
entry points import it first, so `privateVerif.Client`, `Issuer`, and token
deserializers use the same `CryptoNoble` backend from `@cloudflare/voprf-ts`.
No application code reaches into `@noble/curves` internals.

## 2.3 Verify bytes, not just round trips

A client and server with the same bug can pass a round-trip test. Reference
vectors instead fix the nonce, blinding scalar, public key, request bytes,
response prefix, and final token bytes. The fixture in this repository was
generated from an independent RFC-compatible implementation and includes its
provenance beside the JSON.

{{blindpass-include:tests/vectors.test.ts}}

The first spy controls the 32-byte token nonce. The second controls the VOPRF
blinder. Both are restored in `finally`; leaking either mock into another test
would make randomness tests meaningless. The response proof is randomized, so
the test compares the deterministic evaluated-element prefix and then verifies
the complete proof through finalization.

Run both vector and adversarial cryptography tests:

```bash
pnpm exec vitest run tests/vectors.test.ts tests/crypto.test.ts
```

## 2.4 Boundary conditions that fail closed

The curve library cannot decide application policy. BlindPass additionally
rejects a request or response with the wrong exact length, a noncanonical
base64url spelling, an unexpected key ID, a challenge for another class, and an
expired epoch. This matters because permissive deserializers may accept trailing
bytes. If two byte strings parse as one token but hash differently in the spent
set, an attacker gets a double-spend alias.

JavaScript cannot promise constant-time execution. Secret-key operations live
inside reviewed primitives; comparisons of public encodings may be ordinary.
The HMAC boundary in chapter 8 uses `timingSafeEqual` because it compares a
secret-derived authenticator. Do not add diagnostic logs for blinders, private
keys, nonces before finalization, or raw credentials.

### Checkpoint

You should be able to derive `r^-1(k(rM)) = kM`, explain what the DLEQ proof
prevents, and explain why a reference-vector test catches errors that a local
client/server round trip cannot.
