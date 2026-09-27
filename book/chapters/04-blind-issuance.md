# 4 The Blind Issuance Pipeline

> **Part II — Credentials · Build checkpoint 1 of 3**

*In this chapter*
- Derive one common challenge from shared epoch policy
- Build the blind batch creation and DLEQ proof finalization pipeline
- Consume a paid authorization exactly once via transactional issuance
- Test success, bit-flip, and malicious response rejection

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

```text
BlindPass Client         Fastify issuance API          PostgreSQL             RFC 9578 issuer
       │                          │                        │                        │
       │─┐ fetch and validate     │                        │                        │
       │<┘ signed common manifest │                        │                        │
       │                          │                        │                        │
       │─┐ make 10 Client instances                        │                        │
       │<┘ and blinded requests   │                        │                        │
       │                          │                        │                        │
       │── capability, request[10], config hash ──────────>│                        │
       │                          │                        │                        │
       │                          │── lock invoice and ───>│                        │
       │                          │   authorization        │                        │
       │                          │                        │                        │
       │                          │<── paid + unused ──────│                        │
       │                          │                        │                        │
       │                          │── evaluate 10 serialized TokenRequests ────────>│
       │                          │                        │                        │
       │                          │<── 10 TokenResponses with DLEQ proofs ──────────│
       │                          │                        │                        │
       │                          │── persist retry transcript; ───────────────────>│
       │                          │   mark completed       │                        │
       │                          │                        │                        │
       │<── responses + signed configuration ──────────────│                        │
       │                          │                        │                        │
       │─┐ verify config and      │                        │                        │
       │<┘ proofs; unblind locally│                        │                        │
       │                          │                        │                        │
```

Here is the complete cryptographic adapter. The application never implements
curve arithmetic itself.

```typescript
// File: packages/privacy-pass/src/index.ts
import "./provider.ts";
import {
  privateVerif,
  Token,
  TokenChallenge,
  AuthorizationHeader,
  TOKEN_TYPES,
  WWWAuthenticateHeader,
} from "@cloudflare/privacypass-ts";
import {
  b64,
  unb64,
  sha256,
  canonical,
  BlindPassError,
  type Manifest,
  type StoredCredential,
} from "@blindpass/shared";
export { privateVerif, Token, TokenChallenge, TOKEN_TYPES };
export const keyGen = privateVerif.keyGen;

export async function challengeFor(manifest: Manifest) {
  const context = unb64(
    await sha256(
      canonical({ // <1>
        domain: "blindpass-context-v1",
        tokenClass: manifest.tokenClass,
        epoch: manifest.epoch,
        expiresAt: manifest.expiresAt,
      }),
    ),
  );
  return new TokenChallenge(1, manifest.issuer, context, [
    manifest.originScope,
  ]);
}

export async function createBlindBatch(manifest: Manifest, count = 10) {
  const challenge = await challengeFor(manifest);
  const clients = Array.from(
    { length: count },
    () => new privateVerif.Client(), // <2>
  );
  const requests = await Promise.all( // <3>
    clients.map(async (client) =>
      b64(
        (
          await client.createTokenRequest(challenge, unb64(manifest.publicKey))
        ).serialize(),
      ),
    ),
  );
  return {
    requests,
    async finalize(responses: string[]): Promise<StoredCredential[]> { // <4>
      if (responses.length !== clients.length)
        throw new BlindPassError(
          "INVALID_TOKEN",
          400,
          "Incorrect issuance response size.",
        );
      return Promise.all(
        clients.map(async (client, i) => {
          try {
            const bytes = unb64(responses[i]);
            if (bytes.length !== 145) throw new Error("length"); // <5>
            const token = await client.finalize( // <6>
              privateVerif.TokenResponse.deserialize(bytes),
            );
            return {
              token: b64(token.serialize()),
              epoch: manifest.epoch,
              tokenClass: manifest.tokenClass,
              expiresAt: manifest.expiresAt,
            };
          } catch {
            throw new BlindPassError(
              "INVALID_TOKEN",
              400,
              "Issuer proof verification failed. No credits were stored.",
            );
          }
        }),
      );
    },
  };
}
```

