# 18. Integrate a real Zcash scanner

The mock watcher is useful because it lets developers exercise payment-state logic without a wallet or chain. It says nothing about the correctness of a real payment rail. A production scanner is a separate service with a privacy-sensitive incoming viewing capability and a narrow contract to the merchant API.

## Define ownership first

The scanner owns address derivation, validation, chain synchronization, incoming payment attribution, confirmation counts, and reorg detection. The merchant API owns invoice terms and the transition from a valid payment observation to issuance authority. The scanner must not hold the merchant's VOPRF issuer secret. The merchant API does not need a Zcash spending key. A separately secured wallet can hold spending authority.

The bridge request in [`docs/zcash.md`](../docs/zcash.md) asks for an invoice destination with a specified network, Orchard receiver, amount, and empty memo. The bridge returns a unique diversified Unified Address plus explicit receiver/validation metadata. [`ScannerPaymentWatcher.createInvoice`](../packages/zcash/src/scanner.ts) checks the response shape, invoice ID, network, Orchard presence, absence of listed transparent receiver types, and validation flags. These flags are assertions from the scanner, not independent proof. Test the scanner's actual library-derived address against an independent decoder and wallet on testnet.

## Observe value without floating-point ambiguity

An event contains stable event ID, invoice ID, transaction ID, decimal amount, block height, confirmation count, and reorg flag. The merchant compares amount after conversion to integer zatoshis. A scanner should bind an observed output to the invoice destination before emitting the event; otherwise a valid transaction elsewhere could be falsely attributed. Define how multiple outputs, partial payments, overpayments, and replacements aggregate. The reference API checks one event amount against the full required amount; it does not implement a general partial-payment accumulator. If your business policy accepts partial payments, design that ledger explicitly before launch.

Confirmation thresholds should be selected for economic exposure and chain behavior. The current default is three. A confirmed payment creates authorization to issue, but issuance is irreversible from the merchant's viewpoint once blind tokens are finalized. A later reorg becomes merchant risk. A high-value product may need a higher threshold or different risk limits; the client must be told the policy in the signed invoice before paying.

## Authenticate and replay-protect webhook delivery

The bridge signs `timestamp + "." + exact raw JSON body` with HMAC-SHA-256. The API verifies the signature with a timing-safe comparison and rejects timestamps outside a five-minute window. It parses only after authentication and records event IDs uniquely. Use TLS or a trusted isolated network to protect the API credential and webhook secret in transit. Rotate those secrets with an overlap policy and test both versions during rollout. Never log the raw signed body if it contains sensitive payment observations.

An HMAC prevents outsiders from forging a callback with no secret. It does not protect against a compromised scanner, a bug in chain attribution, or a scanner operator who can see incoming payments. Put scanner deployment, key access, and code review inside the threat model. Limit the incoming viewing capability to the required wallet/account and store it separately from signing and API secrets.

## Reconcile, do not rely on one webhook

Webhooks are at-least-once notifications at best. Delivery can fail, arrive late, repeat, or reorder. The bridge also exposes `GET /v1/invoices/:id/payment`; the running reference API does not schedule reconciliation itself. A production worker should periodically fetch active invoice observations, feed them through the _same_ validated state handler, and compare the scanner's canonical view with the merchant database. Use a stable observation ID for an identical event so repeats are idempotent. New confirmation or reorg observations need new IDs. Alert on an invoice whose scanner view and authorization state disagree past a defined interval.

Plan for scanner restart and chain rescan. Store a birth height or equivalent scan checkpoint with backups. On recovery, rescan enough history to detect missed outputs and reorgs; deduplication makes repeated observations safe. Test a scanner outage that spans an invoice deadline. Funds received late or confirmed after expiry need a disclosed manual resolution policy; the API will not silently issue.

## A testnet acceptance plan

1. Derive two destinations and prove they are distinct, valid for testnet, and contain the intended Orchard receiver using independent tooling.
2. Send one external testnet shielded payment to an invoice address; verify amount, transaction, and confirmations against a separate wallet or node view.
3. Confirm the API remains unissued below threshold and creates one authorization at threshold.
4. Replay callbacks, reorder a confirmation event, modify the signed raw body, and send a stale timestamp; verify the expected rejection or idempotent behavior.
5. Simulate a reorg before issuance, then after issuance; verify state and merchant-risk accounting.
6. Stop the scanner, allow a payment, restart and reconcile. Confirm the final invoice state without a second authorization.
7. Inspect application, ingress, scanner, and database logs for viewing capability, API key, webhook secret, payment address history, and invoice capability exposure.

The default repository tests cover adapter authentication and policy shape, not these live chain steps. Keep the distinction visible in a release record. Mainnet should remain a separate deployment decision after testnet evidence and independent security review.
