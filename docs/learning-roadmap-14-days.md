# BlindPass Engineering Bootcamp

## Build and understand private paid access in 14 days

**Audience:** programmers who want to understand BlindPass deeply enough to build a smaller implementation, review the real code, debug it, and defend the design in front of technical judges.

**Duration:** 14 days, 6–8 focused hours per day, approximately 95 hours total.

**Approach:** theory, source-code tracing, hands-on implementation, adversarial testing, and daily presentation practice.

**End result:** a minimal working BlindPass core consisting of a TypeScript client, Fastify API, PostgreSQL database, mock Zcash payment watcher, RFC 9578 Privacy Pass issuance, encrypted local credential store, protected resource endpoint, replay protection, issuer-policy enforcement, and a technical demo. The existing BlindPass repository is your reference implementation and answer key.

This course intentionally does **not** ask you to build another polished web application. The engineering lab concentrates on the protocol, backend, client library, database, CLI and security boundaries. Use the existing Next.js application only for the final visual demonstration.

Sources and repository behavior were reviewed on **September 21, 2026**. The repository pins `@cloudflare/privacypass-ts@0.9.0` and `@cloudflare/voprf-ts@1.0.0`; use the APIs installed in this repository rather than assuming examples from another release are identical.

---

## 1. What “building from scratch” means here

You will build the application logic and protocol composition yourself:

- typed application messages and validation;
- invoice and offer models;
- payment state transitions;
- the payment-watcher interface;
- signed invoice and issuer-manifest documents;
- a thin wrapper around an established Privacy Pass implementation;
- issuance authorization and idempotency;
- encrypted credential storage;
- token verification and domain-separated spent-token hashing;
- atomic reservation and replay prevention;
- protected fixed-cost resource middleware;
- malicious-configuration defenses;
- structured, privacy-preserving errors and logs;
- concurrency, forgery, replay and policy tests.

You will **not** implement any of the following primitives yourself:

- elliptic-curve point arithmetic;
- hash-to-curve;
- VOPRF or DLEQ proof construction;
- Orchard circuits, note encryption or transaction construction;
- Bech32m or Unified Address cryptography;
- Tor protocol internals.

That is not a shortcut. Correct cryptographic engineering normally means understanding the construction, choosing a reviewed implementation, keeping the boundary small, testing the integration and refusing to invent replacement primitives.

The central design invariant is:

> Payment proves that someone purchased a batch. A blind credential proves that a holder may perform one operation. Normal redemption must not carry a cryptographic identifier that tells the merchant which invoice produced that credential.

---

## 2. Competencies you should have after two weeks

You should be able to:

1. Draw the complete purchase, issuance and redemption sequence without notes.
2. Explain what RFC 9576, RFC 9577, RFC 9578 and RFC 9497 each contribute.
3. Explain the simplified VOPRF algebra and the purpose of proof verification without claiming to have designed the primitive.
4. Trace a token from local request generation through issuance, finalization, storage, HTTP authorization and server verification.
5. Explain why privately verifiable tokens require issuer secret-key access during redemption.
6. Explain why cryptographic validity alone cannot stop replay.
7. Implement an atomic one-winner redemption transaction and test twenty simultaneous replays.
8. Explain Orchard, Unified Addresses, incoming viewing capability, ZIP-321 payment requests, confirmations and reorgs at an integration-engineering level.
9. Build a deterministic payment simulator without presenting it as real Zcash verification.
10. Define a real scanner adapter that does not require the API server to hold a spending key.
11. Sign and verify operational documents with Ed25519 and explain why that signature is separate from Privacy Pass.
12. Encrypt local bearer credentials and explain the remaining endpoint-compromise risk.
13. Detect invoice-specific issuer keys, expirations, classes and key IDs.
14. Distinguish payment privacy, issuance/redemption unlinkability and network anonymity.
15. Present the product accurately, including what is simulated, what is cryptographically real and what remains an operational assumption.

---

## 3. Prerequisites and setup

### Required programming background

You should already be comfortable with:

- functions, objects, arrays and classes;
- `async`/`await` and promises;
- TypeScript types and interfaces;
- HTTP requests and JSON;
- basic SQL queries;
- Git commits and branches;
- running commands in a terminal.

If any of these are weak, spend the evening before Day 1 on:

- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
- [MDN HTTP overview](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview)
- [PostgreSQL tutorial](https://www.postgresql.org/docs/current/tutorial.html)

### Required tools

- Node.js 22 or later
- pnpm 9.10 or later
- Docker Compose
- PostgreSQL through the repository Compose file
- Git
- an editor with TypeScript support
- a notebook or Markdown engineering journal

### Establish a known-good reference

From the BlindPass repository:

```bash
pnpm install
docker compose up -d postgres
pnpm typecheck
pnpm test:crypto
```

When you want the full application:

```bash
pnpm dev
```

Do not use production ZEC, production issuer keys or real customer data during this course.

### Keep the lab separate from the answer key

Create a separate working directory or Git worktree for your learning implementation. A suitable lab structure is:

```text
blindpass-core-lab/
├── src/
│   ├── api/
│   ├── client/
│   ├── crypto/
│   ├── db/
│   ├── payments/
│   └── shared/
├── tests/
├── migrations/
├── package.json
├── tsconfig.json
└── README.md
```

Use the real repository only after attempting each task. Comparing your design with an answer key is useful; copying it before reasoning about the problem is not.

### Suggested dependencies for the lab

Use the same categories as the reference project:

```bash
pnpm add fastify zod postgres drizzle-orm \
  @cloudflare/privacypass-ts@0.9.0 @cloudflare/voprf-ts@1.0.0
pnpm add -D typescript tsx vitest @types/node
```

Add CLI or proxy libraries only on the day they are needed.

### Strict compiler baseline

Use strict TypeScript. At minimum:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true
  }
}
```

Avoid `any`. Validate every network or database boundary rather than trusting a TypeScript assertion.

---

## 4. The system you will build

Your lab implements one offer:

```text
Offer:       10 private searches
Price:       0.01 ZEC
Token class: search-v1
Batch size:  10
```

The flow is:

```text
External wallet
    │
    │ shielded ZEC described by a ZIP-321 request
    ▼
Merchant receiving wallet
    │
    │ incoming-payment observation
    ▼
Payment watcher ──► invoice state ──► one issuance authorization
                                         │
Client: create 10 blinded requests       │
                 │                       │
                 └──── issuer evaluates ◄┘
                           │
Client: verify proof, finalize and encrypt 10 credentials

Later:

credential ──► cryptographic verification ──► atomic reservation
                                                   │
                                                   ▼
                                             fixed-cost search
                                                   │
                                                   ▼
                                               mark spent
```

Required database separation:

```text
invoices ──► issuance_authorizations

