# 10. Take a reference design toward production

The reference application is a useful foundation, but deployment is not a switch named `production`. Real payment scanning, key custody, failure recovery, network handling, and operational privacy each require an owner and evidence. The API does reject mock payments and missing explicit secrets when `BLINDPASS_ENV=production`; that guard catches a bad configuration, but it does not implement the missing systems.

## Establish a launch sequence

1. **Prove the payment rail.** Deploy a maintained Zcash scanner with an incoming viewing capability, unique Orchard-receiver address derivation, independent receiver validation, authenticated bridge calls, and replay-safe webhooks. Test on testnet with an external wallet. Reconcile missed events through the same payment handler. Keep spending authority outside the API.
2. **Publish a shared issuer policy.** Choose the signing identity, distribute its fingerprint independently, publish one manifest per common epoch, and define how clients detect inconsistent first-use views. Rehearse epoch rotation and preserve previous verification keys through the grace period.
3. **Protect and recover secrets.** Store merchant signing and VOPRF epoch secrets in a managed secret system, limit access, back them up with database state, and test restore. Define what happens if an issuer key is compromised or lost. The current code requires a restart to load the next epoch; schedule and test that operation.
4. **Resolve credit-loss semantics.** Persist encrypted pending blinding state or design a privacy-preserving replacement path. Define response-loss behavior after redemption. Document whether and how unissued paid invoices can be refunded. Do not claim recoverability before crash and ambiguity tests pass.
5. **Harden the edge.** Use TLS, trusted origin configuration, rate limits appropriate to expensive issuance and verification, payload limits, DoS budgets, and isolated service identities. Review all proxies and observability systems for capabilities, tokens, IPs, and queries. The application already limits body size and omits request logs, but an ingress may still log them.
6. **Operate with evidence.** Run dependency review, database migration checks, integration and stress tests, testnet scenarios, backup restore, key rotation drills, and an independent security review. Publish a release-specific verification record and its limitations.

These are workstreams, not features silently supplied by this repository. [`docs/deployment.md`](../docs/deployment.md) gives current environment variables and container behavior; [`docs/zcash.md`](../docs/zcash.md) gives the scanner contract.

## Keep data boundaries intact as features grow

Adding an admin dashboard, fraud tooling, refunds, analytics, or customer support can quietly recreate the link the protocol removed. Review each proposed field against the invariant: no redemption record points to an invoice, and no issuance record contains a finalized token. Prefer aggregate metrics. If a feature truly requires a join, state the privacy tradeoff and redesign the product claim; do not hide it in a new table or log stream.

The present search endpoint is a local fixed-cost PostgreSQL query. A production resource may be more expensive or irreversible. The transaction pattern must be reconsidered before protecting downloads, remote API calls, jobs, or financial actions. You may need a durable reservation/outbox protocol, expiration and recovery policy, and a way to explain ambiguous outcomes to the client without stable identity. This is a new design problem, not a configuration change.

## Make the operational limits visible to users

A production client should distinguish pending payment, confirmed payment, in-progress issuance, safely stored credits, expired credits, and ambiguous redemption. It should show the issuer identity and expiry, disclose whether transport is direct or proxied, and state that payment simulation is off. It should not promise “anonymous” usage solely because the credential is blind. Clear status and honest failure text are part of the security model: they prevent users from retrying in ways that double charge or reveal more information.

## Final architecture review

Before calling a deployment production ready, answer these questions with evidence:

- Can two new clients independently verify they received the same epoch policy?
- Can the scanner prove unique valid addresses and reconcile missed or reordered chain events?
- Can a client survive a crash after issuer commit without minting another batch?
- Can exactly one worker spend a credential under contention, and what happens after a lost response?
- Which infrastructure components can see a capability, token, IP, query, or payment timestamp, and how long do they retain it?
- Can keys and database state be restored together without replacing an epoch identity?
- Has the exact deployed composition received appropriate independent review?

The point of this book is to make those questions answerable. The demo supplies a concrete protocol path and testable invariants. Production readiness comes from closing the remaining gaps and verifying the result in the actual environment.