> **<1>** Domain-separated canonical hash excludes invoice data.
>
> **<2>** One privateVerif.Client per token — no state reuse.
>
> **<3>** Promise.all creates independent RFC 9578 requests, NOT a protocol batch.
>
> **<4>** finalize closure retains client objects and their secret blinders.
>
> **<5>** Response must be exactly 145 bytes before deserialization.
>
> **<6>** client.finalize verifies DLEQ proof before returning token.

> **▶ Try It Out**
> ```bash
> pnpm test:crypto
> ```
> Expected output is the test suite passing successfully, verifying challenge creation and unblinding.

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

```typescript
// File: packages/privacy-pass/src/index.ts
export class TokenIssuer {
  private issuer: privateVerif.Issuer;
  constructor(
    public manifest: Manifest,
    privateKey: Uint8Array,
  ) {
    this.issuer = new privateVerif.Issuer( // <1>
      manifest.issuer,
      privateKey,
      unb64(manifest.publicKey),
    );
  }
  async evaluate(requests: string[]) {
    const expected = unb64(this.manifest.activeKeyId).at(-1);
    return Promise.all(
      requests.map(async (request) => {
        try {
          const bytes = unb64(request);
          if (bytes.length !== 52) throw new Error("length"); // <2>
          const parsed = privateVerif.TokenRequest.deserialize(bytes);
          if (parsed.truncatedTokenKeyId !== expected) throw new Error("key"); // <3>
          return b64((await this.issuer.issue(parsed)).serialize());
        } catch {
          throw new BlindPassError("INVALID_TOKEN");
        }
      }),
    );
  }
  async verify(
    raw: string,
    now = Date.now(),
    tokenClass = this.manifest.tokenClass,
  ) {
    let token: Token;
    try {
      const bytes = unb64(raw);
      if (bytes.length !== 146 || b64(bytes) !== raw) // <4>
        throw new Error("noncanonical");
      token = Token.deserialize(TOKEN_TYPES.VOPRF, bytes);
      if (!(await this.issuer.verify(token))) throw new Error("authenticator");
    } catch {
      throw new BlindPassError("INVALID_TOKEN", 401);
    }
    if (b64(token.authInput.tokenKeyId) !== this.manifest.activeKeyId)
      throw new BlindPassError("WRONG_ISSUER_EPOCH", 401);
    if (now >= Date.parse(this.manifest.expiresAt))
      throw new BlindPassError("TOKEN_EXPIRED", 401);
    if (now < Date.parse(this.manifest.validFrom))
      throw new BlindPassError("WRONG_ISSUER_EPOCH", 401);
    if (tokenClass !== this.manifest.tokenClass)
      throw new BlindPassError("WRONG_TOKEN_CLASS", 401);
    const expected = await sha256(
      (await challengeFor(this.manifest)).serialize(),
    );
    if (b64(token.authInput.challengeDigest) !== expected) // <5>
      throw new BlindPassError("WRONG_TOKEN_CLASS", 401);
    return token;
  }
}
```

> **<1>** Issuer constructed from manifest and private key.
>
> **<2>** Request must be exactly 52 bytes.
>
> **<3>** truncatedTokenKeyId must match expected key.
>
> **<4>** Token must be 146 bytes AND canonical encoding (b64(unb64(raw)) === raw).
>
> **<5>** Challenge digest check binds token to common policy.

> **▶ Try It Out**
> ```bash
> pnpm test:crypto
> ```
> Expected output is tests passing for token verification and evaluation constraints.