redeemed_tokens
```

There must be no normal join from `redeemed_tokens` to `invoices`.

### Core invariants

Write these at the top of your lab README and turn them into tests:

1. Exactly one batch can be issued for one paid invoice authorization.
2. The issuer receives blinded requests, never final credentials during issuance.
3. A client stores credentials only after verifying and finalizing issuer responses.
4. All normal purchasers in an epoch use the same issuer key, token class and expiry policy.
5. Redemption carries no invoice capability or invoice ID.
6. Raw redeemed credentials are never stored.
7. One credential can commit at most one successful resource operation.
8. A failed resource operation releases the reservation when safely possible.
9. Mock payment status is always visibly labeled as simulated.
10. Logs never contain authorization headers, capabilities, tokens, blind state, wallet keys or queries.

---

## 5. Daily working method

Use this seven-hour template. Breaks are not included.

| Block | Duration | Work |
| --- | ---: | --- |
| Recall | 30 min | Reconstruct yesterday’s flow without notes. |
| Theory | 90 min | Read the assigned primary sources and write definitions. |
| Source trace | 60 min | Follow one boundary in the reference repository. |
| Build | 180 min | Implement the day’s lab milestone yourself. |
| Test and attack | 75 min | Add positive, negative and concurrency tests. |
| Teach-back | 45 min | Record an explanation and answer the daily questions. |

If you have eight hours, use the additional hour for the advanced exercise. If you have only six, finish the required build and tests before optional reading.

Maintain a daily journal with:

```text
Problem being solved:
Security/privacy property:
What the client sees:
What the merchant sees:
Secret material involved:
Database state involved:
Failure and retry behavior:
What is standardized:
What is library behavior:
What is BlindPass policy:
Evidence from tests:
Remaining limitation:
My 90-second explanation:
```

Commit each day separately. Your Git history becomes evidence that you can build and explain the system incrementally.

---

# Week 1 — Build the cryptographic and backend core

## Day 1 — TypeScript, bytes, HTTP and trust boundaries

**Time:** 6.5–7.5 hours

### Objectives

- Establish the lab project and strict compiler settings.
- Understand bytes versus text and encoding versus encryption.
- Build a typed HTTP API skeleton.
- Create the project error model and boundary validation.
- Draw the complete trust-boundary map before implementing cryptography.

### Theory: 90 minutes

Study:

1. [TypeScript narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing.html)
2. [Zod documentation](https://zod.dev/)
3. [MDN HTTP overview](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview)
4. [Fastify validation and serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)
5. [RFC 4648 base encodings](https://www.rfc-editor.org/rfc/rfc4648.html), especially base64url

Learn these distinctions:

- A JavaScript string is not an arbitrary byte array.
- Base64url changes representation; it does not provide secrecy.
- TypeScript types disappear at runtime; untrusted JSON still needs validation.
- HTTP authentication presents evidence; application authorization decides what it permits.
- A bearer capability is usable by whoever possesses it.

### Source trace: 60 minutes

Read [packages/shared/src/index.ts](../packages/shared/src/index.ts).

Trace:

- `BlindPassError`
- `b64` and `unb64`
- `sha256`
- `canonical`
- `ManifestSchema`
- `Invoice`, `Offer` and `StoredCredential`

For each function or type, answer:

1. What enters?
2. What leaves?
3. Is it a byte boundary, trust boundary or policy boundary?
4. What malformed input should be rejected?

### Build: 3 hours

Implement:

1. `src/shared/errors.ts` with a closed union of machine-readable codes.
2. `src/shared/encoding.ts` with UTF-8, base64url and SHA-256 helpers.
3. `src/shared/schemas.ts` with `Offer`, `Invoice`, `Manifest` and API error schemas.
4. A Fastify server with:
   - `GET /api/health`
   - `GET /api/offers`
   - centralized error mapping
   - request IDs that are not persistent client identifiers
5. One enabled offer: `search-10`.

Use a stable error envelope:

```ts
type ErrorBody = {
  error: {
    code: ErrorCode;
    message: string;
  };
};
```

Do not include stack traces, tokens or request bodies in public errors.

### Tests and attack exercise: 75 minutes

Test:

- valid and invalid offer responses;
- unknown routes;
- malformed base64url;
- round-trip encoding of random bytes;
- JSON with unexpected fields;
- an error message that never includes supplied authorization text.

Attack exercise: submit `Authorization`, `Cookie`, query strings and fake credential material, then inspect logs. Fix any place where values leak.

### Deliverable

- Running API skeleton
- Strict TypeScript build
- Five or more tests
- Trust-boundary diagram

### Teach-back questions

1. Why does a TypeScript interface not validate an HTTP request?
2. Why must canonical bytes be defined before signing data?
3. Why is base64url not encryption?
4. What is the difference between identity authentication and possession-based authorization?

### Advanced hour

Implement property tests for `decode(encode(bytes)) === bytes` across random byte arrays and malformed padding cases. Compare canonical and noncanonical encodings.

---

## Day 2 — Threat modeling and privacy-preserving data architecture

**Time:** 6.5–7.5 hours

### Objectives

- Convert privacy claims into explicit adversaries and observations.
- Design the PostgreSQL schema around unlinkability.
- Create migrations and seed data.
- Prove structurally that redemption records cannot join to invoices.

### Theory: 90 minutes

Read:

1. [RFC 9576 — Privacy Pass Architecture](https://www.rfc-editor.org/rfc/rfc9576.html), Sections 1–4 and security considerations
2. [BlindPass threat model](threat-model.md)
3. [BlindPass privacy analysis](privacy.md)
4. [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)

Define precisely:

- confidentiality;
- anonymity;
- pseudonymity;
- unlinkability;
- unobservability;
- anonymity set;
- correlation evidence;
- cryptographic identifier versus metadata signal.

Build an actor matrix for:

- public blockchain observer;
- merchant;
- payment scanner;
- ISP;
- CDN or reverse proxy;
- passive network observer;
- malicious client;
- malicious issuer;
- compromised browser or CLI device.

Use columns for payment address, amount, invoice, blinded request, final token, token hash, source IP, timing, browser fingerprint and query.

### Source trace: 60 minutes

Read:

- [apps/api/src/db/schema.ts](../apps/api/src/db/schema.ts)
- [infra/migrations/001_initial.sql](../infra/migrations/001_initial.sql)
- [tests/architecture.test.ts](../tests/architecture.test.ts)

Pay special attention to the comment above `redeemed_tokens` and the absence of `invoice_id`.

### Build: 3 hours

Create tables:

```text
offers
invoices
invoice_payment_events
issuance_authorizations
issuer_epochs
redeemed_tokens
audit_events
```

Do not create users, accounts, profiles or server-side search history.

Minimum `redeemed_tokens` fields:

```sql
token_hash   text        not null,
issuer_epoch text        not null,
status       text        not null,
reserved_at  timestamptz not null default now(),
spent_at     timestamptz,
expires_at   timestamptz not null,
primary key (token_hash, issuer_epoch)
```

Create the PostgreSQL connection layer and a deterministic seed for the offer.

Write down the permitted relationships:

```text
offer -> invoice -> payment events
invoice -> one issuance authorization
issuer epoch -> public configuration

redeemed token -> epoch only
```

### Tests and attack exercise: 75 minutes

Write a test that queries `information_schema.columns` and fails if `redeemed_tokens` ever gains:

- `invoice_id`;
- `user_id`;
- `query`;
- `ip_address`;
- `raw_token`.

Write another test that searches redemption code for invoice-table access, or uses dependency injection so the redemption module has no invoice repository at all.

Attack exercise: imagine a developer asks for “a useful admin join showing which invoice used each token.” Write a technical explanation of why this would invalidate the product’s central architecture.

### Deliverable

- Migrated database
- Seeded offer
- Schema-invariant tests
- Completed observer matrix

### Teach-back questions

1. Can a system with no user table still correlate activity? Give three ways.
2. Does deleting a foreign key prove that a malicious merchant cannot retain a private log?
3. Why does `redeemed_tokens` retain the epoch but not the invoice?
4. If only one buyer exists, what privacy claim remains true and what practical claim becomes weak?

### Advanced hour

Write a data-retention policy covering database rows, reverse-proxy logs, scanner logs, backups and metrics. Separate cryptographic architecture from operational compliance.

---

## Day 3 — Applied cryptography for application engineers

**Time:** 7–8 hours

### Objectives

- Understand secure randomness, hashes, signatures, MACs, AEAD and KDFs.
- Implement operational invoice signing.
- Implement domain-separated token hashing.
- Build a small encrypted local record format.
- Learn which primitive solves which problem.

### Theory: 2 hours

Read:

1. [Node.js Web Crypto API](https://nodejs.org/download/release/latest-jod/docs/api/webcrypto.html)
2. [RFC 8032 — Ed25519](https://www.rfc-editor.org/rfc/rfc8032.html), introduction and security considerations
3. [NIST GCM guidance](https://csrc.nist.gov/pubs/sp/800/38/d/final), overview only
4. [OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)

Build a primitive map:

| Primitive | BlindPass use | What it does not provide |
| --- | --- | --- |
| CSPRNG | invoice capabilities, nonces, IVs | persistence or uniqueness by itself |
| SHA-256 | configuration fingerprints and spent-token hashes | secrecy for guessable inputs |
| Ed25519 | manifest and invoice integrity | credential blindness |
| HMAC | scanner webhook authentication | proof that a chain event is true |
| scrypt | password-to-key derivation | password recovery |
| AES-256-GCM | encrypted credential vault | safety from active same-origin code |
| VOPRF | blind credential issuance | replay tracking or network anonymity |

Understand domain separation:

```text
SHA-256("blindpass-spent-token-v1" || canonical_token_bytes)
```

The prefix prevents accidentally treating the same bytes as another hash domain. This is not password hashing, and a salt is not required for high-entropy random tokens used as database keys.

### Source trace: 60 minutes

Read:

- `canonical`, `verifySignature` and `fingerprint` in [shared helpers](../packages/shared/src/index.ts)
- [apps/api/src/keys.ts](../apps/api/src/keys.ts)
- [cli/src/vault.ts](../cli/src/vault.ts)
- [tests/vault.test.ts](../tests/vault.test.ts)

Identify the distinction between:

- merchant configuration-signing key;
- Privacy Pass issuer key;
- scanner webhook secret;
- local credential-encryption key.

### Build: 3 hours

Implement:

1. Deterministic canonical JSON for the limited JSON values you sign.
2. Ed25519 key generation, sign and verify helpers.
3. A signed invoice document structure.
4. `spentTokenHash(canonicalTokenBytes)` with domain separation.
5. A vault envelope containing:
   - version;
   - KDF parameters;
   - random salt;
   - random GCM IV;
   - ciphertext plus authentication tag.
6. Decrypt and schema-validate the plaintext only after authentication succeeds.

Never reuse a GCM IV with the same key. Never log plaintext, key bytes or failed-decryption input.

### Tests and attack exercise: 75 minutes

Test:

- signed document verifies;
- changing amount invalidates signature;
- changing key invalidates signature;
- key-order differences produce the same canonical bytes;
- same token produces the same spent hash;
- a one-byte token change produces a different hash;
- vault round trip succeeds;
- wrong passphrase fails;
- ciphertext modification fails authentication;
- two vault writes use different salts and IVs.

Attack exercise: replace secure randomness with `Math.random()` in a temporary test. Explain predictability, entropy and why passing a unit test would not make it safe.

### Deliverable

- Signed document helper
- Domain-separated hashing helper
- Authenticated encrypted vault prototype
- Primitive-purpose diagram

### Teach-back questions

1. Why does signing a manifest not hide it?
2. Why does an HMAC-authenticated webhook not independently prove an on-chain payment?
3. Why is AES-GCM preferable to encryption without authentication?
4. Why is a password KDF appropriate for a human passphrase but unnecessary for a random bearer token hash?

### Advanced hour

Write a key inventory with generation, storage, rotation, backup, compromise and destruction procedures for every secret in the system.

---

## Day 4 — Zcash payment engineering: Orchard, Unified Addresses and scanners

**Time:** 7–8 hours

### Objectives

- Understand Zcash at the level needed to integrate payments safely.
- Separate wallets, receivers, addresses, viewing capabilities and spending authority.
- Build a deterministic payment watcher and a real scanner adapter boundary.
- Implement invoice payment state transitions and reorg handling.

### Theory: 2 hours

Read in this order:

1. [BlindPass Zcash integration guide](zcash.md)
2. [The Orchard Book — Design](https://zcash.github.io/orchard/design.html)
3. [ZIP 316 — Unified Addresses and Unified Viewing Keys](https://zips.z.cash/zip-0316)
4. [ZIP 321 — Payment Request URIs](https://zips.z.cash/zip-0321)
5. [ZIP 315 — Wallet handling best practices](https://zips.z.cash/zip-0315)
6. [Zcash protocol specification](https://zips.z.cash/protocol/protocol.pdf), address/viewing-key overview only

Understand these terms:

- note;
- commitment and nullifier at a conceptual level;
- shielded pool;
- Orchard receiver;
- Unified Address;
- diversifier and diversified address;
- incoming viewing capability;
- full viewing capability;
- spending key;
- block height;
- confirmation;
- chain reorganization.

A merchant may know which incoming payment corresponds to its own invoice because it created the payment destination. The relevant claim is not “the merchant cannot see its payment.” The public-chain observer has a different view from the receiving merchant and scanner.

### Source trace: 60 minutes

Read:

- [packages/zcash/src/index.ts](../packages/zcash/src/index.ts)
- [packages/zcash/src/scanner.ts](../packages/zcash/src/scanner.ts)
- [tests/scanner.test.ts](../tests/scanner.test.ts)
- payment state handling in [apps/api/src/invoices.ts](../apps/api/src/invoices.ts)

Map where address derivation ends and application state begins.

### Build: 3 hours

Define:

```ts
interface PaymentWatcher {
  createInvoice(input: {
    invoiceId: string;
    amount: string;
  }): Promise<{
    address: string;
    paymentUri: string;
  }>;

