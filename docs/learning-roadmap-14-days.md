# Learn BlindPass in 14 Days

## A build-oriented study roadmap: basics → protocol understanding → engineering → presentation

**Purpose:** understand the technology well enough to explain the design, follow the implementation, reason about attacks, and answer judges without relying on memorized marketing language.

This is a Markdown study guide, not another application. You do not need to build a new frontend. Use the existing BlindPass project as a worked example while learning how you would design a smaller version yourself.

**Time:** approximately 3 hours per day, or 42 hours over two weeks. Optional advanced reading can add another hour. With only 90 minutes a day, complete the essential reading and explanation exercises first; extend the engineering work beyond two weeks.

**Starting point:** basic programming familiarity is helpful. You do not need prior cryptography experience. If JavaScript objects, functions, imports, promises, or HTTP requests are entirely new, allow extra preparation time. Two weeks can produce solid applied understanding; it cannot substitute for a cryptography degree or qualify you to invent secure primitives.

**Sources checked:** September 21, 2026. The repository pins its own library versions; follow its installed APIs rather than assuming the latest upstream examples are identical.

---

## 1. What you are actually learning

BlindPass sits at the intersection of five subjects:

| Subject                       | The question it answers                                                                 | Your target depth                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Web/backend engineering       | How does a service authorize a request?                                                 | Trace requests, errors, state and trust boundaries                |
| Zcash payment privacy         | How can a merchant receive a shielded payment?                                          | Explain wallet/scanner responsibilities and limits                |
| Privacy Pass / VOPRF          | How can someone obtain a valid credit without exposing its final value during issuance? | Explain the protocol and use an established implementation        |
| Database/security engineering | How can a valid credit be spent only once?                                              | Explain transactions, concurrency, rollback and key management    |
| Privacy threat modeling       | What can still identify or correlate someone?                                           | Distinguish cryptographic guarantees from operational assumptions |

The frontend is a way to demonstrate these ideas. It is not the core invention.

Keep this question in view throughout the course:

> How can the service check that a request is authorized without asking which purchase produced its credential?

### What to postpone

Do not spend these two weeks on custom elliptic-curve code, implementing Halo 2, designing a new token format, deploying mainnet payments, building a mobile wallet, or polishing animations. Learn why the boundaries exist before trying to extend them.

---

## 2. How to study each day

Use the same routine:

1. **Recall — 15 minutes:** explain yesterday's idea without opening notes.
2. **Learn — 45 minutes:** read the selected material, not an entire specification.
3. **Trace — 60 minutes:** inspect the relevant existing code or work through the paper exercise.
4. **Test your reasoning — 40 minutes:** answer the checkpoint and consider one failure case.
5. **Present — 20 minutes:** record a short explanation in your own words.

Keep one notebook with these headings for each day:

```text
Concept:
Problem it solves:
What it does not solve:
Who knows what:
Where it appears in BlindPass:
One attack or failure case:
My 60-second explanation:
Question I still cannot answer:
```

Do not move on just because you recognize the terminology. Move on when you can explain the mechanism and one limitation without reading a script.

### How to read an RFC without getting overwhelmed

- First pass: introduction, entities, diagrams and security considerations.
- Second pass: the one protocol flow relevant to this project.
- Third pass: formats, validation rules and pseudocode, alongside the implementation.
- Write down whether a detail is a **standard requirement**, a **library choice**, or a **BlindPass application policy**.
- Skip unrelated variants until the optional advanced reading.

For example: token type `0x0001` is standardized; ten credits for `0.01 ZEC` is a product policy.

---

## 3. The two-week map

| Day | Focus                                            | What you should produce                        |
| --- | ------------------------------------------------ | ---------------------------------------------- |
| 1   | HTTP, APIs and accountless authorization         | A request/response diagram                     |
| 2   | Privacy, linkability and threat models           | A who-can-see-what table                       |
| 3   | Cryptography vocabulary                          | A primitive-to-purpose map                     |
| 4   | Zcash, Orchard, addresses and payment requests   | A payment/scanner diagram                      |
| 5   | Privacy Pass architecture                        | A role map and issuance/redemption story       |
| 6   | OPRF, VOPRF and proof verification               | An explanation of blinding without magic words |
| 7   | Actual token lifecycle                           | A traced issuance flow and week-one recap      |
| 8   | Invoices, capabilities and payment authorization | A payment/issuance state machine               |
| 9   | Atomic redemption and replay                     | A concurrent-request timeline                  |
| 10  | Malicious issuer configuration                   | An attack/control/remaining-risk table         |
| 11  | Credential storage and operational keys          | A key and secret inventory                     |
| 12  | Tor, timing and network metadata                 | A layered privacy explanation                  |
| 13  | Testing, failure handling and production gaps    | An evidence-backed security review             |
| 14  | Presentation and technical defense               | A 2:45 demo and unscripted Q&A                 |

