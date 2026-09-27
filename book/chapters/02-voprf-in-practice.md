# 2 Oblivious Pseudorandom Functions in Practice

> **Part I — Foundations · Build checkpoint 2 of 3**

*In this chapter*
- Install the Noble P-384 cryptographic provider
- Derive the blind-evaluation mental model from group theory
- Lock the VOPRF wire format to an independent RFC 9578 reference vector
- Add rejection cases for non-canonical encodings and policy violations

This chapter builds the cryptographic laboratory before application code. You
will install the provider, pin deterministic inputs in a test, and prove the
library produces independently known wire bytes. Chapter 4 will wrap the same
objects in BlindPass policy.

> **📖 DEFINITION: Oblivious Pseudorandom Function (OPRF)**
>
> The VOPRF lets a client obtain `F_k(x)` without revealing `x` to the server and
> without letting a cheating server substitute another function unnoticed. In
> BlindPass, `x` contains the token type, a fresh nonce, a challenge digest, and
> the issuer key identifier. The final authenticator is derived from that input;
> the issuer sees only a blinded curve element during issuance.

## 2.1 Step 1 — Derive the blind-evaluation mental model

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
for an ordinary PRF evaluation.

> **⚠ PITFALL: Reusing blinding scalar r breaks privacy — always delegate randomness to the reviewed library**
>
> Reusing `r` or sampling it predictably breaks privacy, so randomness belongs to the reviewed library.

The V in VOPRF adds a proof that `(G, K)` and `(B, Z)` share the same discrete
logarithm `k`. RFC 9497 constructs a DLEQ proof as a Fiat-Shamir challenge and
response. Conceptually, the issuer samples `t`, commits to `tG` and `tB`, hashes
the transcript to `c`, and returns `s = t - c·k mod q`. The verifier checks the
reconstructed commitments. A proof binds the evaluation to the advertised
public key without revealing `k`.

```text
Client                                   Issuer (k, K=kG)
  │                                          │
  │  x = 0x0001 ‖ nonce ‖ H(chal) ‖ key_id  │
  │  M = HashToGroup(x)                      │
  │  B = r·M                                 │
  │                                          │
  │──── TokenRequest(B, key_id) ────────────>│
  │                                          │ Z = k·B
  │                                          │ proof = DLEQ(G,K,B,Z)
  │<─── TokenResponse(Z, proof) ─────────────│
  │                                          │
  │  verify proof                            │
  │  N = r⁻¹·Z = k·M                        │
  │  y = Finalize(x, N)                      │
```

## 2.2 Step 2 — Install the standardized provider

P-384 point decoding, hash-to-curve, scalar sampling, proof transcripts, and
wire lengths are exactly the places where “small” custom implementations fail.
BlindPass installs the Noble provider before Privacy Pass captures its group
implementation.

```typescript
// File: packages/privacy-pass/src/provider.ts
import { Oprf } from "@cloudflare/voprf-ts"; // <1>
import { CryptoNoble } from "@cloudflare/voprf-ts/crypto-noble"; // <2>

// Official provider supported by voprf-ts; initialized before Privacy Pass captures its group.
Oprf.Crypto = CryptoNoble; // <3>
```

> **<1>** The first import obtains the global VOPRF configuration point.
>
> **<2>** The second obtains the reviewed Noble adapter.
>
> **<3>** The assignment happens at module evaluation time. Any module that constructs a Privacy Pass client before this import risks capturing a missing or different provider, so `packages/privacy-pass/src/index.ts` imports `./provider.ts` as its first statement.

> **▶ Try It Out**
> ```bash
> pnpm run build
> ```
> The provider should compile without errors.

This four-line module matters. Import order is a cryptographic dependency. All
entry points import it first, so `privateVerif.Client`, `Issuer`, and token
deserializers use the same `CryptoNoble` backend from `@cloudflare/voprf-ts`.
No application code reaches into `@noble/curves` internals.

## 2.3 Step 3 — Lock the wire format to a reference vector

A client and server with the same bug can pass a round-trip test. Reference
vectors instead fix the nonce, blinding scalar, public key, request bytes,
response prefix, and final token bytes. The fixture in this repository was
generated from an independent RFC-compatible implementation and includes its
provenance beside the JSON.