  getInvoice(invoiceId: string): Promise<PaymentObservation | null>;
  subscribe(handler: (event: PaymentEvent) => Promise<void>): () => void;
}
```

Implement two adapters:

1. **Development watcher**
   - deterministic, obviously non-payable addresses;
   - explicit `simulated: true` state;
   - commands/events for detected, confirmed and reorged payment;
   - no fabricated transaction-verification language.

2. **Scanner HTTP boundary**
   - creates an address through an external scanner;
   - accepts a signed webhook;
   - validates schema, timestamp, event ID and HMAC;
   - treats the scanner as a trusted observation source;
   - never accepts a spending key;
   - never logs incoming viewing capability or API credentials.

Build a ZIP-321 request containing the address and fixed amount. Leave the memo empty by default. Do not encode invoice identity in amount or memo.

Implement payment states:

```text
WAITING_FOR_PAYMENT
  -> PAYMENT_DETECTED
  -> WAITING_FOR_CONFIRMATION
  -> PAYMENT_CONFIRMED

Before issuance:
  confirmed -> PAYMENT_REORGED and authorization revoked

After issuance:
  record merchant risk; issued bearer credentials cannot be selectively revoked
```

### Tests and attack exercise: 75 minutes

Test:

- correct fixed amount;
- underpayment rejected;
- zero confirmations means detected only;
- confirmation threshold creates one authorization;
- duplicate webhook is idempotent;
- bad HMAC rejected;
- stale webhook rejected;
- pre-issuance reorg revokes authorization;
- post-issuance reorg increments an audit counter rather than pretending tokens disappeared;
- invoice expiry prevents authorization.

Attack exercise: place an invoice ID in a memo and use a unique amount such as `0.01000081`. Explain how both choices harm privacy and remove them.

### Deliverable

- `PaymentWatcher` abstraction
- Functional mock watcher
- Authenticated scanner boundary
- Payment state-machine tests
- Zcash capability diagram

### Teach-back questions

1. Why should the API server not hold the merchant spending key?
2. What can an incoming viewing capability reveal?
3. Why does a QR code not prove a payment happened?
4. Why can a post-issuance reorg become merchant risk?
5. Why are unique amounts poor invoice identifiers in this design?

### Advanced hour

Write a testnet runbook describing how a separately operated scanner would derive an Orchard-capable Unified Address, observe a payment, count confirmations and call the webhook. Do not fabricate an integration if no compatible scanner is available.

---

## Day 5 — Privacy Pass architecture and wire protocol

**Time:** 7–8 hours

### Objectives

- Understand the roles and flows defined by Privacy Pass.
- Read standards as an implementer rather than memorizing acronyms.
- Understand the `PrivateToken` HTTP scheme.
- Trace RFC 9578 token type `0x0001` byte structures.
- Design the application policy around the standardized token.

### Theory: 2.5 hours

Read:

1. [RFC 9576 — Privacy Pass Architecture](https://www.rfc-editor.org/rfc/rfc9576.html)
2. [RFC 9577 — Privacy Pass HTTP Authentication Scheme](https://www.rfc-editor.org/rfc/rfc9577.html)
3. [RFC 9578 — Privacy Pass Issuance Protocols](https://www.rfc-editor.org/rfc/rfc9578.html), Sections 3–5 and 8.2.1

Create a standards map:

| Document | Responsibility |
| --- | --- |
| RFC 9576 | actors, architecture, privacy goals, deployment considerations |
| RFC 9577 | HTTP challenge and `Authorization: PrivateToken ...` transport |
| RFC 9578 | token issuance, finalization, verification and issuer directory |
| RFC 9497 | OPRF/VOPRF construction used by private verification |

The logical actors are:

- **Client:** blinds, finalizes, stores and later redeems a token.
- **Origin:** protects a resource and asks for a token.
- **Issuer:** evaluates token requests and verifies privately verifiable tokens.
- **Attester:** decides whether a client is eligible for issuance in some deployments.

In BlindPass, confirmed payment is the application evidence that authorizes issuance. Do not claim that a separate standardized attestation protocol is implemented.

### Wire-format exercise

For token type `0x0001`, RFC 9578 defines:

```text
TokenRequest:
  token_type                2 bytes
  truncated_token_key_id    1 byte
  blinded_msg              49 bytes for compressed P-384 element
  total                    52 bytes

TokenResponse:
  evaluate_msg             49 bytes
  proof                    96 bytes (two 48-byte scalars)
  total                   145 bytes

Token:
  token_type                2 bytes
  nonce                    32 bytes
  challenge_digest         32 bytes
  token_key_id             32 bytes
  authenticator            48 bytes
  total                   146 bytes
