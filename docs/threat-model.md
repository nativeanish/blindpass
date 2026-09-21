# Threat model

## Intended guarantee

With correct RFC 9578 use, independent client behavior, securely held keys and a genuinely shared accepted configuration, an issuance transcript does not supply a direct cryptographic identifier matching a later redemption. This does not prevent statistical or operational correlation.

## Actors and observations

| Actor | Can observe | What the implemented boundary changes |
| --- | --- | --- |
| Public blockchain observer | Public transaction metadata, pool interactions and any transparent components | A fully shielded payment hides its protected values and recipients on-chain; chain metadata is not erased |
| Merchant | Invoice amount/destination, scanner observations, blind requests, later tokens, requests, timing and endpoint network metadata | Blinding removes a direct invoice-to-final-token cryptographic join |
| Payment scanner | Incoming payment data exposed by its viewing capability and invoice address assignment | No spending authority is required; scanner remains a privacy-sensitive trust party |
| ISP | Subscriber network traffic metadata and relay/service destinations visible at its vantage | Tor changes exposure; it does not defeat all traffic analysis |
| CDN / reverse proxy | Terminated HTTP contents, IPs, headers, timings, possibly tokens and queries | App log redaction does not control CDN logging; avoid or explicitly trust/configure this layer |
| Passive network observer | Traffic at observed links, sizes and timings | TLS hides contents on the wire; timing correlation can remain, including around Tor |
| Malicious client | Its invoices, blinding secrets, tokens and API behavior | Payment authorization limits issuance; proof verification and authenticators reject forgery; PostgreSQL rejects replay |
| Compromised client/device | Vault, memory, keystrokes, browser data and timing | Local encryption cannot protect against an attacker actively executing as the client |
| Malicious issuer | Ability to choose keys/configuration, refuse issuance or serve code | Cached common-policy enforcement rejects demonstrated partitioning; first-use and malicious-code attacks need independent trust |
| API operator | Query and presented token, resource execution and spent database | No invoice lookup is needed for authorization; operator still sees query content and network metadata |

## Malicious merchant and configuration partitioning

An issuer could distinguish clients by choosing a unique key, token class, expiry or challenge. BlindPass binds its challenge to deterministic common metadata, verifies the signed manifest, pins the merchant identity, and rejects changes to a previously accepted epoch manifest. Tests exercise **valid merchant signatures** on maliciously modified configurations, so failure is not merely “bad signature.”

These controls have limits. A malicious merchant can deliver distinct correctly signed configurations to different first-time clients, each with no independent reference. Trust on first use alone cannot detect that. A stable identity fingerprint authenticates the merchant, but does not prove the merchant distributed the same epoch key to everyone. An independent expected manifest, trusted release/channel and eventually a configuration transparency log improve this story. A merchant also serves the browser JavaScript and can replace a web client; an independently obtained CLI/client is a stronger boundary.

## Traffic and behavioral correlation

Immediate redemption, a stable IP, unique queries, browser fingerprints, TLS fingerprints, and a set containing only one recent purchaser can correlate usage despite cryptographic blindness. The two-buyer 50/50 matrix excludes these signals by design and is labeled transcript-only with equal priors.

Delayed redemption and separately verified Tor transport can reduce some signals. BlindPass does not implement a mix network, fingerprint-resistant browser, OHTTP, cover traffic, or an anonymity guarantee against a global observer. The CLI checks Tor exit status but cannot prove relay independence or absence of timing analysis.

## Replay, forgery and double issuance

Tokens are high-entropy bearer credentials. Forgery fails the VOPRF authenticator. Exact canonical serialization prevents alternate-byte-encoding replay. A unique PostgreSQL constraint permits only one spend per token and epoch, including across processes. Issuance locks the paid authorization, records its blinded transcript, returns identical responses for identical retries, and rejects a second batch. Credentials must not be logged or printed.

## Payment and operational risks

The scanner is trusted to validate addresses and report real shielded payment observations. HMAC authenticates the bridge, not the blockchain truth of its statement. Compromise of the scanner can authorize unpaid issuance. A spending key is unnecessary and must not be present on the API server. Deep reorgs after issuance are merchant risk. Late or insufficient payments need manual handling. No real-value transactions are automatically sent by the application.

## Availability and loss

The issuer can refuse paid issuance, the API can refuse valid credits, and networks can drop responses. BlindPass is not a fair-exchange protocol. A lost issuance state or ambiguous redemption response may lose a credit. There is no account recovery. Rate limiting, confirmation policy and availability SLAs need production-specific design without introducing persistent identifiers.

## Out of scope

Protecting a compromised OS, preventing merchant access to queries, blocking all network correlation, guaranteeing payment delivery, automatic chargebacks/refunds, global issuer transparency and production-grade denial-of-service economics are outside this MVP. The project is unaudited; library use avoids custom primitives but does not make the entire composition automatically secure.
