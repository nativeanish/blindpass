# 12. Glossary and primary references

## Terms used in this book

**Anonymity set.** The plausible group of people who could have made a particular redemption. A common token class enables pooling, but the practical set depends on real users and metadata. The API cannot infer distinct people from invoice count.

**Bearer capability.** A secret whose possession authorizes an action. The invoice capability authorizes invoice lookup and issuance after payment; a credential authorizes one resource use. Neither is an account identity.

**Blind issuance.** A protocol in which the client obtains a valid credential while hiding its final token input from the issuer during evaluation. It prevents a direct cryptographic match under the protocol assumptions, not all operational correlation.

**Challenge/context.** Common application information cryptographically bound to a token. BlindPass uses class, epoch, expiry, issuer, and origin scope. Putting invoice-specific information here would undermine pooling.

**Confirmation.** A payment observation's depth in the selected chain. The required count is an operational risk policy; a reorg can still happen.

**DLEQ proof.** The library's proof that the blinded evaluation is consistent with the advertised VOPRF public key. The client checks it while finalizing.

**Epoch.** A common UTC calendar month with one shared issuer key and deterministic dates. Issuance ends at the next month boundary; verification continues through a shared seven-day grace period.

**Idempotency.** Repeating the same operation yields the same result without a second economic effect. BlindPass returns stored issuance responses only for the identical blinded request digest.

**Incoming viewing capability.** Zcash wallet material that lets a scanner observe incoming payments without granting spending authority. It is still privacy-sensitive because it reveals payment observations to the scanner.

**OHTTP.** Oblivious HTTP, a possible future network privacy layer. It is not implemented here and would not hide queries from the destination service.

**Reorg.** A chain reorganization that can invalidate a previously observed payment. Before issuance, the authorization can be revoked; after issuance, the merchant bears the risk without linking or revoking anonymous tokens.

**Spent-token hash.** A domain-separated digest of canonical token bytes stored under a unique database key to reject replay. It is not the raw token and has no invoice foreign key.

**VOPRF.** A verifiable oblivious pseudorandom function. The client blinds an input, the issuer evaluates it under a secret key with a proof, and the client unblinds. BlindPass uses the RFC 9578 privately verifiable token protocol on P-384/SHA-384.

## Follow the standards and source

The repository pins protocol library versions in [`package.json`](../package.json). For normative protocol details, read [RFC 9576: Privacy Pass Architecture](https://www.rfc-editor.org/rfc/rfc9576.html), [RFC 9577: HTTP Authentication Scheme](https://www.rfc-editor.org/rfc/rfc9577.html), [RFC 9578: Issuance Protocols](https://www.rfc-editor.org/rfc/rfc9578.html), and [RFC 9497: Oblivious Pseudorandom Functions](https://www.rfc-editor.org/rfc/rfc9497.html). The [Cloudflare Privacy Pass implementation](https://github.com/cloudflare/privacypass-ts) and [VOPRF implementation](https://github.com/cloudflare/voprf-ts) are the libraries used by this checkout. For Zcash integration details, start with the repository's [bridge contract](../docs/zcash.md) and verify it against the current Zcash protocol and wallet libraries before deployment.

Standards describe protocol behavior; this application adds business rules, persistence, privacy policy, and deployment assumptions. Review both layers. A standards-compliant token implementation can still be deployed with a unique per-user key, leaky logs, or a scanner that misattributes payments.
