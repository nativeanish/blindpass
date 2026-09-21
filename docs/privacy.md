# Privacy model

## Payment privacy

Real integration is designed for Orchard shielded receiving through ZIP-316 Unified Addresses and fixed-value ZIP-321 requests. The public chain does not reveal the protected content of a fully shielded payment. Transaction timing, fees, shielded pool interactions and any transparent components still matter. The merchant and its scanner can see information exposed by their incoming viewing capability. Mock mode provides none of these blockchain protections and is labeled as simulation.

## Credential unlinkability

The client blinds RFC 9578 inputs locally, verifies the issuer’s proof and unblinds locally. The server receives only blinded requests during issuance. Redemption includes a valid single-use credential, not an invoice capability or account identifier. Issuance and redemption data contain no direct token mapping. This is a cryptographic property under protocol assumptions, not merely a missing database column.

## Network metadata

Direct requests expose source network metadata to the destination and intermediaries. Browser and TLS fingerprints are not modified. Application request logging is disabled, but the network still carries those signals. Reverse-proxy logs, CDN logging, error trackers, hosting telemetry and scanner logs must be independently controlled. No third-party analytics, external fonts, or fingerprint collection are included in the product pages.

## Timing attacks

Paying at 14:02:31 and redeeming at 14:02:34 gives the merchant a correlation clue. Delaying use or mixing use with a larger common pool can reduce this clue, but there is no computed safety threshold or guaranteed delay. Local activity timestamps are encrypted on the client. Operational database timestamps remain visible to the merchant; retention and access policies matter.

## Browser fingerprinting and client trust

The application does not collect fingerprints and explicitly omits cookies from SDK API requests. This does not make a normal browser resistant to fingerprinting. A malicious merchant controls delivered browser code unless the user has independently verified it. An independently obtained CLI avoids that particular code-delivery dependency, but not device compromise.

## Anonymity set

Common-class **confirmed purchases** can be counted without tracking people. Distinct people cannot be counted honestly without additional identifiers, so the auditor reports that distinction. One person can buy several batches. A small set can make attribution likely even when the blind transcript contains no matching signal. The 50/50 matrix assumes two indistinguishable purchases and equal priors while excluding network and behavior evidence; it is not a measured posterior probability.

## Merchant fingerprinting attacks

Unique keys, classes, challenge values, expiries or denominations partition clients. BlindPass uses a fixed batch size, one class and deterministic monthly validity windows; it verifies the full signed manifest before generating requests and again before finalization. It never puts invoice IDs or purchase times in token inputs. The malicious-issuer demo uses actual signed modified manifests, not canned error screens.

## Issuer configuration consistency

The client remembers the first trusted merchant fingerprint and common epoch configuration. Subsequent changes inside the same epoch fail. A configured expected fingerprint strengthens identity bootstrap. This is not a transparency log or proof of global consistency, and a stable merchant signing identity by itself cannot rule out first-use key partitioning. Publicly distributed common manifests are an operational responsibility.

## Tor

The CLI uses SOCKS5h so DNS resolution follows the proxy. It verifies exit status with Tor Project before showing a connected message. Failure stops the operation; there is no direct retry. `ALL_PROXY` or `TOR_PROXY` configures the endpoint. Tor does not hide the destination query, remove application fingerprints, or guarantee resistance to end-to-end timing correlation. The browser UI never claims to activate Tor.

## Storage and logs

The server stores only spent-token hashes. The client stores encrypted bearer credentials with no raw credential output. Capability secrets are stored hashed server-side and encrypted client-side. Routine application logs omit IPs, queries, authorization headers and capabilities. Browser same-origin scripts can invoke the non-extractable key, so the vault is not an XSS boundary. CLI keyring/passphrase security depends on the host. Test traces can contain ephemeral test credentials; keep traces private and avoid enabling them against real-value production data.

## Future OHTTP support

Oblivious HTTP could separate a client-facing relay from the query-processing gateway, reducing the destination’s knowledge of the source. It would require an independently operated relay, clear collusion assumptions, padding/traffic analysis and deployment work. It is a roadmap item, not an implemented transport in this MVP.