```

Verify these lengths against the RFC and the pinned library rather than treating this table as a replacement for the standard.

The token input is conceptually:

```text
0x0001 || nonce || SHA-256(challenge) || token_key_id
```

The BlindPass application challenge binds common policy such as token class, epoch and expiry. It must not include an invoice ID or buyer-specific timestamp.

### Source trace: 60 minutes

Read [packages/privacy-pass/src/index.ts](../packages/privacy-pass/src/index.ts) once without editing it.

Trace:

- `challengeFor`
- `createBlindBatch`
- `TokenIssuer.evaluate`
- `TokenIssuer.verify`
- `authorization`
- `parseAuthorization`
- `wwwAuthenticate`

Mark each line as one of:

- standard wire/protocol behavior;
- library call;
- BlindPass application policy;
- defensive parsing.

### Build: 2.5 hours

Before using the real crypto library, implement only the surrounding types:

- signed issuer manifest;
- token challenge policy input;
- batch request envelope;
- batch response envelope;
- authorization-header parser boundary;
- strict maximum batch size of ten;
- rejection of unexpected fields and lengths.

Do **not** implement a fake final token generator. Leave cryptographic functions throwing `NOT_IMPLEMENTED` until Day 6. This keeps the distinction between transport scaffolding and cryptographic issuance honest.

### Tests and attack exercise: 60 minutes

Test strict parsing for:

- missing authorization;
- wrong scheme;
- malformed quotes;
- invalid base64url;
- trailing bytes;
- incorrect token type;
- request batch of 9 or 11;
- unexpected JSON properties;
- oversized body.

Attack exercise: design a challenge containing `invoice_81`. Explain exactly how that would let the merchant recognize the resulting token class at redemption, then replace it with common policy.

### Deliverable

- Protocol role diagram
- Wire-format worksheet
- Strict transport types and parsers
- Written separation of standard, library and application policy

### Teach-back questions

1. Why are issuer, origin and attester logical roles rather than necessarily different companies?
2. What does RFC 9577 standardize that RFC 9578 does not?
3. Why is the one-byte key ID truncated in the request?
4. Why can application-specific metadata damage unlinkability even when the VOPRF is correct?

### Advanced hour

Compare the privately verifiable type `0x0001` with the publicly verifiable Blind RSA type in RFC 9578. Explain the verifier-key and deployment tradeoffs without changing the lab implementation.

---

## Day 6 — VOPRF theory and real library integration

**Time:** 7.5–8 hours

### Objectives

- Understand the mathematical shape of the VOPRF flow.
- Understand the purpose of the DLEQ proof.
- Integrate the established Cloudflare implementation.
- Complete one real issue/finalize/verify cycle.
- Verify negative cases and a published reference vector.

### Theory: 2.5 hours

Read:

1. [RFC 9497 — OPRFs Using Prime-Order Groups](https://www.rfc-editor.org/rfc/rfc9497.html), Sections 1–4, VOPRF mode and security considerations
2. [RFC 9578 Section 5](https://www.rfc-editor.org/rfc/rfc9578.html#section-5)
3. [Cloudflare `privacypass-ts`](https://github.com/cloudflare/privacypass-ts)
4. [Cloudflare `voprf-ts`](https://github.com/cloudflare/voprf-ts)
5. [BlindPass cryptography guide](cryptography.md)

### Mathematical model

Let:

- `G` be a generator of a prime-order group of order `q`;
- issuer secret scalar be `k`;
- issuer public key be `K = kG`;
- client input be `x`;
- `M = HashToGroup(x)`;
- client choose nonzero random blinding scalar `r`.

A simplified intuition is:

```text
Client: B = rM
Issuer: Z = kB
Client: r^-1 Z = kM
```

The issuer sees `B`, not `M`. The client obtains the keyed group result after unblinding.

For VOPRF mode, the issuer also returns a proof establishing consistency between the issuer public key and evaluated element. Conceptually, it proves equality of discrete-log relationships:

```text
log_G(K) = log_B(Z)
```

The actual RFC proof construction includes transcripts, hash-to-scalar, serialization and batch details. The simplified equations are for reasoning only.

The proof establishes consistent evaluation under the expected key. It does **not** prove:

- that payment happened;
- that every buyer received the same configuration;
- that a token has not already been spent;
- that the network connection is anonymous;
- that the device is uncompromised.

### Required security properties

Be able to distinguish:

- **input secrecy/blindness:** the issuer does not learn the client input from issuance;
- **unlinkability:** later learning a token input does not identify which issuance transcript produced it under the protocol assumptions;
- **verifiability:** the client detects evaluation inconsistent with the expected issuer key;
- **unforgeability/pseudorandomness:** clients cannot generate valid outputs without issuer evaluation beyond their authorization.

Do not use these terms interchangeably.

### Source trace: 60 minutes

Read:

- [packages/privacy-pass/src/provider.ts](../packages/privacy-pass/src/provider.ts)
- [packages/privacy-pass/src/index.ts](../packages/privacy-pass/src/index.ts)
- [tests/crypto.test.ts](../tests/crypto.test.ts)
- [tests/vectors.test.ts](../tests/vectors.test.ts)
- [tests/vectors/README.md](../tests/vectors/README.md)

Follow the exact pinned library calls. Do not invent methods from memory.

### Build: 2.5 hours

Create a small auditable wrapper with only these responsibilities:

```ts
type BlindBatch = {
  requests: string[];
  finalize(responses: string[]): Promise<StoredCredential[]>;
};

function createBlindBatch(manifest: Manifest, count: 10): Promise<BlindBatch>;

class TokenIssuer {
  evaluate(requests: string[]): Promise<string[]>;
  verify(token: string, now?: number, tokenClass?: string): Promise<void>;
}
```

Use the installed library flow:

```text
new privateVerif.Client()
client.createTokenRequest(challenge, publicKey)
issuer.issue(parsedRequest)
client.finalize(parsedResponse)
issuer.verify(token)
```

Enforce canonical lengths and encodings around the library. Never log:

- blind state;
- token inputs;
- raw requests if policy forbids them;
- final token bytes;
- issuer private key.

Generate ten clients, because each request has its own local blinding state. Finalize responses in the corresponding order.

### Tests and attack exercise: 75 minutes

Required tests:

- one blind request is created;
- ten requests are independent;
- issuance response finalizes successfully;
- finalized token verifies;
- changed token byte fails;
- wrong issuer key fails;
- changed proof fails finalization;
- missing response fails the entire batch;
- swapped response order fails;
- wrong challenge/class fails;
- official or published reference-vector bytes match where available.

Attack exercise: change the implementation to have the server generate ten random signed strings. Explain why it may provide authorization but loses blind issuance and permits direct invoice-to-token logging.

### Deliverable

- Real RFC 9578 type `0x0001` wrapper
- Passing cryptographic negative tests
- Mathematical derivation in your own words
- Clear explanation of private verification

### Teach-back questions

1. Why can the issuer evaluate `B` without learning `M`?
2. What consistency does the DLEQ proof provide?
3. Why does finalization need local blind state?
4. Why does the privately verifiable origin need issuer secret-key capability?
5. Why does proof verification not prove payment?

### Advanced hour

Trace every byte of one RFC test vector: key, request, response, proof, nonce, challenge digest and authenticator. Do not expose live credentials; use only published test data.

---

## Day 7 — Issuance service without payments and the 10,000-cycle gate

**Time:** 7–8 hours

### Objectives

- Build the issuer manifest and directory endpoint.
- Implement idempotent batch issuance without the payment layer.
- Ensure the server never receives final credentials during issuance.
- Stress the actual cryptographic path before adding business state.

### Theory: 75 minutes

Review:

- RFC 9578 issuer configuration and well-known directory;
- idempotency versus replay;
- at-most-once authorization consumption;
- retry safety when a response is lost;
- client state loss after server commitment.

Understand this failure case:

```text
client creates blinded batch A
server evaluates A and commits responses
network response is lost

safe retry: client resubmits exactly A and receives stored responses
unsafe retry: client creates new batch B and receives another ten tokens
```

### Source trace: 60 minutes

Read:

- [apps/api/src/issuance.ts](../apps/api/src/issuance.ts)
- [apps/api/src/keys.ts](../apps/api/src/keys.ts)
- issuance sections in [tests/integration.test.ts](../tests/integration.test.ts)
- [tests/stress.ts](../tests/stress.ts)

Identify the request hash, stored response and authorization state.

### Build: 3 hours

Implement:

1. An issuer epoch with:
   - epoch identifier;
   - public key;
   - key ID;
   - valid-from time;
   - issuance end;
   - verification grace end.
2. A signed manifest.
3. `GET /.well-known/private-token-issuer-directory` or a clearly documented standards-compatible equivalent plus application manifest endpoint.
4. A temporary development authorization with exactly ten credits.
5. `POST /api/issuance` accepting exactly ten blinded requests.
6. Request hashing and response persistence for idempotent retry.
7. Rejection of a different second batch.

The database may store blinded requests or their hash and evaluated responses for retry. It must not store final credentials, which do not yet exist on the server.

Document that a JSON array of ten independent requests is an application envelope. Do not call it the generic batched-token draft unless you implement that specification.

### Tests and stress exercise: 90 minutes

Test:

- one authorized batch succeeds;
- same batch retry returns the same responses;
- different batch retry returns `ISSUANCE_ALREADY_COMPLETED`;
- unauthorized issuance fails;
- wrong batch size fails;
- malformed request fails without consuming authorization;
- response/proof failure causes the client to store zero credits;
- server-side logs contain no final tokens.

Then run a loop of real issue/finalize/verify operations. Start at 100, then 1,000, then 10,000. Record:

- total time;
- success count;
- memory behavior;
- whether any mock signer or bypass entered the path.

The reference command is:

```bash
pnpm test:stress
```

Your own lab can use a smaller count while debugging, but the final gate is 10,000 real cycles.

### Deliverable

- Issuer configuration endpoint
- Idempotent issuance API
- 10,000-cycle evidence
- Week-one architecture diagram

### Week-one oral exam

Explain for ten minutes without notes:

1. The difference between payment authorization and token verification.
2. The exact data the issuer sees during issuance.
3. Why final tokens are not present in issuer storage.
4. The simplified VOPRF flow and proof purpose.
5. Why a valid token can still be replayed unless application state exists.

If any answer depends on “the library handles it,” return to Day 6 and identify what the library handles and what your wrapper enforces.

---

# Week 2 — Turn the cryptographic core into a reliable product

## Day 8 — Atomic redemption, concurrency and failure semantics

**Time:** 7–8 hours

### Objectives

- Separate token authenticity from one-time-use state.
- Understand PostgreSQL concurrency behavior.
- Implement an atomic reservation/spend transaction.
- Prove that one of twenty concurrent requests wins.
- Define safe behavior when resource work fails.

### Theory: 2 hours

Read:

1. [PostgreSQL transaction isolation](https://www.postgresql.org/docs/17/transaction-iso.html)
2. [PostgreSQL `INSERT ... ON CONFLICT`](https://www.postgresql.org/docs/current/sql-insert.html)
3. [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)

Study the unsafe pattern:

```text
request A: SELECT token -> absent
request B: SELECT token -> absent
request A: perform work
request B: perform work
request A: INSERT spent
request B: INSERT spent fails too late
```

Then study the reservation pattern:

```text
verify cryptography
BEGIN
  INSERT token_hash, epoch, status='reserved' ON CONFLICT DO NOTHING
  if no row returned: TOKEN_ALREADY_SPENT
  perform transaction-compatible resource work
  UPDATE status='spent'
