# BlindPass — five-minute demo pitch

English synthetic narration: en-US-AndrewNeural. Captured local application; simulated payments.

## 00:00 — THE IDEA

Meet BlindPass: pay privately, use privately. It turns a payment into single use access credits, so using a digital service does not require a customer account. The first application is private technical search. This demo shows the working product, the cryptography behind it, and exactly where its privacy guarantees stop.

## 00:20 — THE PROBLEM

A private payment is only one part of a private experience. A service can still attach your purchase to an account, session, or API key, and connect every request afterward. For people researching sensitive topics, that creates a lasting activity trail. BlindPass asks: can someone prove they paid without identifying their purchase every time?

## 00:40 — THE APPROACH

BlindPass separates buying access from using it. A payment authorizes a fixed batch of credits. Blind issuance lets the device receive valid credentials without revealing the final credentials to the issuer. Later, a search presents one credential. The service checks that it is valid and unspent, without requiring an invoice identifier at redemption.

## 01:00 — PRODUCT DEMO · 01

Let's walk through the actual application. On the buy screen, the current offer is ten private searches for zero point zero one ZEC. There is no signup form and no customer profile to create. This recording uses the local simulation environment. The payment events are simulated; the credential cryptography is real.

## 01:20 — PRODUCT DEMO · 02

Creating the purchase produces a signed invoice and a visible payment state. For this demo, we use simulate payment confirmation. No funds are sent, and this is not an on chain payment demonstration. Real Zcash payments require the external scanner bridge described in the project, including address derivation and incoming payment detection.

## 01:40 — PRODUCT DEMO · 03

Once the purchase is confirmed, receive private credits runs the issuance protocol. The browser blinds its requests, verifies the issuer's proof, and unblinds locally. The wallet now holds ten usable credits. BlindPass uses Cloudflare's Privacy Pass implementation rather than inventing a new cryptographic primitive. The issuer does not receive these final credits during issuance.

## 02:00 — PRODUCT DEMO · 04

Now we search for privacy. The request spends one credential against the protected search API, returns results from the bundled technical corpus, and updates the balance from ten to nine. This is a working local search service. The access proof establishes permission to search, without carrying the invoice identifier or requiring an account login.

## 02:20 — PRODUCT DEMO · 05

Credits stay in an encrypted local wallet. The product includes encrypted backup and restore, purchase history, and recovery of interrupted issuance using saved state. That makes accountless access more practical, but custody matters. Clearing local data without a current backup can lose access. There is no account based password reset to reconstruct missing credits.

## 02:40 — PROTOCOL DEMO

The protocol lab makes the privacy claim inspectable. Alice and Bob each purchase the same ten credit batch and receive twenty real credentials in total. Both use a shared key, class, epoch, and expiry. We then redeem credentials in shuffled order. Shared configuration helps avoid giving each buyer a distinctive cryptographic label.

## 03:00 — WHAT UNLINKABILITY MEANS

Compare the two transcripts. Issuance records authorized batches and blinded requests. Redemption records token hashes, without an invoice field. There is no direct cryptographic matching identifier between them. The fifty fifty matrix illustrates equal priors for two buyers in this transcript only example. It is not a measurement of real world anonymity.

## 03:20 — SECURITY DEMO

The running demo also tests abuse. Reusing a spent credential returns token already spent. A forged credential returns invalid token. Attempts to change the issuer key, expiry, class, or key identifier are rejected by client policy. These results were captured from the application. They demonstrate specific enforcement checks, not an independent security audit.

## 03:40 — PRIVACY BOUNDARIES

The privacy story has three distinct layers. Shielded Zcash protects payment information on the public chain. Blind issuance removes the direct cryptographic payment to usage link. Optional verified Tor transport in the CLI reduces source network exposure. Timing, browser behavior, query contents, and compromised devices can still reveal information. BlindPass does not promise total anonymity.

## 04:00 — DEVELOPER OPPORTUNITY

For developers, the reusable idea is simple: charge for access without building a customer identity into every request. The repository includes a client SDK and server redemption middleware. Private technical search is the working starting point. Paid data APIs and private downloads are possible future applications; they are not presented as shipped integrations or existing customers.

## 04:20 — WHAT COMES NEXT

The next milestones are concrete. Connect and validate a real Zcash scanner on testnet, complete deployment operations, and obtain independent security review. Stronger configuration transparency is also future work, especially for first use trust. Today's deliverable is a working accountless search and credential system, with its external payment integration requirements and limitations documented openly.

## 04:40 — BLINDPASS

BlindPass demonstrates a different relationship between payment and access. A service can verify that a request is paid for without asking the credential to identify the purchase behind it. Explore the demo, inspect the protocol, and help test the next integration. One credit proves access. It never needs to say who you are.

