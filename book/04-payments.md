# 4. Receive and validate payment events

The payment adapter is a trust boundary, not a wallet implementation. BlindPass defines `PaymentWatcher` with invoice creation, invoice lookup, and event subscription. Development uses `MockPaymentWatcher`; scanner mode uses an authenticated bridge. The merchant API has no spending key.

## What the real scanner must do

For each invoice, a real bridge must derive a distinct diversified ZIP-316 Unified Address with an Orchard receiver, validate it with maintained Zcash tooling, and observe incoming payments through an incoming viewing capability. It must verify that a reported output belongs to the assigned invoice address and that the network is the configured testnet or mainnet. The bridge returns the address and later emits observations containing amount, transaction ID, block height, confirmations, and reorg status. [`docs/zcash.md`](../docs/zcash.md) specifies the request and webhook shapes.

The adapter checks response fields and receiver policy; it cannot independently prove the scanner actually derived or validated the address. That is why a scanner API credential, authenticated transport, operational review, and independent integration tests matter. The HMAC on a webhook proves that the configured bridge sent those bytes. It does not prove the bridge's claim about the chain is true.

## Authenticate raw events and make them idempotent

[`packages/zcash/src/scanner.ts`](../packages/zcash/src/scanner.ts) authenticates `timestamp + "." + exact raw JSON body` with HMAC-SHA-256, checks a five-minute freshness window, and uses timing-safe comparison. The exact bytes matter: parsing and reserializing JSON before verification can change spacing or key order. The API scopes a raw-body parser to the webhook route for this reason.

After authentication and schema validation, [`InvoiceService.payment`](../apps/api/src/invoices.ts) locks the invoice row in a transaction. It inserts the event ID with `ON CONFLICT DO NOTHING`; duplicate delivery exits without issuing twice. It converts decimal ZEC amounts to integer zatoshis before comparing them to the required price. A sufficient observation below the confirmation threshold updates the waiting state. An observation at or above the configured threshold creates one authorization row. The unique invoice key on that row is a second defense against duplicate issuance authority.

One event ID should represent one stable observation. A later confirmation count or reorg is a _new_ observation with a new ID. If the bridge reuses an ID for materially different data, deduplication will intentionally ignore it. This contract needs to be tested between the scanner and API.

## Reorgs expose the irreversibility boundary

Before issuance, a reorg changes the invoice to `PAYMENT_REORGED` and deletes an unconsumed authorization. The client may receive a later valid payment observation before the deadline. After issuance, the merchant cannot identify and revoke the ten unblinded tokens without compromising the intended privacy design. The implementation records an aggregate event and bears the risk. A production merchant should set a confirmation policy based on value and chain risk, monitor reorgs, and reserve for losses. Raising the confirmation threshold is a business and latency tradeoff, not a cryptographic fix.

Late payments are also an operations problem. The code does not mint credits for an expired invoice even if the scanner later sees enough funds. A production system needs a disclosed resolution process, with support evidence and refund handling for _unissued_ purchases. It must not promise automatic replacement of anonymous tokens after issuance.

## Exercise: model a missed webhook

Suppose the scanner observes a confirmed payment, but the webhook is lost. The bridge contract includes `GET /v1/invoices/:id/payment` for reconciliation. The current running API primarily processes subscribed webhook events; a production deployment should schedule a reconciliation worker that fetches observations and feeds the same validated payment handler. Design its cursor, retries, duplicate IDs, alert on prolonged disagreement, and behavior after a process restart. Reuse the transaction logic rather than inventing a second path that can issue credits differently.