COMMIT
```

The unique key is the concurrency primitive. A process-local mutex is insufficient when multiple API instances exist.

### Source trace: 60 minutes

Read:

- [packages/blindpass-server/src/index.ts](../packages/blindpass-server/src/index.ts)
- [tests/replay.test.ts](../tests/replay.test.ts)
- [tests/search.test.ts](../tests/search.test.ts)

Identify when verification occurs, when reservation occurs and what rollback does.

### Build: 3 hours

Implement:

1. Strict RFC 9577 authorization parsing.
2. Cryptographic verification against active and grace-period issuer epochs.
3. Token-class and expiry checks.
4. Domain-separated token hash.
5. `RedemptionService.redeem(header, work)`.
6. Status transitions `reserved -> spent`.
7. Rollback when `work` throws before a permanent external side effect.

Do not store the query or authorization header.

Think carefully about work inside the transaction. PostgreSQL rollback can undo database search/accounting work. It cannot unsend an email, uncall an external paid API or reverse an arbitrary external side effect. Those operations require idempotency keys, an outbox or a different commitment protocol.

### Tests and attack exercise: 90 minutes

Test:

- missing token;
- malformed token;
- valid token succeeds;
- modified token returns `INVALID_TOKEN`;
- wrong class returns `WRONG_TOKEN_CLASS`;
- expired token returns `TOKEN_EXPIRED`;
- previous epoch in grace succeeds;
- previous epoch after grace fails;
- second use returns `TOKEN_ALREADY_SPENT`;
- work failure rolls back reservation;
- retry after rollback succeeds.

Concurrency test:

```text
create one valid credential
send the same credential 20 times concurrently
assert exactly 1 success
assert exactly 19 TOKEN_ALREADY_SPENT responses
assert resource executed exactly once
```

Attack exercise: move resource execution before the insert and watch the concurrency test fail.

### Deliverable

- Atomic redemption service
- Twenty-way replay test
- Written external-side-effect limitation
- Query-free redemption storage

### Teach-back questions

1. Why can a cryptographically valid token return `TOKEN_ALREADY_SPENT`?
2. Under Read Committed, what happens when two inserts target the same unique key?
3. Why is checking before inserting unsafe?
4. When is transaction rollback insufficient for releasing a credit?

### Advanced hour

Design an outbox/idempotency model for a protected external API call. Clearly distinguish it from the simpler local-search transaction used in the MVP.

---

## Day 9 — Invoices, capabilities, signatures and payment authorization

**Time:** 7–8 hours

### Objectives

- Implement offers and invoices as explicit state machines.
- Use high-entropy invoice capabilities rather than sequential IDs for authorization.
- Sign invoice policy documents.
- Connect confirmed mock payment to exactly one issuance authorization.
- Handle expiry, duplicate events and reorgs.

### Theory: 90 minutes

Study:

- capability security;
- identifier versus authorization secret;
- hashing high-entropy capabilities at rest;
- operational signatures;
- state-machine invariants;
- idempotent event processing;
- payment deadline versus issuance deadline versus credential expiry.

An invoice ID names a row. A 256-bit random capability authorizes sensitive invoice operations. A final token authorizes one future resource operation. Do not reuse one value for all three jobs.

### Source trace: 60 minutes

Read:

- [apps/api/src/invoices.ts](../apps/api/src/invoices.ts)
- [apps/api/src/issuance.ts](../apps/api/src/issuance.ts)
- invoice/payment tests in [tests/integration.test.ts](../tests/integration.test.ts)

Trace the capability from generation to hash lookup. Trace the signed document separately.

### Build: 3 hours

Implement:

1. `POST /api/invoices` accepting `offerId`.
2. Random invoice ID for debugging/reference.
3. Random 32-byte capability returned once to the client.
4. SHA-256 capability hash stored in PostgreSQL.
5. Payment destination from `PaymentWatcher`.
6. Signed invoice document containing:
   - invoice ID;
   - offer ID;
   - amount;
   - credit count;
   - token class;
   - issuer-configuration hash;
   - payment address;
   - confirmation policy;
   - payment deadline;
   - issuance deadline;
   - refund policy.
7. `GET /api/invoices/:capability`.
8. Payment events that create one authorization at confirmation.
9. Issuance requiring both the capability and authorized state.

Return the capability to the client, but never log it or place it in analytics. Prefer a header or carefully handled path if production logs URLs; document the tradeoff in your lab.

### Tests and attack exercise: 90 minutes

Test:

- capability has at least 256 bits of CSPRNG entropy;
- only hash is stored;
- wrong capability returns not found;
- signed invoice verifies;
- modifying amount, address or configuration hash fails verification;
- pending payment cannot issue;
- confirmed payment can issue once;
- expired invoice cannot issue;
- duplicate confirmation does not add authorization;
- pre-issuance reorg revokes authorization;
- same blinded batch retry is safe;
- new batch retry is rejected.

Attack exercise: attempt to authorize using only `invoice_id`. Explain enumeration and why an identifier is not a capability.

### Deliverable

- Complete mock purchase-to-issuance flow
- Signed invoices
- Capability-based access
- Payment and issuance state-machine tests

### Teach-back questions

1. What does the invoice signature prove, and what does it not prove?
2. Why hash an invoice capability at rest?
3. Why are payment deadline, issuance deadline and token expiry different?
4. What failure occurs if the client loses blinding state after issuance commits?

### Advanced hour

Design, but do not silently implement, a recovery protocol for lost in-flight issuance state. Analyze double-issuance and unlinkability risks.

---

## Day 10 — Malicious issuer resistance and configuration transparency

**Time:** 7–8 hours

### Objectives

- Understand configuration partitioning as a tagging attack.
- Implement signed shared manifests and client pinning.
- Enforce common key, class, epoch and expiry.
- Build malicious-configuration tests.
- Understand the limit of trust on first use.

### Theory: 2 hours

Consider four malicious configurations:

```text
invoice A -> issuer key KA
invoice B -> issuer key KB

invoice A -> expiry 14:07:03
invoice B -> expiry 14:09:41

invoice A -> token class search-v1-invoice-A