---

## Week 1 — Understand the foundations and the protocol

## Day 1 — How a paid API normally works

### Learn

Understand clients and servers, HTTP methods, paths, headers, JSON responses, status codes, cookies, API keys and sessions. Distinguish authentication (checking an identity or credential) from authorization (deciding whether an operation is allowed).

A service does not inherently need an account to authorize a request. A bearer credential is usable by whoever possesses it. That makes possession valuable, but does not itself make issuance private.

### Learn from

1. **Essential:** [MDN — Overview of HTTP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Overview). Focus on requests/responses, headers, and the distinction between stateless HTTP and stateful sessions.
2. **If programming needs a refresher:** [MDN — JavaScript Guide](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide). Study objects, functions, modules and promises; skip advanced language features for now.
3. **Project connection:** [BlindPass architecture](architecture.md) and [OpenAPI specification](openapi.yaml). Locate `/api/invoices`, `/api/issuance` and `/api/search`.

### Practice

Draw an ordinary paid API:

```text
purchase → customer record → reusable API key → requests 1, 2, 3
```

Circle every identifier the merchant could reuse to group the requests. Then draw a request containing a single-use credential instead. Ask how that credential was obtained; do not assume that changing the header solves privacy.

### Checkpoint

- Why can HTTPS protect traffic in transit while the destination still reads the query?
- Why is a random API key not automatically unlinkable to its purchase?

**Explain aloud:** “BlindPass changes how access is authorized. It does not make the destination unable to see the request.”

## Day 2 — Privacy is a threat model, not a label

### Learn

Separate confidentiality, anonymity, pseudonymity and unlinkability. Learn to ask “private from whom, during which step, under which assumptions?” A persistent pseudonym may hide a legal name while still linking every action.

The important distinction for BlindPass is between a cryptographic matching identifier and other evidence that can correlate events.

### Learn from

