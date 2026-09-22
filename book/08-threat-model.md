# 8. Threat model and privacy review

The useful privacy question is not “Is BlindPass anonymous?” It is “Which observer can link which two events, using which evidence, under which assumptions?” The answer changes across the payment, issuance, and redemption stages.

## A review table

| Observer                 | Sees                                                    | What the design changes                                   | Residual risk                                         |
| ------------------------ | ------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------- |
| Public chain observer    | Public transaction and pool metadata                    | Shielded Zcash conceals protected payment fields on chain | Unshielded components and traffic analysis remain     |
| Merchant/payment scanner | Invoice address, amount, confirmation, issuance request | Blind issuance hides final token input from the issuer    | Timing, destination, and scanner data remain          |
| API operator             | Token, query, request time, network endpoint            | No invoice lookup is needed to authorize                  | Query and network metadata can identify a user        |
| Reverse proxy/CDN        | Depending on termination, IP, headers, URL, timings     | Application log policy has no automatic effect there      | Token and query logging can defeat practical privacy  |
| Compromised client       | Vault and active memory                                 | At-rest encryption protects only stored ciphertext        | Malware or hostile same-origin code can spend credits |

This table is a starting point, not an exhaustive proof. The detailed actor analysis lives in [`docs/threat-model.md`](../docs/threat-model.md).

## Test the malicious issuer, not just a broken signature

A merchant can sign a configuration that gives one customer a unique key, class, or expiry. If the client merely verifies Ed25519, it accepts the fingerprinting configuration. BlindPass additionally checks deterministic common fields, the expected key ID, issuer identity, and previously accepted manifest. The policy tests use _valid merchant signatures_ on altered configurations to make this distinction visible.

There is still a first-use gap. Two new clients receiving different signed but internally coherent manifests cannot compare notes if they have no independent expected manifest. A trusted public configuration digest, independent client distribution, or append-only transparency service can expose split views. The merchant also serves the browser application and could ship a modified client. A separately distributed CLI raises a different trust boundary, provided its release channel is itself trusted.

## Read the anonymity set honestly

Common token class and epoch avoid per-invoice token markers. They do not create a large crowd. If one person buys and redeems during a period, the merchant can infer likely ownership even with mathematically blind issuance. The API's privacy audit reports `commonClassPurchases`, explicitly says distinct people are unknown, and does not claim a measured anonymity probability. A production system should monitor pool sizes only in aggregate and avoid exposing purchase/redemption timelines that narrow them. Delaying use may help some scenarios but cannot be prescribed as a universal anonymity guarantee.

Query content is another powerful identifier. A search for a unique private fact can identify a user to the API regardless of token blindness. IP addresses, TLS and browser fingerprints, clock patterns, and a single request after a purchase can also correlate activity. Tor or future OHTTP can address parts of network exposure, while query privacy requires a different service design.

## Minimize data where it is created

The API disables default request logging because URLs can contain query text or capabilities. It emits aggregate error codes and counts. This is only one hop. Production operators must inspect load balancers, ingress proxies, APM, database query logs, scanner logs, analytics, CDN settings, backups, and support exports. A log field containing an authorization header is a bearer credential leak and a possible purchase/use correlation artifact. Set retention and access policy for each layer, then test it with synthetic secrets.

## Exercise: a privacy design review

Assume a merchant controls the API and browser bundle but not a separately installed CLI. Compare a web purchase and CLI redemption with a web purchase and browser redemption. For each, list how the merchant could still link events. Then choose one mitigation for each residual channel and state its limitation. This forces a concrete threat model instead of an unqualified “private” badge.