invoice A -> unexpected key ID
```

Even if the token issuance is mathematically correct, these configurations partition credentials into small recognizable groups.

Separate:

1. **Merchant identity:** which Ed25519 signing identity is trusted?
2. **Issuer policy:** which token type, key, class, epoch and expiry are allowed?
3. **Cross-client consistency:** did Alice and Bob receive the same view?

A signature proves that the signing key approved a manifest. It does not prove the signer gave the same manifest to everyone.

### Source trace: 60 minutes

Read:

- `validateConfiguration` and issuance flow in [packages/blindpass-client/src/index.ts](../packages/blindpass-client/src/index.ts)
- [tests/policy.test.ts](../tests/policy.test.ts)
- first-use and partitioning sections in [threat model](threat-model.md)

### Build: 3 hours

Implement a client policy:

```ts
type IssuerPolicy = {
  issuer: string;
  tokenType: 1;
  tokenClass: "search-v1";
  epoch: string;
  expectedKeyId: string;
  expectedPublicKey: string;
  expectedExpiresAt: string;
  expectedSigningFingerprint: string;
};
```

Validation order:

1. Strictly parse signed manifest.
2. Verify Ed25519 signature.
3. Verify or bootstrap merchant signing fingerprint according to explicit policy.
4. Check token type.
5. Check issuer identity/origin scope.
6. Check token class.
7. Check epoch dates are the deterministic common dates for that epoch.
8. Check key ID and public key against trusted baseline.
9. Compare invoice configuration hash with the accepted manifest.
10. Only then generate blinded requests.

Reject with `ISSUER_POLICY_VIOLATION` without disclosing sensitive internal values.

### Tests and attack exercise: 90 minutes

Build correctly signed malicious manifests for:

- per-invoice issuer key;
- unique expiry;
- unexpected token class;
- unexpected key ID;
- changed origin scope;
- incorrect epoch dates;
- changed batch size;
- wrong merchant signing identity.

Every case must be rejected before storing credentials.

Then create a split-view scenario where two first-time clients receive two different manifests signed by the same merchant. Explain why trust-on-first-use alone may accept both. Document independent pinning or a future transparency log as the stronger control.

### Deliverable

- Signed shared manifest
- Pinned client policy
- Complete malicious-issuer test suite
- Written first-use limitation

### Teach-back questions

1. Why can a cryptographically valid token still violate privacy policy?
2. Why are common expiration and class important?
3. What does a merchant signature establish?
4. What does it fail to establish across clients?

### Advanced hour

Sketch an append-only configuration-transparency design with inclusion proofs, consistency proofs and gossip. Treat it as future work rather than claiming the MVP implements it.

---

## Day 11 — Client SDK, encrypted credential wallet and CLI

**Time:** 7–8 hours

### Objectives

- Build a client that owns blinding and finalization state.
- Store bearer credentials encrypted.
- Implement safe selection and removal semantics.
- Build essential CLI commands without printing secrets.
- Understand device and same-origin compromise.

### Theory: 90 minutes

Read:

1. [Node.js crypto documentation](https://nodejs.org/api/crypto.html), `scrypt`, random bytes and authenticated encryption
2. [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
3. [IndexedDB overview](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
4. [OWASP Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)

Learn:

- bearer credential theft model;
- encrypted at rest versus safe while unlocked;
- OS keyring versus passphrase fallback;
- file permission limits;
- browser same-origin trust;
- lost response ambiguity;
- no account-based recovery.

### Source trace: 60 minutes

Read:

- [packages/blindpass-client/src/index.ts](../packages/blindpass-client/src/index.ts)
- [cli/src/vault.ts](../cli/src/vault.ts)
- [cli/src/main.ts](../cli/src/main.ts)
- [apps/web/lib/vault.ts](../apps/web/lib/vault.ts)
- [tests/cli.test.ts](../tests/cli.test.ts)
- [tests/vault.test.ts](../tests/vault.test.ts)

### Build: 3 hours

Implement `BlindPassClient` methods:

```text
offers()
createInvoice(offerId)
invoice(capability)
issue(capability)
balance()
fetchWithCredit(path)
```

Issuance must:

1. fetch manifest;
2. verify signature and policy;
3. verify invoice configuration hash;
4. create blinded requests locally;
5. submit only blinded requests plus invoice capability;
6. finalize and verify locally;
7. atomically store all ten credentials only after the whole batch succeeds.

Build a CLI vault with:

- `~/.blindpass/` or an override for tests;
- directory mode `0700`;
- file mode `0600`;
- OS Secret Service when practical;
- otherwise an interactive passphrase-derived AES-GCM key;
- no plaintext fallback.

Build commands:

```text
offers
buy search-10
invoices
issue <invoice>
balance
inspect
```

Redact tokens and capabilities in all output. Show only counts, epoch, class, expiry and shortened fingerprints.

### Tests and attack exercise: 90 minutes

Test:

- vault permissions;
- encrypted bytes do not contain token text;
- wrong password fails;
- tampering fails;
- partial issuance stores zero credentials;
- ten valid credentials store atomically;
- balance counts unspent/unexpired credentials;
- inspect redacts values;
- clearing vault loses credentials as documented;
- concurrent CLI writes do not corrupt the file.

Attack exercise: assume malicious same-origin JavaScript can call the browser’s decryption API even when the key is non-extractable. Explain why non-extractability is useful but not a complete defense.

### Deliverable

- Working TypeScript client
- Encrypted CLI wallet
- Purchase and issuance commands
- Device-compromise explanation

### Teach-back questions

1. Why must blinding and finalization happen on the client?
2. What does a non-extractable browser key prevent?
3. What can active same-origin code still do?
4. Why can clearing browser data permanently remove credits?

### Advanced hour

Design a crash-safe vault update using a temporary file, `fsync`, atomic rename and a process lock. Do not use a predictable plaintext recovery file.

---

## Day 12 — Protected search, HTTP middleware, Tor and metadata privacy

**Time:** 7–8 hours

### Objectives

- Build a fixed-cost protected resource.
- Integrate RFC 9577 authorization with redemption middleware.
- Avoid persistent search history.
- Implement explicit, fail-closed Tor CLI transport.
- Build a privacy audit based on facts, not a fake score.

### Theory: 2 hours

Read:

1. [RFC 9577](https://www.rfc-editor.org/rfc/rfc9577.html) again, now alongside your implementation
2. [Tor SOCKS extensions](https://spec.torproject.org/socks-extensions)
3. [Tor Browser safety guidance](https://support.torproject.org/tor-browser/security/using-tb-safely/)
4. [BlindPass privacy guide](privacy.md)

Analyze these independent observations:

- source IP;
- request timing;
- TLS fingerprint;
- browser fingerprint;
- cookies;
- persistent identifiers;
- query contents;
- destination/provider identity;
- small anonymity set.

Cryptographic unlinkability removes a direct issuance/redemption matching handle. It does not erase these observations.

### Source trace: 60 minutes

Read:

- protected route assembly in [apps/api/src/app.ts](../apps/api/src/app.ts)
- [packages/blindpass-server/src/index.ts](../packages/blindpass-server/src/index.ts)
- [cli/src/tor.ts](../cli/src/tor.ts)
- [tests/tor.test.ts](../tests/tor.test.ts)
- [tests/search.test.ts](../tests/search.test.ts)

### Build: 3 hours

Implement:

1. A small local dataset of public technical documents.
2. `GET /api/search?q=...`.
3. One credential consumed per query.
4. Resource execution inside the safe transaction boundary.
5. Response:

```json
{
  "query": "privacy",
  "results": [],
  "creditConsumed": true
}
```

6. No server-side search-history table.
7. Logs that omit query string, IP and authorization header.
8. CLI `search "query"` command.
9. `--tor` using `socks5h://127.0.0.1:9050` or configured proxy.
10. Explicit Tor connectivity verification.
11. Failure with `TOR_NOT_AVAILABLE` rather than silent direct fallback.

Build `audit-privacy` with evidence-based output:

```text
PAYMENT
✓ common price
✓ empty default memo
✓ per-invoice address policy

CREDENTIALS
✓ shared issuer key
✓ shared class and epoch
✓ RFC 9578 VOPRF issuance
✓ invoice ID absent from token challenge

NETWORK
⚠ direct connection detected
Recommendation: use --tor
```

Do not compute an arbitrary privacy score.

### Tests and attack exercise: 90 minutes

Test:

- valid credential returns results and consumes one credit;
- replay fails;
- invalid token fails before search work;
- missing token fails;
- search failure rolls back reservation;
- no query is persisted;
- direct mode says direct;
- working Tor probe says connected;
- failed Tor probe stops request;
- hostname resolution is routed through the proxy configuration;
- no authorization header appears in logs.

Side-channel exercise:

```text
Payment:   14:02:31
Redemption:14:02:34
Source IP: same
Browser:   same persistent fingerprint
```

Explain why the merchant can infer a likely correlation without violating VOPRF unlinkability. Then evaluate delayed redemption, stripped cookies, common configuration and Tor separately.

### Deliverable

- Protected search route
- CLI redemption
- Fail-closed Tor mode
- Evidence-based privacy audit
- Side-channel explanation

### Teach-back questions

1. Why does the destination still see the query?
2. Why is `socks5h` preferable to resolving the hostname locally?
3. Why can timing correlate events without a token identifier?
4. Why must the UI never claim Tor is active based only on a toggle?

### Advanced hour

Read about Oblivious HTTP as future work and explain how it changes network visibility without replacing payment privacy or credential issuance.

---

## Day 13 — Production hardening, full testing and real Zcash boundary

**Time:** 7.5–8 hours

### Objectives

- Turn assumptions into explicit production requirements.
- Test the system across unit, integration, stress and E2E layers.
- Complete the real scanner contract and testnet runbook.
- Review key rotation, rate limits, observability and failure recovery.
- Produce an evidence-backed security review.

### Theory: 90 minutes

Study the difference between:

- unit test;
- integration test;
- reference-vector test;
- property test;
- concurrency test;
- stress test;
- E2E test;
- penetration test;
- independent cryptographic/security audit.

Passing tests are evidence for tested behavior, not proof that the entire deployment is secure.

Read:

- [deployment guide](deployment.md)
- [security policy](../SECURITY.md)
- [verification report](verification.md)
- [OpenAPI specification](openapi.yaml)

### Source trace: 60 minutes

Trace the production checks in:

- [apps/api/src/config.ts](../apps/api/src/config.ts)
- [tests/production.test.ts](../tests/production.test.ts)
- [tests/scanner.test.ts](../tests/scanner.test.ts)
- [tests/e2e/app.spec.ts](../tests/e2e/app.spec.ts)

### Build and harden: 3 hours