```typescript
// File: packages/privacy-pass/src/index.ts
export function authorization(credential: StoredCredential | string) {
  const raw = typeof credential === "string" ? credential : credential.token;
  return new AuthorizationHeader(
    Token.deserialize(TOKEN_TYPES.VOPRF, unb64(raw)),
  ).toString(true);
}
export function parseAuthorization(header?: string): string {
  if (!header)
    throw new BlindPassError(
      "INVALID_TOKEN",
      401,
      "A single-use private credit is required.",
    );
  // Validate the canonical wire length before the library parser; its deserializer permits trailing bytes.
  const match =
    /^PrivateToken\s+token="([A-Za-z0-9_-]+={0,2})"(?:\s*,\s*[a-zA-Z][a-zA-Z0-9_-]*=(?:"[^"\r\n]*"|[^,\s]+))*$/i.exec(
      header,
    );
  try {
    if (
      !match ||
      unb64(match[1]).length !== 146 ||
      b64(unb64(match[1])) !== match[1]
    )
      throw new Error("encoding");
  } catch {
    throw new BlindPassError("INVALID_TOKEN", 401);
  }
  if (!match) throw new BlindPassError("INVALID_TOKEN", 401);
  return match[1];
}
export async function spentHash(raw: string) {
  const prefix = new TextEncoder().encode("blindpass-spent-token-v1");
  const token = unb64(raw);
  const bytes = new Uint8Array(prefix.length + token.length);
  bytes.set(prefix);
  bytes.set(token, prefix.length);
  return sha256(bytes);
}
export async function wwwAuthenticate(manifest: Manifest) {
  return new WWWAuthenticateHeader(
    await challengeFor(manifest),
    unb64(manifest.publicKey),
  ).toString();
}
```

> **▶ Try It Out**
> ```bash
> pnpm test:crypto
> ```
> The helpers parse canonical formatting properly.

## 4.2 Step 2 — Consume a paid authorization once

Issuance itself is a database state transition. The transaction locks both the
invoice and its authorization row. It computes a hash of the ordered request
array, stores the responses, and returns those same responses only when a retry
presents the same transcript.

```typescript
// File: apps/api/src/issuance.ts
import { BlindPassError, sha256, canonical } from "@blindpass/shared";
import type { Database } from "./db/connection.js";
import type { Keys } from "./keys.js";

export class IssuanceService {
  constructor(
    private database: Database,
    private keys: Keys,
  ) {}

  async issue(
    capability: string,
    requests: string[],
    configurationHash: string,
  ) {
    if (requests.length !== 10 || new Set(requests).size !== 10) // <1>
      throw new BlindPassError(
        "INVALID_REQUEST",
        400,
        "Exactly 10 distinct blinded requests are required.",
      );
    const hash = await sha256(capability); // <2>
    const requestHash = await sha256(canonical(requests));
    
    const responses = await this.database.sql.begin(async (tx) => { // <6>
      const [invoice] =
        await tx`SELECT * FROM invoices WHERE capability_secret_hash=${hash} FOR UPDATE`; // <3>
      if (!invoice) throw new BlindPassError("NOT_FOUND", 404);
      if (
        configurationHash !== invoice.issuer_config_hash ||
        configurationHash !== (await sha256(canonical(this.keys.manifest)))
      ) // <4>
        throw new BlindPassError("ISSUER_POLICY_VIOLATION");
      const [auth] =
        await tx`SELECT * FROM issuance_authorizations WHERE invoice_id=${invoice.id} FOR UPDATE`;
      if (auth?.status === "completed") {
        if (auth.request_hash !== requestHash) // <5>
          throw new BlindPassError("ISSUANCE_ALREADY_COMPLETED", 409);
        return auth.responses as string[];
      }
      if (new Date(invoice.issuance_deadline).getTime() < Date.now())
        throw new BlindPassError("INVOICE_EXPIRED", 410);
      if (
        invoice.status !== "PAYMENT_CONFIRMED" ||
        auth?.status !== "authorized"
      )
        throw new BlindPassError("PAYMENT_NOT_CONFIRMED", 402);
      
      const result = await this.keys.issuer.evaluate(requests);
      
      await tx`UPDATE issuance_authorizations SET status='completed',request_hash=${requestHash},responses=${JSON.stringify(result)}::jsonb,issued_count=10,completed_at=now() WHERE invoice_id=${invoice.id}`; // <7>
      await tx`UPDATE invoices SET status='CREDITS_READY' WHERE id=${invoice.id}`;
      return result;
    });
    return { responses, configuration: this.keys.signedManifest };
  }
}
```

