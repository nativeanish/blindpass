# 1. The system and its trust boundaries

An ordinary paid API links a purchase to an API key or account. The API then learns which paid customer made every request. BlindPass changes the authorization question. At purchase time the merchant asks, “Was this invoice paid?” At use time it asks, “Is this one credential valid and unspent?” The use request carries no invoice ID. The two questions are separated by blind issuance.

The complete flow has four stages:

```text
External wallet → invoice/payment observation → authorization to issue
Local client → blinded requests → issuer evaluations → local finalization
Local vault → one credential → API verifier → spent-token database
                                      ↘ fixed-cost search transaction
```

The application spans a Next.js front end, Fastify API, PostgreSQL, CLI, shared TypeScript packages, and a Zcash scanner adapter. The core responsibilities are narrower than the package count suggests. [`apps/api/src/invoices.ts`](../apps/api/src/invoices.ts) creates the purchase contract. [`apps/api/src/issuance.ts`](../apps/api/src/issuance.ts) consumes a paid authorization. [`packages/privacy-pass/src/index.ts`](../packages/privacy-pass/src/index.ts) wraps a reviewed protocol library. [`packages/blindpass-server/src/index.ts`](../packages/blindpass-server/src/index.ts) verifies and reserves a credit. [`packages/blindpass-client/src/index.ts`](../packages/blindpass-client/src/index.ts) enforces merchant policy and owns the resulting tokens.

## Separate authority from identity

An invoice ID is a database locator, not a secret. BlindPass also creates a random capability; only its hash is stored. The capability lets a client read its invoice and request issuance after payment. It is a bearer secret and must be kept in the local encrypted store. This design avoids creating a user table while still allowing the purchaser to complete an asynchronous payment.

An issued credential is a _different_ bearer secret. It proves permission to perform one search, not knowledge of the invoice capability. The redemption service has no invoice lookup. The schema deliberately gives `redeemed_tokens` no invoice foreign key. This is a structural privacy control: a developer cannot accidentally join a redemption to a purchase using that table. It is not a guarantee against timing or log correlation.

## Identify the observers

A public blockchain observer, merchant, payment scanner, API operator, browser host, reverse proxy, and network observer have different views. Shielded Zcash payment protects on-chain payment fields under its own assumptions; it does not hide information from the merchant's incoming viewing capability. Blind issuance prevents the issuer from deriving the final token from a correctly blinded issuance request. It does not hide the client's IP address. Optional Tor transport changes network exposure but does not hide a revealing query or a compromised device.

Make these distinctions explicit in an architecture review. A single label such as “private payment” leaves reviewers guessing which observer is excluded. The useful artifact is a table of actors, observations, and assumptions, like the repository's [`docs/threat-model.md`](../docs/threat-model.md).

## Why one fixed-cost search?

The example offer is `search-10`: 0.01 ZEC for ten `search-v1` credits. One credential pays for one local search. A fixed price and fixed batch size reduce obvious per-customer fingerprints. They also keep redemption transactional: the search query runs inside the same PostgreSQL transaction that reserves and spends a credential. There is no remote irreversible operation between those steps.

This simplicity is deliberate. A variable-cost API, refund, transfer, subscription, or metered stream needs additional protocol and accounting design. The server middleware explicitly accepts `cost: 1` only. Treat that restriction as an invariant, not an unfinished parameter to raise casually.

## Design exercise

Draw three data stores: invoices, issuance authorizations, and redeemed tokens. For each, list who writes it and which secret values it must never contain. Then ask how an operator might still correlate a particular purchase with a request. If your answer is “they cannot because there is no foreign key,” revisit timestamps, IP addresses, browser delivery, and small anonymity sets before continuing.