Implement or document:

1. Production refuses mock payment mode.
2. Production refuses default or missing issuer keys.
3. Scanner URL, API credential and webhook secret are explicit.
4. Admin/debug routes are disabled in production.
5. Rate limits exist on invoice and issuance endpoints.
6. Request/body size limits exist.
7. Logs use structured event names and aggregate counters only.
8. Authorization, capabilities, queries, IPs, keys and token material are redacted.
9. Active and previous issuer epochs load correctly.
10. Previous epoch verification stops after grace.
11. Month-boundary rotation has a runbook.
12. Database backups include issuer-state requirements but do not create hidden joins.
13. Health endpoints do not reveal secrets.
14. Graceful shutdown prevents half-finished in-process work where possible.

For the real Zcash boundary, produce:

- exact scanner request/response schemas;
- webhook signature algorithm;
- replay window;
- event-id idempotency;
- confirmation policy;
- reorg semantics;
- testnet environment variables;
- one real testnet transaction plan if compatible tooling is available.

Do not show “Zcash payment verified” unless a real scanner actually observed and validated it.

### Full test pass: 2 hours

Run, understand and repair failures:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:stress
pnpm build
pnpm test:e2e
pnpm audit --audit-level high
```

For each command, record:

- what property it tests;
- what it cannot test;
- environmental prerequisites;
- result and evidence.

### Security review exercise: 60 minutes

Create a table:

| Property | Mechanism | Test evidence | Remaining assumption |
| --- | --- | --- | --- |
| issuance blindness | RFC 9578 library + local finalization | crypto and vector tests | endpoint/client integrity |
| one-time use | unique DB reservation | 20-way replay test | authoritative shared PostgreSQL |
| payment authorization | scanner observation + state machine | fixture/webhook tests | scanner correctness |
| common policy | client pin and deterministic epoch | malicious-policy tests | trusted initial baseline |
| source-network reduction | explicit Tor proxy | fail-closed transport tests | Tor and endpoint behavior |

### Deliverable

- Passing full suite
- Production checklist
- Scanner/testnet runbook
- Security evidence matrix
- Honest known-limitations list

### Teach-back questions

1. What does the 10,000-cycle test prove, and what does it not prove?
2. Why is a published test vector stronger than only self-generated tests?
3. Which security claims depend on deployment configuration?
4. Why is an unaudited correct-looking composition still described as unaudited?
5. What should happen when epoch rotation fails at a month boundary?

### Advanced hour

Perform a manual dependency and trust audit. Identify which packages process attacker-controlled bytes and which hold cryptographic keys. Reduce the critical boundary where practical.

---

## Day 14 — Rebuild, demonstrate and defend the system

**Time:** 7–8 hours

### Objectives

- Reconstruct the design from memory.
- Complete a clean end-to-end run.
- Deliver a concise product pitch and a separate technical explanation.
- Answer adversarial questions accurately.
- Identify what you would improve next without overstating the MVP.

### Morning: closed-book reconstruction — 90 minutes

On a blank page, draw:

1. wallet;
2. ZIP-321 request;
3. receiving wallet;
4. payment scanner;
5. invoice database;
6. issuance authorization;
7. client blinding state;
8. Privacy Pass issuer;
9. local encrypted credential store;
10. protected API;
11. verifier;
12. spent-token database;
13. resource transaction.

Label:

- every secret;
- every trust boundary;
- every database write;
- every retry boundary;
- every place correlation metadata can exist.

Then compare your diagram with [architecture.md](architecture.md).

### Capstone build check — 2 hours

From a clean database:

1. Start PostgreSQL and API.
2. Fetch and validate offer and manifest.
3. Create invoice.
4. Show clearly labeled mock or real testnet payment request.
5. Confirm payment through the appropriate watcher.
6. Generate ten blinded requests locally.
7. Issue and finalize ten real credentials.
8. Confirm the issuer has no final-token mapping.
9. Redeem one search credit.
10. Replay it and receive `TOKEN_ALREADY_SPENT`.
11. Modify one token and receive `INVALID_TOKEN`.
12. Present an invoice-specific key and receive `ISSUER_POLICY_VIOLATION`.
13. Run twenty simultaneous replays and show one winner.
14. Run the privacy audit.
15. Explain the direct-network warning.

### Presentation practice — 2 hours

#### Version A: 60-second nontechnical explanation

Cover only:

1. A shielded payment can still lead to a linkable account or API key.
2. BlindPass replaces that persistent relationship with single-use blind credentials.
3. Payment and usage can both be valid without a direct cryptographic join.
4. Network metadata remains a separate problem.

#### Version B: 2-minute-45-second judge demo

Use [demo-script.md](demo-script.md) as a baseline, but speak from your own diagram.

Suggested timing:

```text
0:00  Problem: private payment is not private usage
0:20  Real or clearly simulated Zcash payment state
0:45  Alice and Bob receive identical blind-credit configurations
1:10  Shuffled credential redemption
1:35  No invoice-to-token database join
1:50  Replay and forgery blocked
2:10  Malicious configuration rejected
2:28  Timing/IP limitation and Tor as a separate layer
2:42  Final product statement
```

#### Version C: 10-minute engineering defense

Explain:

- chosen token type and why;
- VOPRF flow and proof purpose;
- common challenge and epoch policy;
- issuance idempotency;
- atomic redemption;
- local storage;
- Zcash scanner boundary;
- network limitations;
- production gaps.

### Oral examination — 90 minutes

Answer these without reading:

1. Why is Zcash alone insufficient for private API usage?
2. Why is a random API key not equivalent to a blind credential?
3. What exact information does the issuer see during issuance?
4. What exact information does the origin see during redemption?
5. Why is the selected token privately verifiable?
6. What does the VOPRF proof verify?
7. What does it not verify?
8. Why is an invoice ID excluded from token inputs?
9. Why are key, class and expiry common across buyers?
10. How does the client know the issuer did not substitute a key?
11. What remains unresolved on first use?
12. Why does a valid token need a spent-token database?
13. Why is check-then-insert unsafe?
14. How does `ON CONFLICT` behave under concurrent inserts?
15. Why store a domain-separated hash rather than the raw token?
16. What happens when resource work fails?
17. Why is an external side effect harder than local database work?
18. What does the invoice signature protect?
19. Why does webhook authentication not prove chain truth?
20. Why is incoming viewing capability preferable to spending authority on the API server?
21. What is a Unified Address?
22. What does a ZIP-321 URI represent?
23. Why avoid invoice IDs in memos and unique payment amounts?
24. Why can timing and IP still correlate events?
25. What changes when Tor is active?
26. What does Tor not solve?
27. Why is the two-client 50/50 matrix only transcript-level education?
28. What is simulated in the default demo?
29. What is cryptographically real?
30. What evidence would you want before production deployment?

For every answer, include one mechanism and one limitation.

### Final deliverable

- Working core lab
- Passing tests
- Architecture diagram
- Threat model
- Security evidence matrix
- 2:45 presentation
- 10-minute technical defense
- One-page “implemented versus simulated” disclosure

---

## 6. Reference implementation reading order

Read the production repository in this order after attempting the corresponding lab:

1. [Shared types and byte helpers](../packages/shared/src/index.ts)
2. [Privacy Pass provider setup](../packages/privacy-pass/src/provider.ts)
3. [Privacy Pass wrapper](../packages/privacy-pass/src/index.ts)
4. [Crypto tests](../tests/crypto.test.ts)
5. [Reference-vector tests](../tests/vectors.test.ts)
6. [Database schema](../apps/api/src/db/schema.ts)
7. [Payment abstraction](../packages/zcash/src/index.ts)
8. [Scanner adapter](../packages/zcash/src/scanner.ts)
9. [Invoice service](../apps/api/src/invoices.ts)
10. [Issuance service](../apps/api/src/issuance.ts)
11. [Redemption service](../packages/blindpass-server/src/index.ts)
12. [Client SDK](../packages/blindpass-client/src/index.ts)
13. [CLI vault](../cli/src/vault.ts)
14. [Tor transport](../cli/src/tor.ts)
15. [API composition](../apps/api/src/app.ts)
16. [Integration tests](../tests/integration.test.ts)
17. [Replay tests](../tests/replay.test.ts)
18. [Policy tests](../tests/policy.test.ts)
19. [Production checks](../tests/production.test.ts)
20. [Browser E2E flow](../tests/e2e/app.spec.ts)

For every file, answer:

```text
Inputs:
Outputs:
Secrets:
Untrusted data:
Persistent data:
Privacy invariant:
Concurrency assumption:
Failure behavior:
Test evidence:
```

---

## 7. Core theory notes for revision

### Payment privacy is not authorization privacy

Zcash can protect payment information from public-chain observers. The receiving merchant still needs to decide whether to issue access. If the merchant creates a reusable session or account at that moment, future activity becomes directly linkable to the purchase.

BlindPass changes the authorization artifact. The merchant approves blinded inputs after payment; later it verifies a finalized single-use token. Correct issuance does not provide a direct cryptographic handle joining those two transcripts.

### Blindness is not replay prevention

The token authenticator proves that an issuer evaluated the corresponding input. It contains no magical “used” bit that changes on first presentation. One-time use is an application property enforced by authoritative shared state.

### Private verification is not public signature verification

RFC 9578 token type `0x0001` uses a VOPRF. Verification recomputes the expected authenticator using issuer secret-key material. Giving another service verification capability for this construction also gives highly sensitive issuer capability; deployment and key custody must reflect that.

### Shared configuration is a privacy requirement

A unique key, class, expiry or challenge can act as a tag. Blindness of the token input does not save a client that accepts buyer-specific public metadata. Policy enforcement belongs on the client before it creates blind requests.

### Signed configuration is necessary but not globally sufficient

An Ed25519 signature authenticates the merchant configuration identity. A malicious merchant controlling the signing key can sign different configurations for different clients. Independent pins, transparency and gossip address this stronger split-view threat.

### Zcash scanner trust is explicit

The API cannot infer a shielded payment from a QR code. It relies on a wallet/scanner boundary to derive destinations and report observed transactions. Webhook authentication proves who sent the event, not that the sender interpreted the chain correctly.

### Network metadata remains separate

The merchant can observe request timing, source network information, query contents and browser behavior unless other layers reduce those signals. Tor reduces some network exposure but is not a blanket anonymity guarantee.

---

## 8. Common implementation mistakes

### Mistake: server generates final tokens

This permits direct invoice-to-token recording. The client must generate token inputs and blinding state, and must finalize locally.

### Mistake: custom “blind signature” arithmetic

Do not create homemade modular or curve code. Use the standardized library and verify reference vectors.

### Mistake: invoice ID in challenge, memo or token class

That creates a direct tag. Only common policy belongs in the token challenge.

### Mistake: one issuer key per invoice

That destroys the intended common class. Rotate by shared epochs, not customers.

### Mistake: server-side check followed by insert

Concurrent requests race. The unique insert must reserve the token before resource execution.

### Mistake: storing raw tokens

Store the domain-separated hash needed for duplicate detection.

### Mistake: logging whole URLs and headers

Capabilities, queries and credentials can leak through ordinary access logs. Design logging deliberately.

### Mistake: treating an HMAC webhook as chain verification

It authenticates the scanner message. Scanner correctness and chain interpretation remain trusted.

### Mistake: silently falling back when Tor fails

If the user requested Tor, direct fallback violates their explicit transport expectation.

### Mistake: presenting mock payments as verified Zcash

Label simulated events visibly and consistently. Honest boundaries increase technical credibility.

### Mistake: claiming a measured anonymity probability

A two-buyer matrix is a transcript-only illustration under equal priors. It does not include IP, timing, query semantics or distinct-person uncertainty.

---

## 9. Debugging guide

### Finalization fails

Check:

- response count equals request count;
- response order matches client order;
- client blinding state is still available;
- manifest public key is identical;
- response length and base64url are canonical;
- proof bytes were not modified;
- provider initialization occurred before library use.

### Token verifies cryptographically but class check fails

Check:

- challenge was derived from the accepted manifest;
- token class and epoch dates are deterministic;
- expected challenge digest uses the exact serialized challenge;
- no buyer-specific value entered the context.

### Two concurrent replays both succeed

Check:

- reservation happens before resource work;
- unique constraint covers `(token_hash, issuer_epoch)`;
- both API instances use the same authoritative PostgreSQL database;
- transaction commit is awaited;
- test is not accidentally issuing two distinct credentials.

### Retry produces extra credentials

Check:

- request hash is persisted;
- same request returns stored responses;
- different request for completed authorization is rejected;
- authorization and response persistence commit atomically.

### Mock invoice looks like a real wallet address

Change it. Development destinations must be unmistakably non-payable, and the UI must display `SIMULATED PAYMENT EVENT`.

### Tor appears connected but DNS leaks

Check:

- proxy URL uses `socks5h`, not a local-resolving mode;
- destination was passed as a hostname to the proxy;
- connectivity result came from a real check;
- no direct retry path exists.

---

## 10. Presentation vocabulary

Prefer:

- shielded ZEC payment;
- accountless paid access;
- blind credential issuance;
- privately verifiable token;
- payment-to-redemption unlinkability;
- single-use private credit;
- transcript-level unlinkability;
- reduced network linkability;
- merchant configuration consistency.

Avoid:

- completely anonymous;
- untraceable;
- impossible to track;
- “zero knowledge” as a label for the whole system;
- Tor guarantees anonymity;
- the merchant sees nothing;
- blockchain privacy automatically means usage privacy.

Use this three-layer answer:

```text
Zcash protects payment information at the blockchain layer.
Privacy Pass removes the direct cryptographic issuance-to-redemption link.
Network metadata requires a separate privacy layer and operational discipline.
```

---

## 11. Readiness rubric

Score yourself from 0 to 3 for each item:

```text
0 = cannot explain
1 = recognize terminology
2 = can explain with notes and show code
3 = can derive, implement, test and defend without notes
```

| Competency | Target |
| --- | ---: |
| HTTP and runtime validation | 3 |
| Byte encoding and canonicalization | 3 |
| Applied hashes/signatures/AEAD/KDFs | 3 |
| Zcash payment integration model | 2–3 |
| Privacy Pass architecture | 3 |
| VOPRF conceptual mathematics | 2–3 |
| Library integration and vector testing | 3 |
| Issuance authorization/idempotency | 3 |
| PostgreSQL replay concurrency | 3 |
| Issuer policy enforcement | 3 |
| Credential storage boundaries | 3 |
| Network metadata/Tor limitations | 3 |
| Threat modeling | 3 |
| Production and key-management limits | 2–3 |
| Live presentation and Q&A | 3 |

Do not present as the technical owner until the core rows are at least 2 and you can clearly state limitations.

---

## 12. Primary learning sources

### Privacy Pass and VOPRF

- [RFC 9576 — Privacy Pass Architecture](https://www.rfc-editor.org/rfc/rfc9576.html)
- [RFC 9577 — Privacy Pass HTTP Authentication Scheme](https://www.rfc-editor.org/rfc/rfc9577.html)
- [RFC 9578 — Privacy Pass Issuance Protocols](https://www.rfc-editor.org/rfc/rfc9578.html)
- [RFC 9497 — OPRFs Using Prime-Order Groups](https://www.rfc-editor.org/rfc/rfc9497.html)
- [Cloudflare `privacypass-ts`](https://github.com/cloudflare/privacypass-ts)
- [Cloudflare `voprf-ts`](https://github.com/cloudflare/voprf-ts)

### Zcash

- [The Orchard Book](https://zcash.github.io/orchard/)
- [ZIP 315 — Wallet best practices](https://zips.z.cash/zip-0315)
- [ZIP 316 — Unified Addresses and Unified Viewing Keys](https://zips.z.cash/zip-0316)
- [ZIP 321 — Payment Request URIs](https://zips.z.cash/zip-0321)
- [Zcash protocol specification](https://zips.z.cash/protocol/protocol.pdf)

### Backend and security engineering

- [Node.js Web Crypto](https://nodejs.org/download/release/latest-jod/docs/api/webcrypto.html)
- [PostgreSQL transaction isolation](https://www.postgresql.org/docs/17/transaction-iso.html)
- [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html)
- [Fastify validation and serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)
- [Zod](https://zod.dev/)
- [OWASP Cryptographic Storage](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- [OWASP Logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [Tor SOCKS extensions](https://spec.torproject.org/socks-extensions)

### BlindPass project documentation

- [Architecture](architecture.md)
- [Cryptography](cryptography.md)
- [Threat model](threat-model.md)
- [Privacy](privacy.md)
- [Zcash integration](zcash.md)
- [Deployment](deployment.md)
- [OpenAPI](openapi.yaml)
- [Verification](verification.md)
- [Judge demo](demo-script.md)
- [Colosseum Zcash bounty review](colosseum-zcash-bounty-review.md)

---

## 13. What to learn after the two weeks

Do not widen scope until the core implementation and presentation are reliable. Then study:

1. formal VOPRF security definitions and proof construction;
2. hash-to-curve and prime-order group abstractions;
3. independent configuration transparency and gossip;
4. Oblivious HTTP and relay architecture;
5. anonymous rate-limiting and metered-session constructions;
6. recovery/replacement credentials without silent inflation;
7. HSM-backed issuer-key operations;
8. production Zcash scanning and wallet interoperability;
9. privacy-preserving abuse controls;
10. independent security review and protocol-composition analysis.

The goal of this bootcamp is not to make you a cryptographer in fourteen days. It is to make you a strong application and protocol engineer who can identify the primitive being relied upon, integrate it without weakening its assumptions, test the surrounding system and communicate exactly what the product does and does not guarantee.

When a judge asks **“Why does this work?”**, you should be able to explain the mechanism.

When a judge asks **“When does it fail?”**, you should be able to explain the assumptions.
