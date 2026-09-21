# BlindPass: Colosseum Zcash Track Review

_Assessment date: September 21, 2026_

## Verdict

BlindPass can realistically place in the Colosseum Zcash track, but the current mock-payment version is not yet a strong favorite.

The track plans to award **$100,000 across the top 10 startups integrating ZEC**. BlindPass is technically differentiated enough to compete, provided the real Zcash payment path is completed before submission.

Source: [Zcash track announcement](https://forum.zcashcommunity.com/t/grant-proposal-colosseum-hackathon-zcash-track/57405)

## Why BlindPass can win

### Zcash is fundamental to the product

BlindPass does more than add a “Pay with ZEC” button. Shielded ZEC protects payment information at the blockchain layer, while blind credentials address the separate problem of linking a payment to later service usage.

The product communicates a strong and memorable insight:

> Private payment is not the same as private usage.

This distinction is understandable within seconds and demonstrates genuine knowledge of privacy engineering.

### The technical implementation is substantial

BlindPass includes:

- RFC 9578 privately verifiable tokens
- Client-side request blinding and credential unblinding
- Issuer proof verification
- Shared issuer epochs and configuration-policy enforcement
- Atomic single-use token redemption
- Concurrent replay protection
- Encrypted browser and CLI credential storage
- Malicious-issuer configuration tests
- A two-client unlinkability demonstration
- A privacy auditor and network-side-channel explanation
- Integration, concurrency, cryptographic and browser tests

The server stores no direct `invoice_id` to redeemed-token relationship. That privacy principle is represented in the database schema, API design, logs, tests and user interface rather than existing only in documentation.

### Previous winners validate the surrounding market

Colosseum has rewarded both privacy infrastructure and paid-access infrastructure:

- [Cloak](https://colosseum.com/projects/explore/cloak-or-solana-privacy-layer) — unlinkable transfer privacy infrastructure; third place in the September 2025 Stablecoins track and later Colosseum C4.
- [MCPay](https://colosseum.com/projects/explore/mcpay) — monetization for tools and data using HTTP payments; first place in the September 2025 Stablecoins track and later Colosseum C4.
- [CORBITS.DEV](https://colosseum.com/projects/explore/corbits.dev) — paid API infrastructure; second place in the September 2025 Infrastructure track.
- [DePlan](https://colosseum.com/projects/explore/deplan) — usage-based payments; fifth place in the March 2024 Consumer Apps track.

The closest project found in the historical corpus was [x402 Private Gateway](https://colosseum.com/projects/explore/x402-private-gateway). BlindPass has a clear differentiator: a merchant that follows the protocol cannot directly join an issuance transcript to the final redeemed bearer credential.

### The concept has strong cryptographic precedent

Historical blind-signature work describes the use of blinding for unlinkable bearer instruments. Modern private-payment research continues to examine unlinkability, self-custody and privacy-preserving reissuance.

Relevant reading:

- [Contracts with Bearer](https://nakamotoinstitute.org/library/contracts-with-bearer)
- [Private Electronic Payments with Self-Custody and Zero-Knowledge Verified Reissuance](http://arxiv.org/abs/2409.01958v3)

BlindPass is not claiming to implement every construction described by those sources. They establish the broader conceptual lineage for bearer credentials and issuance/redemption unlinkability.

## Why BlindPass might not win today

The largest weakness is that development mode currently simulates payment events:

> Default development mode simulates only payment events. It never simulates credential cryptography.

This is honest and appropriate for local development. However, judges may conclude that BlindPass is primarily a Privacy Pass demonstration with a Zcash-shaped payment boundary.

The Zcash track discussion specifically raised concerns about products that merely replace another payment rail with ZEC. BlindPass has a deeper privacy thesis than that, but it must demonstrate the difference with a working shielded payment integration.

Colosseum also evaluates more than engineering. Its published criteria include founder-market fit, insight, product execution, market size, founder communication, viability and traction.

Source: [Colosseum judging criteria](https://colosseum.com/hackathon)

## Current assessment

These ratings are subjective and are intended to identify priorities rather than predict the judging result.

| Dimension | Current assessment | Reason |
| --- | ---: | --- |
| Insight | 9/10 | “Private payment is not private usage” is clear, differentiated and technically valid. |
| Technical execution | 8.5/10 | The application implements real blind credentials, replay resistance, policy enforcement and a complete demo. |
| Differentiation | 8/10 | The payment-to-redemption unlinkability layer is distinct from ordinary paid APIs and payment privacy alone. |
| Current Zcash integration | 5/10 | The architecture is Zcash-aware, but the default functioning payment path is simulated. |
| Market validation | 4/10 | The repository demonstrates engineering depth, but not yet external demand, usage or revenue. |
| Presentation potential | 9/10 | The privacy comparison, attack demonstrations and honest limitations can produce a memorable judge presentation. |

## Highest-priority improvements

### 1. Complete one real shielded Zcash flow

Use a supported Zcash test network where practical and demonstrate the complete lifecycle:

1. Generate a real ZIP-316 Unified Address with an Orchard receiver.
2. Create a valid ZIP-321 payment URI.
3. Send shielded test ZEC from an external wallet.
4. Detect the transaction using incoming viewing capability rather than a spending key.
5. Show transaction detection, confirmations and block height.
6. Automatically authorize blind credential issuance.
7. Handle duplicate scanner events and pre-issuance reorgs safely.

The primary judge demonstration should not depend on the **Simulate payment confirmation** button. Mock payment mode should remain available for development and automated tests.

### 2. Provide verifiable integration evidence

Include:

- A testnet transaction identifier
- The observed block height and confirmation count
- Redacted scanner logs
- A screenshot or short recording from the external wallet
- A reproducible Zcash integration guide
- A clear distinction between testnet, simulated and production modes

Never include viewing keys, spending keys, webhook secrets or credential material in submission evidence.

### 3. Position search as the demonstration, not the entire company

The stronger product positioning is:

> BlindPass is privacy-preserving entitlement infrastructure for paid APIs, digital content and accountless services.

The search service is an effective fixed-cost demonstration, but the larger business opportunity is reusable merchant infrastructure.

Potential merchant categories include:

- Paid data APIs
- Research and search tools
- Private downloads
- Publisher paywalls
- AI and MCP tools
- VPN or relay day passes
- Accountless software features

These are target markets, not features that must all be implemented during the hackathon.

### 4. Obtain one external integration or design partner

An external API developer, documentation provider, publisher or download service using the BlindPass middleware would materially improve the submission.

The integration does not need production-scale volume. One credible external developer demonstrating that the middleware is understandable and useful is stronger evidence than another internal demo page.

### 5. Gather basic customer validation

Interview approximately five to ten API operators or digital-service developers. Ask:

- How do customers currently pay?
- Are accounts required only for billing and authorization?
- Are API keys or subscription sessions unnecessarily persistent?
- Do customers request stronger privacy?
- Would prepaid, single-use access credentials be useful?
- What integration or compliance concerns would prevent adoption?

Record the findings without collecting unnecessary personal information. The submission should summarize what changed in the product because of those conversations.

### 6. Make the technical demonstration prove separation

The judge demo should show:

1. An invoice database containing Alice and Bob’s paid invoices.
2. Issuance logs containing blinded requests.
3. A separate redemption database containing only domain-separated token hashes.
4. The absence of `invoice_id` from `redeemed_tokens`.
5. Identical public issuer configurations for both purchasers.
6. Shuffled redemption of Alice and Bob’s credentials.
7. Replay rejection with `TOKEN_ALREADY_SPENT`.
8. Forgery rejection with `INVALID_TOKEN`.
9. An invoice-specific issuer configuration rejected with `ISSUER_POLICY_VIOLATION`.

This converts the privacy claim into something judges can inspect rather than merely trust.

### 7. Lead the pitch with the product problem

The pitch video should prioritize:

1. The payment-to-usage correlation problem
2. The customer and merchant use case
3. A real shielded Zcash payment
4. Blind issuance and later redemption
5. Why the architecture is difficult to reproduce correctly
6. Market and distribution strategy
7. The team’s reason for continuing after the competition

Spend only enough time on cryptography to establish credibility. The separate technical-demo video can explain RFC 9578, issuer epochs, spent-token hashing and configuration consistency.

### 8. Explain the product moat

The moat is not the existence of a blind-signature library. The stronger engineering and product moat includes:

- Safe composition of shielded payment detection and blind issuance
- Strict merchant-configuration consistency rules
- Client-side issuer-policy enforcement
- Atomic single-use redemption
- Privacy-preserving logging and database design
- Merchant SDK and integration experience
- Clear operational guidance for anonymity-set management
- A trusted brand for honest privacy claims

### 9. Improve the developer distribution story

Before submission, provide:

- A minimal merchant integration example
- A minimal client integration example
- A working sample deployment
- Versioned SDK packages or clear package-distribution instructions
- An integration checklist
- A production-readiness checklist

The goal should be to make a developer understand the product in five minutes and run it locally in approximately fifteen minutes.

### 10. Disclose prior and AI-assisted work accurately

Colosseum permits pre-existing open-source components and AI development tools, but the submission must accurately disclose development completed before the competition and meaningful assistance received during it.

Only work completed during the competition period will be judged. The submission should identify:

- The repository state at the beginning of the competition
- Features completed during the competition
- External libraries and protocols used
- AI tools used, including Codex
- The founder’s direct technical, product and research contributions

The founder should be able to explain every important architectural, cryptographic and privacy decision during a judge interview.

## Recommended submission message

> Zcash protects the payment from the public chain. BlindPass addresses what happens next. It lets a merchant confirm that someone paid, issue standardized single-use credentials through a blind protocol, and later accept those credentials without receiving a direct cryptographic identifier that joins payment to usage. Our demo uses private search credits, but the infrastructure is designed for paid APIs and accountless digital services. Network anonymity remains a separate layer, and the product explains that limitation explicitly.

## Final assessment

BlindPass should be submitted.

With a real shielded Zcash payment path and credible external validation, it can become a serious top-10 Zcash-track contender. Without the live Zcash integration, it remains an impressive cryptographic and product prototype but gives judges a straightforward reason not to select it.

The highest-leverage sequence is:

1. Complete the real testnet payment path.
2. Record a reproducible end-to-end demonstration.
3. Validate the problem with potential merchants.
4. Secure one external integration or design partner.
5. Present BlindPass as merchant infrastructure, with private search as the first demonstration.
