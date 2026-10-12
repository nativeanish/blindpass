# BlindPass — 2-minute pitch

## 00:00 — THE PROBLEM

A private payment is only one part of a private experience. A service can still attach your purchase to an account, session, or API key, and connect every request afterward. For people researching sensitive topics, that creates a lasting activity trail. BlindPass asks: can someone prove they paid without identifying their purchase every time?

## 00:20 — THE APPROACH

BlindPass separates buying access from using it. A payment authorizes a fixed batch of credits. Blind issuance lets the device receive valid credentials without revealing the final credentials to the issuer. Later, a search presents one credential. The service checks that it is valid and unspent, without requiring an invoice identifier at redemption.

## 00:40 — PRIVACY BOUNDARIES

The privacy story has three distinct layers. Shielded Zcash protects payment information on the public chain. Blind issuance removes the direct cryptographic payment to usage link. Optional verified Tor transport in the CLI reduces source network exposure. Timing, browser behavior, query contents, and compromised devices can still reveal information. BlindPass does not promise total anonymity.

## 01:00 — DEVELOPER OPPORTUNITY

For developers, the reusable idea is simple: charge for access without building a customer identity into every request. The repository includes a client SDK and server redemption middleware. Private technical search is the working starting point. Paid data APIs and private downloads are possible future applications; they are not presented as shipped integrations or existing customers.

## 01:20 — WHAT COMES NEXT

The next milestones are concrete. Connect and validate a real Zcash scanner on testnet, complete deployment operations, and obtain independent security review. Stronger configuration transparency is also future work, especially for first use trust. Today's deliverable is a working accountless search and credential system, with its external payment integration requirements and limitations documented openly.

## 01:40 — BLINDPASS

BlindPass demonstrates a different relationship between payment and access. A service can verify that a request is paid for without asking the credential to identify the purchase behind it. Explore the demo, inspect the protocol, and help test the next integration. One credit proves access. It never needs to say who you are.

