# Building Zero-Knowledge & Blind Credential Systems

## Constructing BlindPass from Scratch

BlindPass sells access without creating an identity record. A buyer pays a
fixed amount to a shielded Zcash receiver, receives ten blindly issued Privacy
Pass tokens, and later spends each token exactly once. PostgreSQL knows which
invoices were paid and which token hashes were spent, but no table joins those
facts. Correct VOPRF issuance denies the merchant a cryptographic link as well.

The title uses “zero-knowledge” in the broad product sense: the access service
learns no account identity and the blind protocol reveals no token input during
issuance. RFC 9578 token type `0x0001` is a VOPRF construction with a DLEQ proof;
it is not a general-purpose SNARK and this book never presents it as one.

This is an executable book. Every TypeScript listing names its workspace path
and is expanded from the same file that the tests execute. Commands run from
the repository root on Node.js 22 or newer. PostgreSQL examples target version 17. Development payment events are conspicuously simulated; real Privacy Pass
cryptography is never mocked.

### Contents

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

### Standards and primary sources

The implementation is grounded in [RFC 9578](https://www.rfc-editor.org/rfc/rfc9578)
for Privacy Pass issuance, [RFC 9497](https://www.rfc-editor.org/rfc/rfc9497)
for the VOPRF, [RFC 9577](https://www.rfc-editor.org/rfc/rfc9577) for HTTP
authentication, and [ZIP 316](https://zips.z.cash/zip-0316) for Unified
Addresses. The deployed libraries are Cloudflare's
[`privacypass-ts`](https://github.com/cloudflare/privacypass-ts) and
[`voprf-ts`](https://github.com/cloudflare/voprf-ts). Read normative words in
those specifications as authoritative when they differ from explanatory prose.

### Laboratory setup

```bash
corepack enable
pnpm install --frozen-lockfile
docker compose up -d postgres
pnpm db:migrate
pnpm test
```

The examples assume `localhost:3000` is the issuer origin and `localhost:3001`
is the API. Never pay a `SIMULATED-NOT-PAYABLE-...` address.
