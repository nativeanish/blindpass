# Building BlindPass: Zero-Knowledge Access and Blind Credentials in TypeScript

> **Part 0 — Front Matter**

*In this chapter*
- Overview of the BlindPass project
- About this book and its structure
- Prerequisites and lab setup
- About the core technologies: Privacy Pass, VOPRF, and Zcash
- Reading conventions, notations, and sidebars

BlindPass sells access without creating an identity record. A buyer pays a
fixed amount to a shielded Zcash receiver, receives ten blindly issued Privacy
Pass tokens, and later spends each token exactly once. PostgreSQL knows which
invoices were paid and which token hashes were spent, but no table joins those
facts. Correct VOPRF issuance denies the merchant a cryptographic link as well.

The title uses “zero-knowledge” in the broad product sense: the access service
learns no account identity and the blind protocol reveals no token input during
issuance. RFC 9578 token type `0x0001` is a VOPRF construction with a DLEQ proof;
it is not a general-purpose SNARK and this book never presents it as one.

## About this book

### Who should read this book
This book is written for intermediate to senior TypeScript engineers, backend developers working with privacy-enhancing technologies, and security engineers. If you are building systems that demand strong guarantees of user anonymity and data minimization, or if you simply want to see how to wire together modern cryptographic primitives in a robust monorepo, this book is for you.

### How this book is organized
This edition is organized as five construction parts spanning 13 chapters. Do not read a chapter as an isolated survey. Begin each part with the previous checkpoint running, make the described files, and run the narrow test before moving on. Every chapter uses the same rhythm:

1. **State the invariant.** Write down what must remain true under failure and concurrency.
2. **Place the boundary.** Decide which package owns that invariant and what it is forbidden to know.
3. **Build in passes.** Add types first, then the smallest working path, then rejection and recovery behavior.
4. **Read the complete file.** Listings are expanded from the live workspace, so imports, exports, and error branches are present.
5. **Break it deliberately.** Run a focused test that attacks the new boundary.
6. **Checkpoint.** Leave the repository compiling before the next chapter.

### About the code
This is an executable book. Every TypeScript listing is runnable, verifiable by our test suite, and expanded directly from the live workspace. Real Privacy Pass cryptography is never mocked, though development payment events are conspicuously simulated.

### Prerequisites
To follow along with the live workspace, you need:
- Node.js 22 or newer
- TypeScript 5.9+
- Docker (for database and services)
- pnpm 9.10+
- PostgreSQL 17
- Basic familiarity with elliptic-curve cryptography is helpful, but not strictly required.

## About the technology
BlindPass stands on the shoulders of modern privacy standards. 
- **Privacy Pass (RFC 9578)**: A protocol for authorizing clients without passing identity information, allowing services to issue tokens that can be redeemed later anonymously.
- **VOPRF (Verifiable Oblivious Pseudorandom Function)**: The cryptographic engine driving our Privacy Pass implementation (specifically token type `0x0001`). It allows a server to evaluate a function on client-provided data without learning the data, while proving to the client that the evaluation was done correctly.
- **Zcash Orchard shielded payments**: Provides the financial privacy layer. Shielded payments ensure that the payment trail cannot be linked back to the token redemption. 

Together, these technologies decouple payment from access, creating a robust zero-knowledge credential system.

## Notation and convention guide

This book uses standard Manning "In Action" conventions. 

### Code listings and annotations
Code listings will always include the file path and numbered annotations (`// <1>`, `// <2>`) pointing to key architectural details.

```typescript
// File: src/example.ts
function authenticate(token: Token) {
  verifyToken(token); // <1>
}
```
> **<1>** Explanation of why this code exists and what breaks if changed.

After every code listing, a **▶ Try It Out** block demonstrates how to execute the code to verify your progress:

> **▶ Try It Out**
> ```bash
> pnpm test example
> ```
> You should see a successful assertion of the token verification.

### Diagrams
All system interactions, pipelines, and sequence diagrams are rendered in ASCII art for clarity directly in your text environment:

```text
┌──────────┐          ┌──────────┐
│  Client   │──────────│  Server   │
└──────────┘          └──────────┘
```

### Sidebars
You will encounter several types of sidebar boxes containing crucial context:

> **⚠ PITFALL: Watch your async boundaries**
>
> Explains common mistakes with code examples if applicable.

> **🔒 SECURITY NOTE: Key material handling**
>
> Security-critical information regarding cryptographic keys.

> **📖 DEFINITION: Zero-Knowledge**
>
> Definition of terms and concepts.

> **💡 TIP: Local testing**
>
> Helpful productivity tips for the monorepo.

## Parts and construction checkpoints

| Part             | Chapters | What exists at the checkpoint                                                  |
| ---------------- | -------- | ------------------------------------------------------------------------------ |
| I — Foundations  | 1–3      | Strict monorepo, domain types, privacy-shaped PostgreSQL schema                |
| II — Credentials | 4–6      | Blind issuance, atomic redemption, pinned issuer policy                        |
| III — Payments   | 7–8      | Exact ZEC arithmetic, scanner adapter, authenticated reorg-aware events        |
| IV — Clients     | 9–11     | Encrypted CLI and browser vaults, complete SDK flow, fail-closed Tor transport |
| V — Assurance    | 12–13    | Model and attack suite, production build and operating controls                |

## Contents

1. The Accountless Architecture
2. Oblivious Pseudorandom Functions in Practice
3. Monorepo Foundation & Schema Design
4. The Blind Issuance Pipeline
5. Redemption Middleware & Transactional Double-Spend Prevention
6. Issuer Integrity & Configuration Anchoring
7. Shielded Payment Architecture (Zcash Orchard)
8. Watchers, Webhooks, and Reorg Resistance
9. The Encrypted Node.js CLI & Secret Storage
10. The Web Client & Hardware-Bound Web Crypto
11. Network Privacy & Routing Through Tor
12. End-to-End Stress Testing & Formal Verification
13. Operational Security & Threat Realities

## Standards and primary sources

The implementation is grounded in [RFC 9578](https://www.rfc-editor.org/rfc/rfc9578)
for Privacy Pass issuance, [RFC 9497](https://www.rfc-editor.org/rfc/rfc9497)
for the VOPRF, [RFC 9577](https://www.rfc-editor.org/rfc/rfc9577) for HTTP
authentication, and [ZIP 316](https://zips.z.cash/zip-0316) for Unified
Addresses. The deployed libraries are Cloudflare's
[`privacypass-ts`](https://github.com/cloudflare/privacypass-ts) and
[`voprf-ts`](https://github.com/cloudflare/voprf-ts). Read normative words in
those specifications as authoritative when they differ from explanatory prose.

## Laboratory setup

```bash
corepack enable
pnpm install --frozen-lockfile
docker compose up -d postgres
pnpm db:migrate
pnpm test
```

The examples assume `localhost:3000` is the issuer origin and `localhost:3001`
is the API. Never pay a `SIMULATED-NOT-PAYABLE-...` address.

### Build checkpoint
By the end of this front matter, you should understand the structure of this book, the underlying technologies (Privacy Pass, VOPRF, Zcash), and how to read the code annotations and sidebars. You are now ready to begin the laboratory setup and proceed to Part I.
