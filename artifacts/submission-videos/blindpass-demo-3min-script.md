# BlindPass — 3-minute demo

## 00:00 — PRODUCT DEMO · 01

Let's walk through the actual application. On the buy screen, the current offer is ten private searches for zero point zero one ZEC. There is no signup form and no customer profile to create. This recording uses the local simulation environment. The payment events are simulated; the credential cryptography is real.

## 00:20 — PRODUCT DEMO · 02

Creating the purchase produces a signed invoice and a visible payment state. For this demo, we use simulate payment confirmation. No funds are sent, and this is not an on chain payment demonstration. Real Zcash payments require the external scanner bridge described in the project, including address derivation and incoming payment detection.

## 00:40 — PRODUCT DEMO · 03

Once the purchase is confirmed, receive private credits runs the issuance protocol. The browser blinds its requests, verifies the issuer's proof, and unblinds locally. The wallet now holds ten usable credits. BlindPass uses Cloudflare's Privacy Pass implementation rather than inventing a new cryptographic primitive. The issuer does not receive these final credits during issuance.

## 01:00 — PRODUCT DEMO · 04

Now we search for privacy. The request spends one credential against the protected search API, returns results from the bundled technical corpus, and updates the balance from ten to nine. This is a working local search service. The access proof establishes permission to search, without carrying the invoice identifier or requiring an account login.

## 01:20 — PRODUCT DEMO · 05

Credits stay in an encrypted local wallet. The product includes encrypted backup and restore, purchase history, and recovery of interrupted issuance using saved state. That makes accountless access more practical, but custody matters. Clearing local data without a current backup can lose access. There is no account based password reset to reconstruct missing credits.

## 01:40 — PROTOCOL DEMO

The protocol lab makes the privacy claim inspectable. Alice and Bob each purchase the same ten credit batch and receive twenty real credentials in total. Both use a shared key, class, epoch, and expiry. We then redeem credentials in shuffled order. Shared configuration helps avoid giving each buyer a distinctive cryptographic label.

## 02:00 — WHAT UNLINKABILITY MEANS

Compare the two transcripts. Issuance records authorized batches and blinded requests. Redemption records token hashes, without an invoice field. There is no direct cryptographic matching identifier between them. The fifty fifty matrix illustrates equal priors for two buyers in this transcript only example. It is not a measurement of real world anonymity.

## 02:20 — SECURITY DEMO

The running demo also tests abuse. Reusing a spent credential returns token already spent. A forged credential returns invalid token. Attempts to change the issuer key, expiry, class, or key identifier are rejected by client policy. These results were captured from the application. They demonstrate specific enforcement checks, not an independent security audit.

## 02:40 — PRIVACY BOUNDARIES

The privacy story has three distinct layers. Shielded Zcash protects payment information on the public chain. Blind issuance removes the direct cryptographic payment to usage link. Optional verified Tor transport in the CLI reduces source network exposure. Timing, browser behavior, query contents, and compromised devices can still reveal information. BlindPass does not promise total anonymity.