1. **Essential:** [BlindPass threat model](threat-model.md), especially actors and configuration partitioning.
2. **Essential:** [BlindPass privacy guide](privacy.md).
3. **Primary background:** [RFC 9576 — Privacy Pass Architecture](https://www.rfc-editor.org/rfc/rfc9576.html), the terminology and privacy-goals/threat-model sections. Read for the questions it asks, not every deployment detail.

### Practice

Make rows for the public-chain observer, merchant, scanner, ISP, CDN and compromised browser. Make columns for payment data, invoice, blinded request, redeemed credential, source IP, query and timing. Fill each cell with “visible,” “not necessarily visible,” or “depends,” and explain every “depends.”

Use only fictional identities in your notes. You do not need to collect real fingerprints or IP addresses.

### Checkpoint

- Can a system have no user table and still correlate people?
- If only one person bought credits, what does cryptographic blindness fail to solve by itself?

**Explain aloud:** “Removing the direct credential link is a specific privacy improvement, not a claim that all other evidence disappears.”

## Day 3 — Learn the cryptographic tools before combining them

### Learn

Start with these distinctions:

| Tool                               | Purpose in this project                               | Not a substitute for                         |
| ---------------------------------- | ----------------------------------------------------- | -------------------------------------------- |
| Cryptographic hash                 | Fixed-size digest; spent-token indexing               | Encryption or hiding low-entropy guesses     |
| Secure randomness                  | Unpredictable capabilities, nonces and blinding state | Timestamps or ordinary random-number helpers |
| Symmetric authenticated encryption | Protect local stored material and detect modification | A safe device or trustworthy running code    |
| Digital signature                  | Check a document against a trusted signing identity   | Privacy of the signed document               |
| VOPRF-based issuance               | Obtain a valid credential through blind evaluation    | Network anonymity or a spent-token database  |

Also learn bytes versus strings, hexadecimal/base64 encoding, public/private keys, domain separation, and why canonical serialization matters. Base64 is encoding, not encryption.

### Learn from

1. **Essential:** [MDN — Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API). Read the overview and warnings.
2. **Reference:** [MDN — SubtleCrypto](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto). Identify `digest`, `sign`, `verify`, `encrypt` and `decrypt`; do not memorize every algorithm.
3. **Project connection:** [Cryptography guide](cryptography.md), then [shared helpers](../packages/shared/src/index.ts).

### Practice

Locate `sha256`, `canonical`, `verifySignature` and `fingerprint`. Write one sentence explaining each function's purpose. Then find which component signs invoices and which component encrypts the CLI vault. Notice that these are not the VOPRF protocol.

### Checkpoint

- Why does a signature not hide an invoice's contents?
- Why would hashing an email address be different from hashing a high-entropy token?

**Explain aloud:** “BlindPass uses different primitives for document integrity, local storage and blind issuance. They solve different problems.”

## Day 4 — Zcash and the payment boundary

### Learn

Learn ZEC amounts, transparent versus shielded payments, Orchard, notes, confirmations and reorgs at a conceptual level. Then distinguish a spending capability from an incoming viewing capability.

A Unified Address can carry receiver information; its existence alone does not prove a particular payment was fully shielded. A payment URI describes a requested payment; generating a QR code is not evidence that payment happened.

### Learn from

1. **Start here:** [BlindPass Zcash integration guide](zcash.md). It connects the payment terms to the actual application.
2. **Primary:** [Orchard Book — Design](https://zcash.github.io/orchard/design.html). Understand the components; leave circuit internals for later.
3. **Primary:** [ZIP 316 — Unified Addresses and Unified Viewing Keys](https://zips.z.cash/zip-0316). Focus on motivation, receiver types and viewing capabilities.
4. **Primary:** [ZIP 321 — Payment Request URIs](https://zips.z.cash/zip-0321). Focus on the URI scheme, amounts and examples.

### Practice

Draw:

```text
external wallet → shielded payment → merchant receiving wallet
                                      ↓
                              read-only scanner
                                      ↓
                              payment observation
```

Mark which component needs to spend funds and which only needs to observe incoming payments. Explain why fixed prices, fresh receiving addresses and empty default memos are sensible application choices.

Read [the mock watcher](../packages/zcash/src/index.ts). Its obviously non-payable address is intentional. Do not send real funds during this course.

### Checkpoint

- What does a blockchain observer see differently from the merchant or scanner?
- What evidence would be needed before replacing “simulated payment” with “observed shielded payment”?

**Explain aloud:** “Our default demo simulates the payment observation. It does not simulate the blind credential cryptography.”

## Day 5 — What Privacy Pass contributes

### Learn

Learn the roles of client, issuer, origin and attester, and the separation between issuance and redemption. Treat the roles as logical functions, not necessarily separate companies.

In BlindPass, confirmed payment supplies the application authorization for issuance. Do not describe this as a separately implemented standardized attestation protocol.

### Learn from

1. **Essential:** [RFC 9576](https://www.rfc-editor.org/rfc/rfc9576.html), introduction and architecture overview, then deployment models.
2. **Essential:** [RFC 9577 — HTTP Authentication Scheme](https://www.rfc-editor.org/rfc/rfc9577.html). Locate the challenge and authorization examples. Focus on the purpose of `PrivateToken`.
3. **Orientation:** [RFC 9578 — Issuance Protocols](https://www.rfc-editor.org/rfc/rfc9578.html). Read the introduction and headings of sections 5 and 6 to distinguish private from public verification.

### Practice

Map each logical role to an existing BlindPass component. Write down what the issuer gets during issuance and what the API gets later. Explain why a client-generated random string without issuer participation is not sufficient proof of paid access.

Compare an ordinary signed voucher with a blindly issued credit. Ask whether the issuer saw the final voucher identifier when it was created.

### Checkpoint

- What does the issuer check about payment, and what does the redeemer check about a token?
- Why does a spent-token database not need the original invoice ID?

**Explain aloud:** “The purchase authorizes issuance. Later, the credential authorizes the resource. Those are separate decisions.”

## Day 6 — Understand VOPRF without implementing curve arithmetic

### Learn

Unpack the acronym:

- **Pseudorandom function:** a keyed function with unpredictable-looking outputs to someone lacking its key.
- **Oblivious:** the client obtains the result through a protocol that hides its input from the evaluator.
- **Verifiable:** the client checks that evaluation is consistent with the expected public key.

For mathematical intuition, think of a group point `P` derived from an input, a client blinding scalar `r`, and an issuer scalar `k`:

```text
client blinds:       B = rP
issuer evaluates:    E = kB
client unblinds:     r⁻¹E = kP
```

These are group operations, not ordinary multiplication of JavaScript numbers. The inverse is in the scalar field. The real protocol additionally needs defined input mapping, validation, proofs, domain separation and finalization. This sketch is not an implementation recipe or a security proof.

The DLEQ proof checks consistency of the issuer's secret exponent across the relevant public/evaluated elements; it does not establish payment or a universally shared configuration. Study the actual construction in [RFC 9497](https://www.rfc-editor.org/rfc/rfc9497.html).

### Learn from

1. **Essential:** [RFC 9497 — OPRFs](https://www.rfc-editor.org/rfc/rfc9497.html), introduction, notation, and the VOPRF protocol section. Optional: prime-order groups and DLEQ proof sections.
2. **Implementation context:** [Cloudflare VOPRF library](https://github.com/cloudflare/voprf-ts). Read its supported providers and security caveats.
3. **Project explanation:** [BlindPass cryptography guide](cryptography.md), especially “What the protocol does.”

### Practice

On paper, give Alice the input and blinding state, and give the issuer the key and blinded element. Cross out anything either party should not receive. Explain why removing blinding would allow the merchant to see the token input during issuance.

### Checkpoint

- What does the proof establish, and what does it not establish?
- Why is “the server encrypts the token and later decrypts it” the wrong description?

**Explain aloud:** “The client blinds locally, checks the issuer's proof, and finalizes locally. The server does not receive the final credential during issuance.”

## Day 7 — Trace the real credential lifecycle

### Learn

Follow this project's actual flow: common manifest → local requests → issuer evaluation → proof verification/finalization → local credentials → later verification.

The selected protocol is RFC 9578 type `0x0001`, VOPRF(P-384, SHA-384). Private verification requires issuer secret-key access; the public key used to check issuance proofs is not sufficient to verify these redeemed tokens. Read [RFC 9578 section 5](https://www.rfc-editor.org/rfc/rfc9578.html#section-5) for this variant.

### Learn from

1. **Essential:** [The small Privacy Pass wrapper](../packages/privacy-pass/src/index.ts). Read `createBlindBatch`, `TokenIssuer.evaluate`, `finalize` and `TokenIssuer.verify` in that order.
2. **Essential:** [Cryptographic tests](../tests/crypto.test.ts) and [reference-vector test](../tests/vectors.test.ts).
3. **Library reference:** [Cloudflare Privacy Pass library](https://github.com/cloudflare/privacypass-ts). Use its documentation to understand the dependency, not to replace the project's pinned API blindly.

### Practice

Create a sequence diagram with two lanes: client and merchant. Label every message with its type, but never copy an actual bearer credential into your notes. Locate the common challenge, token key identifier and error paths.

Notice the application transports ten independent requests in JSON. That envelope is not a claim to implement every standard issuance HTTP interface or a generic batched-token protocol.

Optional observation: run `pnpm test:crypto` from the repository root and explain each test's purpose before reading its result.

### Week-one checkpoint

Explain the entire flow in two minutes, then answer: “If I verify the same valid token twice using only cryptography, why might both verifications succeed?”

Expected idea: authenticity does not record whether a token was already spent. That is next week's database problem.

---

## Week 2 — Understand how the protocol becomes a reliable product

## Day 8 — Invoices, capabilities and payment authorization

### Learn

Study state machines, high-entropy bearer capabilities, operational invoice signatures, duplicate webhooks and authorization consumption. Separate payment deadline, issuance deadline and common credential expiry.

An invoice ID names a purchase. An invoice capability authorizes access to that purchase's operations. A final credential authorizes one later resource request. Mixing those jobs creates security or privacy problems.

### Learn from

1. [Invoice service](../apps/api/src/invoices.ts) and [issuance service](../apps/api/src/issuance.ts).
2. [Payment/issuance integration tests](../tests/integration.test.ts).
3. [Architecture — failure and recovery behavior](architecture.md) and [scanner contract](zcash.md).

### Practice

Draw transitions from waiting to detected, confirming, confirmed and credits ready. Add expiration and reorg branches. For each arrow, write who supplies the evidence and what is stored.

Explain the difference between resending the **same** blinded request batch and submitting a **new** batch for the same paid invoice. Then describe what happens if the client loses its blinding state after issuance commits.

### Checkpoint

- Why must a duplicate payment event not create another ten-credit allowance?
- Does a valid webhook HMAC prove the payment happened on-chain?

**Explain aloud:** “The scanner is a trusted payment-observation boundary. The API authorizes one batch and handles retries without authorizing a second batch.”

## Day 9 — Why single-use needs a database transaction

### Learn

Learn uniqueness constraints, transactions, commit/rollback and concurrent requests. A separate “check whether spent” followed by “insert spent” can race: both requests may pass the check.

The important property is that reservation and resource handling follow a safe atomic design. Inspect how this application uses a unique insertion and a transaction; do not assume a process-local lock works across servers. The relevant database behavior is documented in [PostgreSQL constraints](https://www.postgresql.org/docs/17/ddl-constraints.html) and [transaction isolation](https://www.postgresql.org/docs/17/transaction-iso.html).

### Learn from

1. **Essential:** PostgreSQL 17 docs above: unique constraints, Read Committed behavior and concurrent insert conflicts.
2. [Redemption service](../packages/blindpass-server/src/index.ts).
3. [Replay test](../tests/replay.test.ts) and [database migration](../infra/migrations/001_initial.sql).

### Practice

Draw a timeline for two copies of the same token arriving together. First show the unsafe check-then-insert design. Then show the unique reservation design. Identify the winning transaction, the waiting/conflicting transaction and the moment resource execution is allowed.

Optional observation with the development database running: `pnpm exec vitest run tests/replay.test.ts tests/search.test.ts`.

### Checkpoint

- Why can a cryptographically valid token return `TOKEN_ALREADY_SPENT`?
- Why can rolling back SQL fail to undo an external email or paid API call?

**Explain aloud:** “The primitive checks authenticity. PostgreSQL enforces the spend rule. External side effects would need their own idempotency design.”

## Day 10 — A valid signature can still authenticate a bad policy

### Learn

Study issuer configuration partitioning: per-invoice keys, unusual expiry times, unique classes and unexpected key IDs. A credential can be cryptographically valid while its metadata narrows the buyer set.

Separate three controls:

1. A merchant identity pin: which signing identity do I trust?
2. A trusted common epoch configuration: which credential policy do I accept?
3. Cross-client consistency: did other people receive that same policy?

These are not interchangeable.

### Learn from

1. [Client policy validation](../packages/blindpass-client/src/index.ts), particularly `validateConfiguration`.
2. [Malicious configuration tests](../tests/policy.test.ts).
3. [Threat model — first-use limitations](threat-model.md) and [privacy guide](privacy.md).

### Practice

Make four rows: changed key, changed expiry, changed class and changed key ID. For each, identify the check that rejects it and the trusted baseline that check needs.

Then consider a malicious merchant serving two first-time clients different, correctly signed epoch keys. Neither client has an independently trusted common manifest. Explain why pinning the same merchant identity alone does not expose that split view. The current demonstration's cached baseline is an important assumption.

### Checkpoint

- Why do the malicious-configuration tests deliberately use valid merchant signatures?
- What would an independent manifest channel or transparency system add?

**Explain aloud:** “We enforce a trusted shared policy, but we do not pretend a same-origin signature is a global transparency log.”

## Day 11 — Credentials are valuable local secrets

### Learn

Study bearer-token theft, authenticated encryption, passphrase-derived keys, OS keyrings, file permissions, browser storage and key rotation. Separate protection of stored bytes from protection against actively malicious code.

Study IndexedDB as storage and Web Crypto as cryptographic operations; neither removes the need to trust the execution environment. See the [IndexedDB overview](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) and [Web Crypto overview](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API).

### Learn from

1. [CLI vault](../cli/src/vault.ts) and [vault tests](../tests/vault.test.ts).
2. [Browser vault](../apps/web/lib/vault.ts).
3. [Issuer key management](../apps/api/src/keys.ts) and [deployment guide](deployment.md).

### Practice

Inventory the invoice capability, VOPRF issuer key, merchant Ed25519 key, scanner webhook secret, local vault key and final credentials. For each, record who holds it, whether the browser should receive it, what compromise allows, and how loss affects the system.

Explain why deleting browser site data removes this wallet's locally stored credits. Explain why a non-extractable key is useful but cannot stop authorized same-origin code from asking the browser to decrypt or spend.

### Checkpoint

- Why does an encrypted vault not guarantee safety against an active compromised browser?
- What happens to outstanding credits if the merchant loses the verification key?

**Explain aloud:** “There is no account recovery server holding a backup relationship between my invoice and my final credentials.”

## Day 12 — Network privacy is a separate layer

### Learn

Study source IP visibility, request timing, cookies, browser/TLS fingerprints, query content and anonymity sets. Then learn what a SOCKS proxy changes, why remote DNS matters, and why proxy configuration is not proof of a Tor connection.

Tor can reduce some network exposure; it does not make unsafe browser behavior or all traffic correlation disappear. Read the [Tor Project's safety guidance](https://support.torproject.org/tor-browser/security/using-tb-safely/). Using a CLI over Tor is also not the same as obtaining Tor Browser's browser-level protections.

### Learn from

1. **Essential:** [Tor Project — Tor Browser best practices](https://support.torproject.org/tor-browser/security/using-tb-safely/).
2. [BlindPass privacy guide](privacy.md), especially timing and network metadata.
3. [CLI Tor transport](../cli/src/tor.ts) and [fail-closed tests](../tests/tor.test.ts).

### Practice

Use a fictional purchase at 14:02:31 and redemption at 14:02:34, with the same source IP. Explain how a merchant might correlate them without breaking the cryptography. Then change the assumptions to delayed redemption, no persistent cookie and Tor transport. Explain which evidence becomes weaker and which remains.

Do not describe the educational UI toggle as actually enabling Tor. Do not treat a two-buyer 50/50 illustration as a measured anonymity probability.

### Checkpoint

- Why does successful blind issuance not hide the search query from the API?
- Why should a failed Tor connection stop a privacy-required request instead of falling back silently?

**Explain aloud:** “Zcash, blind credentials and network transport protect different observations. No one layer replaces the others.”

## Day 13 — Think like an engineer reviewing the system

### Learn

Learn the difference between a happy-path demo, a regression test, a published test vector, a concurrency test, a stress run and an independent security audit. Passing tests is evidence about tested behavior, not a proof of every security claim.

Review difficult outcomes: proof failure, malformed tokens, reorgs after issuance, lost responses, month-boundary rotation, issuer downtime and modified browser code.

### Learn from

1. [Verification report](verification.md): distinguish checks actually run from integrations not claimed.
2. [Reference-vector test](../tests/vectors.test.ts), [architecture test](../tests/architecture.test.ts) and [search tests](../tests/search.test.ts).
3. [Threat model](threat-model.md), [security policy](../SECURITY.md) and [deployment requirements](deployment.md).

### Practice

Create a review with three columns: **property**, **evidence**, **remaining assumption**. Include replay protection, payment authorization, blind issuance, common configuration and network transport.

Optional observation: `pnpm test` runs the existing suite and needs PostgreSQL. The longer `pnpm test:stress` exercises 10,000 real credential cycles; it is not an anonymity measurement. Use only the development/test database and synthetic credentials.

Explain why an unavailable real scanner is an external integration boundary, while silently replacing VOPRF issuance with random strings would invalidate the central demonstration.

### Checkpoint

- Can a cryptographic test prove that a CDN is not retaining IP addresses?
- Can the merchant selectively revoke one lost credential using an invoice if it deliberately has no invoice-to-token mapping?

**Explain aloud:** “I can identify which claims the code and tests support, and which still depend on deployment or external systems.”

## Day 14 — Present from understanding, not memorization

### Learn from

1. [The existing 2:45 demo script](demo-script.md).
2. Your own daily explanations and diagrams.
3. The presentation and live-demo routes of the existing application, if it is running.

Do not spend today learning a new protocol. Spend it explaining the one you now understand.

### Morning: reconstruct the design from memory

On a blank page, draw the invoice, payment watcher, authorization, issuer, local credential store, API and spent database. Label the secrets and shared public metadata. Identify which arrow contains a blinded request and which contains a final credential. There must be no invoice identifier sent as part of normal credential redemption.

### Afternoon: three rehearsals

1. **Nontechnical explanation — 60 seconds:** explain the problem, the change and the limit without acronyms.
2. **Judge demo — 2 minutes 45 seconds:** show payment simulation, real issuance, redemption, replay, malicious policy and network limits.
3. **Technical defense — 10 minutes:** let a friend interrupt with the questions below. Answer before opening code; then verify your answer against the relevant file.

### Final checkpoint

You should be able to explain why every major component exists, name at least one alternative, and describe what breaks if it is removed. That is a stronger sign of understanding than memorizing all the method names.

---

## 4. Questions judges may ask — and what a good answer contains

Try answering these before reading the answer cues.

### 1. Why isn't Zcash alone enough?

Payment privacy does not prevent the merchant from issuing a persistent session or API key and linking its usage. BlindPass addresses the subsequent credential relationship.

### 2. Is this just an API key with another name?

An ordinary API key is typically reusable and known to its issuer at creation. Here the final credential is produced through blind issuance and used once; both distinctions matter.

### 3. Does the server receive the final credential during issuance?

No. It receives the paid authorization and blinded requests. Finalization happens locally. During redemption, the API does receive a final credential to verify it.

### 4. Why not have the server generate ten random tokens?

Then the server knows those token values at issuance and can associate them with the invoice. Randomness alone does not remove that knowledge.

### 5. Does deleting an invoice/token foreign key prove unlinkability?

No. A malicious issuer could retain other information. The protocol supplies the cryptographic property; the schema and logs preserve the intended architecture. Metadata correlation remains separate.

### 6. Who can verify the selected credentials?

This application uses a privately verifiable variant, so the verifier needs the issuer secret key. Do not describe it as public signature verification. A verifier holding that key is also trusted with minting capability; this is not a public proof of a fixed token supply.

### 7. What stops replay?

The authoritative spent-token transaction and uniqueness constraint, after cryptographic verification. A mathematically valid authenticator does not become mathematically invalid merely because it was used.

### 8. Why share keys and expiry across purchasers?

Unique configurations can distinguish a purchase or a small set of purchases. Common metadata avoids deliberately partitioning the usable set that way.

### 9. What if the merchant signs a different key for each buyer?

The client rejects changes relative to its trusted common baseline. First-use identity pinning alone cannot establish that all clients received the same key. Independent baseline distribution or transparency is a further operational requirement.

### 10. Does the proof show that payment happened?

No. The issuance proof concerns the cryptographic evaluation. Payment confirmation is a separate authorization check based on a scanner observation.

### 11. Is the two-client matrix a real anonymity measurement?

No. Its equal-prior, transcript-only illustration excludes timing, source metadata and other evidence. Counts of purchases also do not establish counts of distinct people.

### 12. Why not automatically replace a lost token?

Loss and retries require careful design. Without a mapping to final credentials, an invoice alone cannot identify which particular credential to revoke. Blindly issuing replacements risks extra spendable value. The MVP documents these limits instead of promising account-style recovery.

### 13. Is the system “zero knowledge”?

Do not use that as a blanket label. Name the actual layer and mechanism: shielded Zcash payments, VOPRF-based blind issuance with proof verification, and single-use redemption. Study the specific proof constructions separately if asked.

### 14. Is the browser client safe against a malicious merchant?

Merchant-served code is a trust boundary. A merchant that replaces the client JavaScript may bypass the intended client behavior. An independently obtained client and independently trusted configuration strengthen that boundary; encryption alone does not solve it.

### 15. What is genuinely implemented versus simulated?

The default payment event is simulated. The credential operations, database replay protection and local search are real. Real chain scanning needs the documented external scanner. Tor availability must be verified at runtime, never inferred from a checkbox.

---

## 5. A reading order for the existing source code

Do not start by reading the entire repository. Follow one boundary at a time:

1. [Shared types](../packages/shared/src/index.ts): learn the vocabulary.
2. [Privacy Pass wrapper](../packages/privacy-pass/src/index.ts): trace requests, finalization and verification.
3. [Crypto tests](../tests/crypto.test.ts): understand expected acceptance and rejection.
4. [Invoice service](../apps/api/src/invoices.ts): understand payment evidence and state transitions.
5. [Issuance service](../apps/api/src/issuance.ts): understand paid authorization and duplicate-batch prevention.
6. [Redemption service](../packages/blindpass-server/src/index.ts): understand atomic spending.
7. [Client SDK](../packages/blindpass-client/src/index.ts): understand policy enforcement and local state.
8. [CLI vault](../cli/src/vault.ts) and [browser vault](../apps/web/lib/vault.ts): understand storage boundaries.
9. [Payment adapter](../packages/zcash/src/scanner.ts) and [Tor transport](../cli/src/tor.ts): understand external trust and transport.
10. [API assembly](../apps/api/src/app.ts): see how the pieces are connected.

For each file, answer only four questions on your first pass: What enters? What leaves? What secret does it need? What can fail?

---

## 6. Mini-glossary to keep beside you

| Term               | Working meaning                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------- |
| Bearer credential  | Possession enables its use; protect it like spendable value                              |
| Capability         | An unguessable value granting a specific operation, such as access to an invoice         |
| Nonce              | A fresh value used to distinguish protocol inputs; here generated securely               |
| Blinding           | A client-side transformation that hides an input during evaluation                       |
| Finalization       | Client processing that checks the response and produces the credential output            |
| Transcript         | Messages observed during a protocol execution                                            |
| Unlinkability      | A specified inability to associate events from the evidence considered                   |
| Token class        | The application resource policy a credit is accepted for                                 |
| Epoch              | A shared period associated with common issuer configuration                              |
| Key ID             | An identifier selecting a key; not itself the private key                                |
| DLEQ               | Discrete-logarithm-equality proof; relevant to consistent VOPRF evaluation               |
| Canonical encoding | One accepted byte representation, avoiding ambiguous equivalent forms                    |
| Domain separation  | Labeling distinct uses so cryptographic contexts are not accidentally mixed              |
| Replay             | Reusing the same authorization material                                                  |
| Atomic operation   | An operation whose relevant state changes succeed together or roll back                  |
| Idempotent retry   | Repeating an operation without unintentionally duplicating its effect                    |
| Reorg              | A change in the chain history considered canonical                                       |
| Viewing capability | Permission to observe relevant payment information without spending authority            |
| Trust on first use | Remembering the identity first observed; the first observation must still be trusted     |
| Anonymity set      | Plausible candidates under specified observations and assumptions, not just a UI counter |

---

## 7. How to know you are ready

Before presenting, check these without looking at the answers:

- [ ] I can explain payment privacy versus usage unlinkability versus network privacy.
- [ ] I can distinguish hashing, encryption, signing and blind evaluation.
- [ ] I can draw issuance and redemption with the right client/server boundaries.
- [ ] I know what is common across buyers and why it must be common.
- [ ] I can explain why a private verifier needs a secret key.
- [ ] I can explain one replay race and how the database resolves it.
- [ ] I can explain the first-use configuration limitation honestly.
- [ ] I can name the sensitive keys and where they belong.
- [ ] I can explain why the merchant still sees query content.
- [ ] I know what the current demonstration simulates and what it actually executes.
- [ ] I can explain lost-state and failed-response behavior without promising automatic recovery.
- [ ] I can complete the demo and answer follow-up questions without reading a script.

If one is unchecked, revisit the corresponding day. Do not compensate by making a broader privacy claim.

## 8. After the two weeks

For deeper study, revisit RFC 9497's group assumptions and proof construction, RFC 9576's alternative deployment models, and RFC 9578's publicly verifiable variant. Then study configuration transparency, independent client distribution, anonymous recovery protocols and oblivious transport as separate topics.

Your next milestone should be a small, reviewed extension of the existing design with a written threat model—not a home-grown replacement for the standardized cryptography.

**The end goal:** when someone asks “Why does this work?”, you can describe the mechanism; when they ask “When does it fail?”, you can describe the assumptions.