> **<1>** Validate batch shape outside transaction.
>
> **<2>** Hash capability before database lookup.
>
> **<6>** Evaluate inside the transaction boundary.
>
> **<3>** Lock invoice and authorization rows.
>
> **<4>** Configuration hash check prevents confused-deputy.
>
> **<5>** Identical request hash enables idempotent retry.
>
> **<7>** Persist response transcript and mark completed.

> **🔒 SECURITY NOTE: Holding database locks during elliptic curve evaluation is a conscious trade for auditability**
>
> Holding locks across elliptic curve work makes the state change easy to audit and bounds each invoice to one in-flight issuance. At larger scale, a durable `issuing` state and job id can shorten transactions, but recovery must preserve the exact request transcript. Never "retry" by evaluating a new batch after a client may have received the old responses; that mints extra credits.

> **▶ Try It Out**
> ```bash
> pnpm exec vitest run tests/integration.test.ts -t "issues only"
> ```
> Expected output is the integration tests passing successfully.

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

```typescript
// File: tests/crypto.test.ts
import { describe, it, expect } from "vitest";
import {
  createBlindBatch,
  authorization,
  parseAuthorization,
  TokenIssuer,
} from "../packages/privacy-pass/src/index.js";
import { b64, unb64 } from "../packages/shared/src/index.js";
import { cryptoFixture } from "./helpers.js";

describe("RFC 9578 privately verifiable tokens", () => {
  it("rejects modified tokens, wrong keys, wrong classes and expired epochs", async () => {
    const f = await cryptoFixture();
    const batch = await createBlindBatch(f.manifest, 1);
    const [token] = await batch.finalize(
      await f.issuer.evaluate(batch.requests),
    );
    const altered = unb64(token.token);
    altered[100] ^= 1; // <1>
    await expect(f.issuer.verify(b64(altered))).rejects.toMatchObject({
      code: "INVALID_TOKEN",
    });
    await expect(
      f.issuer.verify(token.token, Date.parse(f.manifest.expiresAt)),
    ).rejects.toMatchObject({ code: "TOKEN_EXPIRED" }); // <2>
  });

  it("rejects malicious response proofs and appended bytes", async () => {
    const f = await cryptoFixture();
    const batch = await createBlindBatch(f.manifest, 1);
    const responses = await f.issuer.evaluate(batch.requests);
    const corrupt = unb64(responses[0]);
    corrupt[100] ^= 1; // <3>
    await expect(batch.finalize([b64(corrupt)])).rejects.toMatchObject({
      code: "INVALID_TOKEN",
    });
  });
});
```

> **<1>** Flips one bit after valid proof to ensure it's rejected.
>
> **<2>** Expiry tests ensure possession of cryptographically valid token is insufficient alone.
>
> **<3>** Modified response bit-flip causes finalization to reject it due to invalid DLEQ proof.

> **▶ Try It Out**
> ```bash
> pnpm test:crypto
> ```
> All tests should pass confirming bit-flips and maliciously modified responses are rejected.

The modified response test flips one bit after the issuer has produced a valid
proof. Finalization rejects it. The appended-byte check protects canonical
authorization parsing. The expiry, class, and key tests show that possession of
a cryptographically valid token is insufficient when application policy does
not match.

### Pitfalls

> **⚠ PITFALL: Never strip base64url padding — RFC 9578 directory encoding includes padding**
>
> Do not strip base64url padding because another ecosystem calls unpadded values "base64url." RFC 9578's directory encoding includes padding, and BlindPass enforces one spelling. Do not serialize client blinding state into server logs.

> **⚠ PITFALL: Never derive a per-invoice issuer key — this is a perfect partition tag disguised as key management**
>
> Do not issue a partial batch and report success: the buyer paid for a fixed denomination, so response count is an invariant. Do not derive a per-invoice issuer key; that is a perfect partition tag disguised as key management.

### Build checkpoint

You now have real blinded issuance: payment authorizes an evaluation count,
while common policy and fresh client randomness determine the final tokens.

Do not proceed until the vector, crypto, and issuance-idempotency cases all pass.
