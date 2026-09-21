# Judge demo — 2 minutes 45 seconds

## Before presenting

Run `pnpm demo` or start PostgreSQL and `pnpm dev`. Open `/presentation` and a separate `/demo` tab. The presentation uses arrow keys and embeds the actual live demo for purchase, redemption and attack slides. Use a desktop viewport around 1440×1000. Keep the mock-payment banner visible. Use a fresh page reload for new independent in-memory Alice/Bob clients; ordinary personal-wallet credits persist separately in IndexedDB.

If short on time, **Run complete demo** executes real issuance and all attacks in several seconds, then explain its results. Never claim a simulated payment was verified on-chain.

| Time | Show | Say |
| --- | --- | --- |
| 0:00–0:15 | Slide 1 | “Zcash hides protected payment details from the public chain. But a service can still link that payment to everything you do afterward.” |
| 0:15–0:35 | Ordinary session diagram | “This invoice creates a session. The same session follows all three requests. A private payment alone did not make usage private.” |
| 0:35–0:55 | Alice/Bob cards; create both; confirm | “Alice and Bob each buy ten credits for 0.01 ZEC. These payment events are simulated. Everything cryptographic that follows is real. Both clients use the same offer, key, class, epoch and expiry.” |
| 0:55–1:15 | Issue blind credentials; conceptual visual | “Each device generates and blinds its requests. The issuer evaluates opaque elements. Each device verifies the proof and unblinds locally. The merchant never receives the final credits during issuance.” |
| 1:15–1:35 | Redeem shuffled credentials; transcripts | “Now we shuffle and use two credentials against the live search API. The merchant sees valid token hashes, without invoice IDs. There is no direct cryptographic invoice-to-token match.” |
| 1:35–1:50 | Equal-prior matrix | “In this two-buyer, transcript-only illustration, neither invoice is preferred. These 50/50 values are not a claim about real-world anonymity.” |
| 1:50–2:00 | Replay attack | “The same credential again: TOKEN_ALREADY_SPENT. PostgreSQL also allows exactly one of twenty simultaneous attempts.” |
| 2:00–2:15 | Malicious issuer attack | “A merchant-signed unique key, expiry, class or key ID is rejected: ISSUER_POLICY_VIOLATION. The client enforces a shared trusted policy, not merely a valid signature.” |
| 2:15–2:30 | Immediate/direct side-channel scenario | “Same IP, same browser and three seconds apart can still correlate. This is an illustration, not fingerprint collection. Delayed use and verified Tor can reduce some signals; Tor does not guarantee anonymity.” |
| 2:30–2:45 | Final slide and SDK | “Zcash protects the payment. BlindPass breaks the cryptographic payment-to-usage link. Network anonymity remains a separate layer. One credit proves access. It never needs to say who you are.” |

## Questions to answer candidly

**Is Zcash live?** The default demo simulates payment events. A real authenticated scanner adapter boundary is implemented; address derivation and chain scanning require the documented external bridge.

**Is this custom cryptography?** No. It wraps Cloudflare’s implementation of RFC 9578 type 0x0001, with P-384/SHA-384 VOPRF and proof verification.

**Can a merchant still track users?** Through timing, network metadata, query behavior, first-use configuration partitioning or maliciously delivered client code, yes. That is why the demo distinguishes protocol blindness from network anonymity and documents independent client/configuration trust.

**Can I get a lost credit back?** Not automatically. The merchant deliberately has no mapping from an issued batch to final credits. Lost local state and ambiguous responses are documented limitations; anonymous refund/recovery credentials are future work.