```typescript
// File: tests/vectors.test.ts
import "../packages/privacy-pass/src/provider.js"; // <1>
import { test, expect, vi } from "vitest";
import { VOPRFClient } from "@cloudflare/voprf-ts";
import {
  privateVerif,
  TokenChallenge,
  TOKEN_TYPES,
} from "@cloudflare/privacypass-ts";
import vectors from "./vectors/rfc9578-go.json";

const hex = (v: string) => Uint8Array.from(Buffer.from(v, "hex"));
const toHex = (v: Uint8Array) => Buffer.from(v).toString("hex");

test.each(vectors)("RFC 9578 reference implementation vector", async (v) => {
  const nonce = vi
    .spyOn(crypto, "getRandomValues")
    .mockReturnValueOnce(hex(v.nonce)); // <2>
  
  const blind = vi
    .spyOn(VOPRFClient.prototype, "randomBlinder")
    .mockResolvedValueOnce(TOKEN_TYPES.VOPRF.group.desScalar(hex(v.blind))); // <3>
    
  try {
    const client = new privateVerif.Client();
    const request = await client.createTokenRequest(
      TokenChallenge.deserialize(hex(v.token_challenge)),
      hex(v.pkS),
    ); // <4>
    expect(toHex(request.serialize())).toBe(v.token_request); // <5>

    const issuer = new privateVerif.Issuer(
      "issuer.example",
      hex(v.skS),
      hex(v.pkS),
    );
    const response = await issuer.issue(request); // <6>
    expect(toHex(response.serialize().slice(0, 49))).toBe(
      v.token_response.slice(0, 98),
    ); // <7>

    const token = await client.finalize(response);
    expect(toHex(token.serialize())).toBe(v.token);
    expect(await issuer.verify(token)).toBe(true); // <8>
  } finally {
    nonce.mockRestore();
    blind.mockRestore();
  }
});
```

> **<1>** Import the provider first to ensure the `CryptoNoble` backend is registered before anything else.
>
> **<2>** The first spy controls the 32-byte token nonce.
>
> **<3>** The second spy controls the VOPRF blinder. Both are restored in `finally`; leaking either mock into another test would make randomness tests meaningless.
>
> **<4>** Ask the public client API to serialize a request.
>
> **<5>** Compare all bytes of the generated request against the reference vector.
>
> **<6>** Ask the issuer to evaluate it.
>
> **<7>** Compare the deterministic evaluated-element prefix. The response proof is randomized, so the test only compares the deterministic part of the point.
>
> **<8>** Finally, let the client verify the randomized proof and compare the final token. This order tells you whether a failure starts in request construction, server evaluation, or finalization.

> **▶ Try It Out**
> ```bash
> pnpm exec vitest run tests/vectors.test.ts tests/crypto.test.ts
> ```
> Both vector and adversarial cryptography tests should pass.

## 2.4 Step 4 — Add rejection cases

The curve library cannot decide application policy. BlindPass additionally
rejects a request or response with the wrong exact length, a noncanonical
base64url spelling, an unexpected key ID, a challenge for another class, and an
expired epoch. This matters because permissive deserializers may accept trailing
bytes. If two byte strings parse as one token but hash differently in the spent
set, an attacker gets a double-spend alias.

> **🔒 SECURITY NOTE: JavaScript cannot guarantee constant-time execution — secret-key operations must live inside reviewed cryptographic primitives**
>
> Comparisons of public encodings may be ordinary. The HMAC boundary in chapter 8 uses `timingSafeEqual` because it compares a secret-derived authenticator. Do not add diagnostic logs for blinders, private keys, nonces before finalization, or raw credentials.

### Build checkpoint

You should be able to derive `r^-1(k(rM)) = kM`, explain what the DLEQ proof
prevents, and explain why a reference-vector test catches errors that a local
client/server round trip cannot.

Leave both crypto tests green before adding application encodings:

> **▶ Try It Out**
> ```bash
> pnpm exec vitest run tests/vectors.test.ts tests/crypto.test.ts
> ```
> Tests should pass smoothly.
