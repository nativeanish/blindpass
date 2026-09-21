# Zcash payment integration

## Honest integration status

The default watcher is a deterministic local simulator. It does not connect to Zcash, validate a chain transaction, derive an Orchard address or hold a viewing key. Its destination starts `SIMULATED-NOT-PAYABLE-`; the displayed URI is a non-payable sample. Every corresponding UI and CLI flow is labeled simulated.

The real adapter is an implemented HTTP client and authenticated webhook boundary for a **self-hosted scanner bridge**. A bridge backed by established Zcash wallet/scanning libraries must be deployed separately. This project does not invent CipherPay methods, claim a live CipherPay account, or fabricate production responses.

## Standards and address choice

- [Orchard protocol](https://zips.z.cash/protocol/protocol.pdf) is the shielded protocol supported by the receiving design. A payment can have privacy-relevant effects beyond protected note contents, especially when transparent inputs/outputs or pool crossings are involved.
- [ZIP 316](https://zips.z.cash/zip-0316) defines Unified Addresses and Unified Viewing Keys. An address must be decoded, checksum-checked and inspected for receiver contents; the `u`/`utest` prefix alone is insufficient to establish Orchard support. The bridge must return an Orchard-capable shielded address and not a transparent fallback. Emerging ZIP revisions must be supported deliberately by the actual wallet libraries.
- [ZIP 321](https://zips.z.cash/zip-0321) defines the `zcash:` payment URI. BlindPass uses `zcash:<address>?amount=0.01`, no memo, and no invoice ID encoded into the amount.

The scanner derives a unique diversified receiving address per invoice. The price is identical across purchasers. Diversification is a wallet/receiver property and is not simulated as a cryptographic operation in application code.

## Viewing capabilities

An incoming viewing capability can reveal incoming payment information without authorizing spending. A Unified Incoming Viewing Key can contain the receiver-specific incoming capabilities needed by the selected scanner. Full viewing capabilities reveal more; use the least capability practical for the scanner implementation.

The API server only needs a scanner API credential and webhook authentication key. Keep the actual viewing capability in the scanner, not the browser or ordinary API environment. `ZCASH_VIEWING_KEY` is documented as a scanner deployment placeholder and is not read or logged by BlindPass. A merchant spending key must never be supplied to this server. The merchant can spend from a separately secured wallet.

## Bridge contract

Set:

```dotenv
ZCASH_PAYMENT_MODE=scanner
ZCASH_NETWORK=testnet
ZCASH_SCANNER_URL=https://your-scanner.example
ZCASH_SCANNER_API_KEY=<secret from your scanner>
ZCASH_WEBHOOK_SECRET=<at least 32 random secret characters>
ZCASH_CONFIRMATIONS=3
```

The bridge must authenticate `Authorization: Bearer <scanner-api-key>`.

### Derive invoice destination

```http
POST /v1/invoices
Content-Type: application/json

{
  "invoiceId": "inv_<uuid>",
  "amount": "0.01",
  "network": "testnet",
  "receiver": "orchard",
  "memo": ""
}
```

Expected bridge response:

```json
{
  "invoiceId": "inv_<same-uuid>",
  "address": "<actual library-derived and validated testnet Unified Address>",
  "network": "testnet",
  "receiverTypes": ["orchard"],
  "diversified": true,
  "validated": true
}
```

The example angle-bracket address is documentation, not a fabricated valid address. BlindPass checks response shape, invoice, network and Orchard/transparent receiver policy. It **trusts the scanner’s actual Zcash-library validation**; it does not perform a fake prefix check and call that validation. Database uniqueness rejects reuse of a destination.

### Polling

`GET /v1/invoices/:id/payment` returns `null` when no observation exists, otherwise the event shape below. The adapter implements this for reconciliation. The running reference API receives events through webhooks; production operators should schedule reconciliation through the same validated payment handler to recover missed webhooks.

### Payment webhook

```http
POST /webhooks/zcash/payment
Content-Type: application/json
X-Blindpass-Timestamp: <UTC Unix seconds>
X-Blindpass-Signature: <lowercase hex HMAC-SHA256>
```

```json
{
  "eventId": "<stable unique observation ID>",
  "invoiceId": "inv_<uuid>",
  "txid": "<actual observed transaction ID>",
  "amount": "0.01",
  "blockHeight": 123456,
  "confirmations": 3,
  "reorg": false
}
```

Compute `HMAC-SHA256(webhook_secret, timestamp + "." + exact_raw_JSON_body)`. BlindPass uses timing-safe comparison, a five-minute freshness window, strict payload validation and event-ID deduplication. Identical retries must retain the event ID; new confirmation/reorg observations need a new ID. The bridge must verify that the observed output belongs to the assigned invoice address. An HMAC authenticates the bridge, not the underlying truth of its claim.

The fixture at `infra/fixtures/payment-webhook.json` is explicitly not a transaction. Tests cover signature failure, modified raw bytes, stale timestamps and invalid receiver policy. The mock endpoints can exercise pending, detected, waiting-confirmation, confirmed, duplicate and reorg states without any external service.

## Testnet procedure

1. Deploy a scanner backed by a maintained Zcash wallet/scanning library, initialized with an appropriate testnet incoming viewing capability and birth height.
2. Implement the above bridge contract, address validation and signed callbacks. Test receiver decoding and diversified address allocation independently.
3. Set scanner mode and testnet in BlindPass; do not configure a spending key. Expose the webhook to the scanner over authenticated TLS or a trusted isolated network.
4. Create an invoice, inspect the actual Unified Address with an independent wallet, and pay from an external testnet wallet with Orchard support.
5. Confirm scanner observations match the payment and confirmation policy. Only then issue real credentials and redeem a query.
6. Test duplicate callbacks, missing callbacks, reorgs, underpayment, late payment and process restart before relying on the integration.

No real network transaction was performed as part of the default build. Faucet access, compatible wallet software, network synchronization and bridge credentials are external requirements. Mainnet needs explicit `BLINDPASS_ALLOW_MAINNET=true` in addition to production secrets and deliberate operator review; BlindPass never automatically sends a mainnet transaction.

## What each observer sees

The public chain observer sees public transaction metadata and any unshielded components. The incoming scanner sees payment details available under its viewing capability. The merchant knows which invoice/address was paid and may know payment timing. Shielded receipt does not conceal subsequent API calls from that merchant. Correct blind issuance removes the direct cryptographic invoice-to-token matching mechanism; network privacy is separate.
