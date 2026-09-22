# 17. Rebuild the browser experience

The browser is where protocol correctness becomes user-visible behavior. It must show the commercial terms before payment, preserve local secrets through ordinary navigation, and avoid encouraging a retry when the outcome is uncertain. In this checkout the Next.js landing page and reusable components remain, but the former `/app`, `/app/buy`, `/app/search`, `/demo`, and `/docs` page files are deleted in the working tree. Treat this chapter as a reconstruction guide, not a claim that those routes currently run.

## Put the SDK below the UI

[`browserClient`](../apps/web/lib/vault.ts) creates one `BlindPassClient` for the current origin with a `BrowserVault` and optional public signing fingerprint. A page should call `configuration`, `buy`, `invoice`, `issue`, `balance`, and `search` methods and render state. It should not create token requests or build authorization headers itself. That is how the CLI and browser can share security behavior.

The browser vault stores a non-extractable AES-GCM key and encrypted state in IndexedDB. The key is bound to the origin by browser storage, not to a person. The Web Locks API serializes modifications across tabs. If the browser lacks the required secure-context APIs, fail with a clear error before taking payment. Do not quietly switch to plaintext localStorage. If users clear site data, both key and ciphertext disappear. A purchase page should say this plainly before funds move.

## Design the purchase screen as a state machine

The screen should have at least these states: `loading policy`, `offer ready`, `creating invoice`, `waiting for payment`, `waiting for confirmations`, `ready to issue`, `issuing`, `credits stored`, `expired`, and `needs support`. The UI must display the signed fixed amount, destination, confirmation requirement, deadline, and refund policy. The client validates these values before rendering a payment URI. In mock mode, show a conspicuous non-payable label and do not present the URI as a real wallet address.

Polling `GET /api/invoices/:capability` can update payment state, but the capability in the path is sensitive. Turn off client analytics and review browser history, network tooling, reverse-proxy logs, and support screenshots. The SDK request wrapper already disables cache and referrer; deployment infrastructure must honor the same privacy intent. A real payment may arrive just before expiry and confirm later; the exact policy should be documented by the server's state machine, not inferred from a progress spinner.

The `issue` button should become available only after `PAYMENT_CONFIRMED`. Once pressed, it should not encourage a second fresh issuance request if a network error occurs. The SDK retries an identical in-memory request once for a transport `TypeError`. After a tab/process crash, blinding state is lost in the current design. A production page should show an explicit uncertain/lost-credits state and a support route for an unissued invoice rather than promising automatic recovery. Better still, implement the encrypted pending-issuance journal described in Chapter 20 and prove it with crash tests.

## Design the search screen around one irreversible credit

Show balance and expiry separately: “remaining” excludes expired tokens, while “expired” is not spendable. Validate nonempty queries before invoking the SDK, and disclose that the destination sees the query. Disable duplicate submissions while a search is pending. A result with zero matches still consumes one credit because the service performed the paid search. A 503 from reversible local work can restore the credit; an ambiguous network failure cannot safely promise restoration. Label that outcome accurately and avoid an automatic retry with a second token.

[`SearchForm`](../apps/web/components/search-form.tsx) is a reusable input component; it routes to `/app/search` if no callback is provided. Because that page is absent in this working tree, a reconstruction must supply a page that calls `browserClient().search` and handles every state above. A reader can build this page as an exercise using the SDK without altering the protocol packages.

## Use the two-client demo to teach limits

[`LiveDemo`](../apps/web/components/live-demo.tsx) still contains an Alice/Bob exercise using two independent in-memory clients. It creates two invoices, simulates confirmations, issues twenty real tokens, redeems in shuffled order, and tests replay, forgery, and signed malicious configurations. It is pedagogically useful because it shows the issuer's blind transcript and the final spent hashes without a direct matching relation. It is not a privacy proof for live networks: both demo clients run in one browser and the payments are simulated.

The component currently links to a deleted presentation route. If you restore the demo, review all links and expected routes instead of assuming its prior page shell still exists. The browser's static export configuration also matters: a production deployment needs explicit routing of `/api/*`, `/.well-known/*`, and webhook traffic to Fastify. The current [`next.config.ts`](../apps/web/next.config.ts) does not itself establish that production proxy routing.

## Browser production review

The operator serves the JavaScript that holds credentials and issues requests. A malicious or compromised web origin can run same-origin code that asks Web Crypto to decrypt and spend tokens even though the key bytes are non-extractable. Browser security work therefore includes release integrity, dependency review, a strict deployment-specific CSP, no third-party scripts on credential pages, and independent checks of the published signing fingerprint and manifest. None of these removes device compromise. A separately distributed CLI or wallet extension changes that trust boundary, but adds its own release and update risks.

## Acceptance exercise

Implement a minimal `/app/search` route in a scratch branch using the existing `SearchForm` and `browserClient`. Before coding, write a transition table for success, invalid query, no credits, definite service failure, duplicate submission, expired credit, and ambiguous network failure. The page is complete only when every transition has an honest message and the balance remains consistent after reload and across two tabs.
