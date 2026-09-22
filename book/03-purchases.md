# 3. Model purchases without accounts

The invoice is a commercial agreement and a capability-protected workflow handle. It is not an identity record. This distinction drives both the database and API design.

## Start with a bounded offer

The migration inserts one enabled offer: `search-10`, ten `search-v1` credits for the decimal amount `0.01`. The API accepts that exact offer ID. Amounts are stored as decimal strings and compared after conversion to integer zatoshis; floating-point money comparisons are inappropriate. The example does not encode a customer marker into a payment amount or memo. A unique destination belongs to each invoice, so the scanner can attribute an incoming payment without adding an extra identifier to the chain memo.

The important tables in [`infra/migrations/001_initial.sql`](../infra/migrations/001_initial.sql) are `invoices`, `invoice_payment_events`, and `issuance_authorizations`. An invoice stores the fixed offer terms, payment destination, common epoch, configuration hash, deadline, and state. `issuance_authorizations` has one row per invoice. It does not store a final credential. The capability hash is unique; the plaintext capability exists only at creation and in the client vault.

## Sign the terms the payer needs to verify

[`InvoiceService.create`](../apps/api/src/invoices.ts) constructs a document containing the invoice ID, offer ID, amount, count, class, common issuer-configuration hash, address, confirmation policy, deadlines, and refund policy. The merchant signs its canonical JSON with Ed25519. The client checks the signature and compares every relevant signed field to the response it will act on, then reconstructs the payment URI from the signed address and amount.

This signature solves an integrity problem: a transport or application bug must not silently change the address or price shown to the payer. It does not make the merchant honest. The client must already trust or pin the merchant signing identity. A signing fingerprint learned on first use is vulnerable on that first connection. For a production client, distribute a trusted fingerprint through a channel independent of the merchant endpoint and review how clients handle signing-key rotation.

The issuer configuration is signed separately. It defines one shared epoch key, class, batch size, validity interval, and origin. The invoice contains its hash, so a purchase cannot quietly move to another configuration after payment. The client also caches an accepted configuration and rejects a different one during the same epoch. A malicious merchant could still give two first-time clients different _validly signed_ manifests; transparency or independent configuration publication is needed to address that case.

## Capabilities are authority

`GET /api/invoices/:capability` hashes the supplied capability and finds the invoice by the hash. `POST /api/issuance` similarly requires the capability. This is a bearer authorization scheme without accounts. A leaked capability can expose invoice state and attempt issuance, so the CLI and browser encrypt it at rest. The invoice ID remains useful for support and for the development payment simulator, but knowing it alone does not authorize issuance.

Do not put the capability in analytics, referrers, screenshots, or ordinary request logs. The API disables request logging and returns `Cache-Control: no-store` and `Referrer-Policy: no-referrer`; an operator must apply the same discipline at proxies, CDNs, tracing systems, and error collectors. URL path capabilities are especially easy to capture in infrastructure logs. A production revision could move capability reads into a private header or request body after evaluating interoperability and caching behavior.

## Exercise: trace a tampered invoice

Read [`BlindPassClient.buy`](../packages/blindpass-client/src/index.ts). Choose one field—amount, payment address, credit count, or configuration hash—and imagine the API returns a changed unsigned copy while retaining the original signed document. Identify the exact comparison that stops the client from paying or accepting the wrong terms. Then imagine the merchant signs the changed document itself. The signature now verifies; the remaining protection is the client's fixed-offer and configuration policy, plus the user's trust in the merchant.

**Production review question.** What should happen to funds received after the payment deadline? The reference application expires the invoice and does not authorize issuance. A real merchant needs an operational late-payment and refund process that does not claim to know or recover already issued anonymous credits.
