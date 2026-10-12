# BlindPass: what it is, how to use it, and what every screen means

This guide describes the implementation in this repository, reviewed on 7 October 2026. It is written for someone learning the product, demonstrating it to a judge, or preparing to operate it as a service.

## 1. What is BlindPass?

**BlindPass lets someone pay for access, receive private single-use credits, and use those credits without creating a customer account.**

The current application sells access to a technical search service. Its fixed offer is **10 searches for 0.01 ZEC**. ZEC is the currency used by Zcash. Each completed search spends one credit.

The project has two useful parts:

| Part                 | What it provides                                                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Customer application | Buy search credits, search, manage purchases, and back up a local wallet.                                                                  |
| Developer components | Client and server code for issuing and verifying private credentials around a fixed-cost resource. The current example resource is search. |

The developer components could support other paid resources in the future. A marketplace, subscriptions, multiple merchants, and arbitrary credit denominations are not implemented in this version.

### What problem does it solve?

In an ordinary paid service, an account or API key connects the payment record to each later request. BlindPass separates the proof of payment from the proof of access.

The service learns that a payment authorized ten credits. Later, it verifies that a submitted credit is legitimate and unused. The blind-issuance protocol removes a direct cryptographic identifier connecting that credit to its purchase.

This does not erase other clues. The service still receives the search query, and a direct connection exposes network metadata. Timing and a small number of buyers can also make correlation easier.

### A simple analogy

Imagine buying ten admission tickets. Each ticket is prepared inside a special cover. The ticket office authenticates it through the cover after payment, and you remove the cover before using it. The office can recognize a valid ticket at the entrance without recognizing the exact covered ticket it processed during purchase.

That is an intuition for _blinding_. BlindPass implements this with a cryptographic library, not paper tickets. Unlike an ordinary receipt, the credit presented for access does not contain an invoice ID.

## 2. What works now, and what is simulated?

The persistent local preview is configured for **development mode with simulated payments**.

| Feature                                                   | Current implementation                                                                               |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Invoice creation and signatures                           | Real application logic.                                                                              |
| Zcash payment in the local preview                        | Simulated events; no blockchain transaction or real money is required.                               |
| Blind credit creation, proof verification, and redemption | Real cryptographic operations.                                                                       |
| Preventing a credit from being spent twice                | Real PostgreSQL transaction and uniqueness checks.                                                   |
| Search                                                    | Real search over the bundled technical resource index.                                               |
| Browser wallet and backups                                | Real encrypted local storage and passphrase-encrypted backup files.                                  |
| Purchase recovery                                         | Real saved issuance state, including retries after a lost response or reload.                        |
| Real Zcash payments                                       | Scanner integration code exists; a working external scanner must be supplied and validated.          |
| Public commercial deployment                              | Deployment files exist; this repository's verification does not establish a completed public launch. |

The search index contains **1,806 resources**: 1,800 RFC records and six curated privacy/Zcash resources. Search operates on indexed titles and descriptions. It does not crawl the live web or search the complete text of every linked document, and it does not generate AI answers.

When an invoice says **SIMULATED PAYMENT EVENT** or **SAMPLE PAYMENT URI · NOT PAYABLE**, use the simulation button. Do not send ZEC to that sample address.

## 3. How to use the frontend

### Open the correct application

The persistent preview uses:

**http://localhost:3100/app**

If it is stopped, start it from the repository directory:

```bash
docker compose -f docker-compose.yml -f infra/compose.smoke.yml up --build -d
```

Keep its existing project and volumes. The configuration fixes the project name to `blindpass-smoke` so it reuses the original database and issuer keys.

There are three distinct local setups:

| Setup                                | Browser address         | Purpose                                                                            |
| ------------------------------------ | ----------------------- | ---------------------------------------------------------------------------------- |
| Default `pnpm dev` / default Compose | `http://localhost:3000` | Development, using the matching development configuration.                         |
| Persistent preview                   | `http://localhost:3100` | The preview used in this walkthrough.                                              |
| Separate verification stack          | `http://localhost:3200` | Independent tests using `infra/compose.verify.yml`; start it separately if needed. |

These addresses have separate browser storage. Always use the hostname and port that match the service's configured issuer. `localhost` and `127.0.0.1` are different browser wallet addresses.

### Buy and use ten credits locally

1. Open **Buy credits** at `/app/buy`.
2. Review the ten-search offer, payment mode, and displayed credit expiry.
3. Click **Get 10 private credits**. The browser verifies the issuer and requests a signed invoice.
4. In the local preview, click **Simulate payment confirmation**. This exercises the payment states without transferring ZEC.
5. Click **Receive private credits**. The browser prepares blinded requests, verifies the responses, and saves ten credits locally.
6. Open **Wallet & backup**, create a backup passphrase, and download an encrypted backup. Keep the passphrase separately from the file.
7. Open **Private search**. Enter a query such as `privacy`, `TLS`, or `Zcash Orchard`, then click **Search privately**.
8. After a successful search, the balance changes from ten to nine. Reloading should preserve the remaining credits in this browser.

A completed search with zero matches still costs one credit. Viewing a page, selecting a suggested search term, or reading a balance does not spend a credit. Clicking a result opens the external source website, whose own privacy practices then apply.

For a real scanner-backed service, step 4 changes: pay the actual invoice from an external Zcash wallet on the displayed network, then wait for the required confirmations. The simulation control is unavailable in production.

## 4. What every frontend screen does

The frontend is the part of the application visible in the browser. It also performs important work locally: holding credits, blinding requests, verifying proofs, and encrypting wallet data.

### Customer screens

| Screen and route                  | What it means and how to use it                                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Landing page** `/`              | Explains the product, payment-to-access flow, and privacy limits. **Open app** enters the workspace.                               |
| **Overview** `/app`               | Shows available credits, locally counted usage, recent activity, and issuer policy details. It is a view of this browser's wallet. |
| **Buy credits** `/app/buy`        | Creates an invoice, displays payment instructions and progress, and receives or recovers a batch of credits.                       |
| **Private search** `/app/search`  | Submits a query with one credit, then displays results and the updated balance.                                                    |
| **Purchases** `/app/purchases`    | Lists purchases saved in this browser. Use **View purchase** to continue payment or **Recover credits** to resume saved issuance.  |
| **Wallet & backup** `/app/wallet` | Shows batches and expiry dates, prepares encrypted backups, and restores a backup into an empty wallet.                            |
| **Help & service** `/app/help`    | Shows payment mode, network, support information, expiry, issuer fingerprint, and explanations of common problems.                 |

**The BlindPass wallet stores access credits, not ZEC.** It is separate from the external Zcash wallet used to pay an actual invoice. There is no MetaMask connection required for the BlindPass purchase flow.

### Overview cards

**Available private credits** counts stored credits whose expiry has not passed. **Credits used** is the local count of successfully acknowledged redemptions. **Credits received** is currently a derived display of stored credentials plus acknowledged usage; it is not an authoritative financial ledger and can omit credits set aside after an uncertain response.

**Recent activity** contains local purchase/redemption events. It is not an account history synchronized across devices. The overview's search box opens the search page with the query filled in; submitting on the search page performs the paid request.

### The invoice and its progress panel

The QR code and payment URI encode the destination and amount. **Copy payment URI** copies those instructions. **Open in wallet**, when available for a real invoice, passes the payment URI to an external wallet.

The **Invoice** label identifies the purchase for operational purposes. The wallet separately holds a secret purchase capability that authorizes access to the invoice and its issuance. The QR code is not the private search credit.

| Progress label           | Meaning                                                              |
| ------------------------ | -------------------------------------------------------------------- |
| Waiting for payment      | The invoice exists but payment has not been observed.                |
| Payment detected         | The watcher has observed a payment.                                  |
| Waiting for confirmation | The payment has not yet reached the required confirmation threshold. |
| Payment confirmed        | The payment authorizes one batch of ten credits.                     |
| Issuing private credits  | The browser and issuer are completing the blind-issuance exchange.   |
| 10 private credits ready | The browser has verified and stored the credits.                     |

Some intermediate states may pass quickly. Payment confirmation and having credits safely stored are separate steps. If the server issued a batch but the response was lost, recovery resumes the saved request instead of purchasing another batch.

### Wallet backup and recovery

The browser automatically stores wallet state encrypted in IndexedDB, its local database. The downloadable backup is an additional copy encrypted with a passphrase you choose.

A backup includes credits, saved purchases, purchase capabilities, trusted issuer configuration, and pending issuance state. Restore it on the **same issuer** in an empty wallet, such as a new browser profile. The app refuses to overwrite a wallet that already holds purchase or usage state.

Back up after purchases and important wallet changes. A backup made before a purchase cannot recover that purchase. Restoring an older backup does not make already-spent credits usable again. Continue using one restored copy rather than treating copies as independent balances.

There is no account password reset. Losing the browser data without a usable backup can lose access to the credits and unfinished purchases.

### Education and operator screens

| Screen and route                     | Audience and purpose                                                                                                                                                                        |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Privacy explorer** `/demo/privacy` | Explains payment/redemption separation, protocol boundaries, and network side channels. Available to customers in production.                                                               |
| **Live demo** `/demo`                | Development demonstration with two independent clients, Alice and Bob. It simulates payments but issues and verifies real credentials, shuffles redemption, and exercises attack rejection. |
| **Merchant view** `/admin`           | Development-only view of payment and redemption datasets. Their separation illustrates the missing direct cryptographic join; it does not eliminate timing clues.                           |
| **Developer docs** `/docs`           | Explains the SDK, API routes, CLI, and integration model.                                                                                                                                   |
| **Presentation** `/presentation`     | Keyboard-navigable slides for a judge or technical demonstration. Development-only.                                                                                                         |
| **Operator** `/operator`             | Authenticated service monitoring. Requires an operator key and shows aggregate invoice, payment, issuance, redemption, scanner, and key-lifecycle status.                                   |

The operator key is for the service owner. Customers do not need it. `/admin` is a demonstration screen, while `/operator` is the protected operational interface. Production blocks `/admin`, `/demo`, and `/presentation`.

The demo's equal-probability comparison is an illustration under assumptions about indistinguishable purchases. It is not a measurement that every real request has a 50% chance of being identified. The privacy explorer's network scenario controls do not activate Tor or alter the browser's connection.

### What the labels and badges mean

| Frontend label                                 | Interpretation                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Personal workspace / Accountless by design** | A local browser workspace; no customer login or cloud profile is being created.                                     |
| **LOCAL / DEVICE ONLY**                        | This view uses the browser's stored wallet. The server still maintains separate invoice/payment records.            |
| **Protocol online**                            | The API health check passed. It does not certify anonymity or real blockchain settlement.                           |
| **DEVELOPMENT MODE**                           | Payments are simulated in this preview.                                                                             |
| **DIRECT / Direct connection**                 | The browser is making ordinary network requests. BlindPass has not activated Tor.                                   |
| **ENCRYPTED LOCALLY**                          | Wallet data is encrypted in the browser. Malicious same-origin scripts or a compromised device can still access it. |
| **1 CREDIT / SEARCH**                          | One completed search consumes one bearer credential.                                                                |
| **search-v1**                                  | The shared kind of access that these credentials authorize: the current search service.                             |
| **Common epoch / YYYY-MM**                     | The UTC calendar month whose shared issuer key and validity policy apply.                                           |
| **Issuer fingerprint**                         | A public digest identifying the service's signing key. This is unrelated to tracking a browser fingerprint.         |

## 5. How BlindPass works behind the screen

The browser, payment system, issuer, and search verifier have different jobs. In this implementation, the issuer and verifier run inside the same merchant API; their protocol roles are distinct.

```mermaid
sequenceDiagram
    participant B as Browser and local credit wallet
    participant A as BlindPass API
    participant P as Mock watcher or real payment scanner
    participant D as PostgreSQL
    B->>A: Fetch and verify issuer configuration
    B->>A: Request a ten-credit invoice
    A->>D: Save signed invoice and capability hash
    A-->>B: Payment instructions and secret purchase capability
    P->>A: Report payment and confirmations
    A->>D: Authorize one batch
    B->>B: Generate, blind, and persist recovery state
    B->>A: Purchase capability and ten blinded requests
    A-->>B: Evaluations, proofs, and signed configuration
    B->>B: Verify, unblind, and encrypt ten credits
    Note over B,A: Later, when the user chooses to search
    B->>A: Search query and one credit; no invoice identifier
    A->>D: Verify unused credit, search, and record spent hash
    A-->>B: Search results
```

**Verify the service.** The browser checks the configuration's signature, trusted signing identity, hostname, common credit policy, and dates. It will not create an invoice if this validation fails.

**Authorize issuance through payment.** A signed invoice specifies what is being purchased. A confirmed payment permits one batch. In the preview, a mock watcher supplies the events; a real deployment requires a scanner connected to Zcash infrastructure.

**Blind and issue credits.** The browser creates random inputs and hides them with secret blinding values. The server processes the blinded requests with the common issuer key and returns proofs. The browser verifies the proofs and removes the blinding. The server did not see the final credit values during issuance.

**Store safely and recover interruptions.** Recovery state is encrypted and saved before contacting the issuer. Repeating the same committed request returns the saved response. A different request cannot mint a second batch for the same authorization.

**Redeem once.** The browser sends one final credit with a query. The API verifies it and uses a database transaction to reserve its hash, perform the search, and mark it spent. Reusing the credit fails. The redemption path does not need the invoice or customer account.

The implementation uses the Cloudflare Privacy Pass and VOPRF libraries for the RFC 9578 privately verifiable token protocol, with P-384 and SHA-384. The application packages ten independent requests together. BlindPass does not implement its own elliptic-curve primitive.

### Three different kinds of keys

| Key or secret                              | Job                                                                                                                                |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Stable merchant signing key                | Signs invoices and configuration; its public-key fingerprint identifies the service. Keep this identity stable across deployments. |
| Monthly credential issuer key              | Issues and verifies the credits for a common month. Old keys are retained while their credits remain valid.                        |
| Browser encryption key / backup passphrase | Protects local wallet data or its exported backup. These do not authorize the server to issue credits.                             |

An operator access key is another separate credential: it opens the monitoring interface. A purchase capability is a per-invoice secret. None of these should be confused with a search credit.

### Why all credits in a month share an expiry

Shared policies help prevent individual buyers from being distinguished by unique keys or dates. The implementation issues a month's credits until the next UTC month begins, with a common seven-day verification grace period.

For example, the October 2026 batch has an issuance cutoff of **1 November 2026, 00:00 UTC**, and a credit expiry of **8 November 2026, 00:00 UTC**. These are policy examples, not promises that every purchase lasts a fixed number of days. The frontend may display the timestamps in your local timezone.

An invoice's payment deadline, its issuance deadline, and the credits' expiry are different deadlines. Review the current values before paying.

## 6. What data goes where?

| Location                   | Data it holds                                                                                          | Why it exists                                                                     |
| -------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Browser's encrypted wallet | Unspent credits, purchase capabilities, invoices, trusted configuration, activity, and recovery state. | Spend credits and resume purchases without a customer account.                    |
| Server payment records     | Invoices, destinations, amounts, payment events, confirmations, and authorization state.               | Establish whether a purchase permits issuance.                                    |
| Server issuance records    | Blinded-request digest and saved evaluated responses.                                                  | Ensure one batch per authorization and support identical-request recovery.        |
| Server redemption records  | Token hashes, shared epoch, spend/reservation state, and timestamps.                                   | Prevent double spending. No invoice foreign key or stored query is required here. |
| Search index               | Bundled resource titles, descriptions, categories, and links.                                          | Produce search results.                                                           |
| Exported backup file       | A passphrase-encrypted wallet snapshot.                                                                | Recover on another device or after loss of local storage.                         |

The service processes queries to answer them, but the application does not save them as server-side search history. Queries can still appear in browser URLs/history and be visible to browser extensions or improperly configured infrastructure. The application disables routine request logging; a hosting provider or reverse proxy needs its own configuration.

Payment privacy, credential unlinkability, and network privacy are separate protections. Shielded payment support does not conceal a query from the search service. Blind credits do not conceal an IP address. Local encryption does not make compromised browser code trustworthy.

## 7. What the frontend is built with

| Technology                           | Role in this application                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------- |
| Next.js App Router                   | Routes, page rendering, API rewrites, and the web application's structure.              |
| React and TypeScript                 | UI components, interactions, and typed data handling.                                   |
| CSS and Tailwind tooling             | Layout, colors, spacing, responsive styling, and shared visual rules.                   |
| TanStack React Query                 | Fetching and refreshing service status, invoices, and local wallet views.               |
| Lucide                               | Interface icons.                                                                        |
| QRCodeSVG                            | Payment QR codes.                                                                       |
| Web Crypto, IndexedDB, and Web Locks | Wallet encryption, local persistence, and coordinated access across tabs.               |
| BlindPass client SDK                 | Issuer verification, purchases, blind issuance, backup handling, and credit redemption. |

The backend uses Fastify for HTTP endpoints and PostgreSQL for durable payment records, issuance state, spend tracking, and full-text search. A button does not authorize itself: the API enforces payment authorization and verifies credits independently of the displayed frontend state.

### Where to read the code

| File or folder                                                  | What to look for                                                    |
| --------------------------------------------------------------- | ------------------------------------------------------------------- |
| [Frontend pages](../apps/web/app/)                              | The pages described in this guide.                                  |
| [Workspace shell](../apps/web/components/shell.tsx)             | Sidebar, navigation, status indicator, and development banner.      |
| [Browser vault](../apps/web/lib/vault.ts)                       | Local encryption, IndexedDB, Web Locks, and browser SDK setup.      |
| [Client SDK](../packages/blindpass-client/src/index.ts)         | The purchase, issue, recover, and search flow.                      |
| [Privacy Pass wrapper](../packages/privacy-pass/src/index.ts)   | Blinding, finalization, credential verification, and wire encoding. |
| [API routes](../apps/api/src/app.ts)                            | Invoice, issuance, search, health, and operator endpoints.          |
| [Redemption service](../packages/blindpass-server/src/index.ts) | Transactional single-use verification.                              |
| [Search implementation](../apps/demo-service/src/search.ts)     | Corpus seeding and PostgreSQL search.                               |
| [Zcash adapter](../packages/zcash/src/)                         | Mock payment events and the external scanner integration.           |

## 8. Understanding failures and recovery

| Message or situation                            | What it means                                                                          | What to do                                                                                                   |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `ISSUER_POLICY_VIOLATION` with address mismatch | The configured issuer and the address you opened differ.                               | Use the configured hostname and port.                                                                        |
| Signing identity mismatch                       | The service's signing fingerprint differs from the wallet or deployment's trusted pin. | Keep wallet data. The operator must verify the identity and restore the matching service configuration/keys. |
| Configuration changed within a month            | An already trusted monthly policy or issuer key changed.                               | Restore the original shared policy; do not silently replace the wallet's trust.                              |
| Credit-period mismatch                          | The browser's expected month differs from the server's.                                | Check device/server time and monthly key rotation.                                                           |
| `PAYMENT_NOT_CONFIRMED`                         | The invoice has not authorized issuance.                                               | Wait for payment confirmation or use the simulator in development.                                           |
| Expired invoice                                 | A payment or issuance deadline has passed.                                             | Create a new invoice if unpaid; contact the operator about funds already sent.                               |
| Browser closed during issuance                  | The response may be incomplete, but the saved request may be recoverable.              | Open Purchases and resume the same batch. Keep the local wallet intact.                                      |
| `TOKEN_ALREADY_SPENT`                           | That credential was previously redeemed.                                               | It cannot pay for another search; old backups do not recreate spent value.                                   |
| Credit set aside after a network error          | The server may have completed the search even though the response did not arrive.      | Review the uncertain count in Wallet & backup. A later manual search uses another credit.                    |
| Empty wallet on another browser                 | Credits do not synchronize through an account.                                         | Restore a current encrypted backup for this issuer.                                                          |

The recent local fingerprint error happened because a separate verification deployment used the original preview's address with different keys. The original database and keys were restored together. Future verification has a separate origin at `localhost:3200`.

Clearing site data to remove this error would discard the wallet's credits and recovery information. It would also discard the trust record that detected the mismatch. Correct recovery preserves the wallet and repairs the service identity.

## 9. Using the CLI instead of the frontend

The CLI is another client of the same API. It keeps its own encrypted file wallet; its balance does not automatically match the browser's balance.

To use the local preview from a terminal in this repository:

```bash
export BLINDPASS_API_URL=http://localhost:3100
export ISSUER_ORIGIN=localhost:3100
export BLINDPASS_HOME="$PWD/.blindpass/preview-3100"

pnpm blindpass offers
pnpm blindpass buy search-10 --no-wait
```

Keep these environment settings in the terminal used for the following commands. Unlock the CLI vault with its OS keyring or prompted passphrase. Replace `YOUR_INVOICE_ID` with the ID printed by the purchase command:

```bash
# Development simulation only:
pnpm blindpass demo:pay YOUR_INVOICE_ID

pnpm blindpass issue YOUR_INVOICE_ID
pnpm blindpass balance
pnpm blindpass search "privacy"
pnpm blindpass inspect
```

The CLI has an optional verified Tor transport for search. The browser UI does not enable it. A public HTTPS/onion destination is needed for a Tor exit to reach the service; a remote Tor exit cannot reach this machine's localhost API. See the [README's Tor instructions](../README.md#tor-mode).

## 10. What running this as a real service requires

You would operate the web application, API, database, stable issuer identity, credential keys, payment integration, and customer support process. Customers would bring a compatible Zcash wallet to pay and use their browser to hold search credits.

The implemented service foundation includes accountless access, signatures, real private credentials, encrypted wallet storage, purchase recovery, backups, payment reconciliation, aggregate monitoring, and a separate HTTPS deployment configuration.

Before a public launch, the remaining work includes a working Zcash scanner, a domain and host, external-wallet testnet validation, independent security review, monitored backups and restoration drills, deployment-specific load testing, and a clear support/refund process. A local simulation is not evidence of live payment settlement.

The current product offers a fixed pack for a bundled technical index. To sell a broader service, define the resource customers value and build that resource behind the protected endpoint. Expanding the corpus or adding a live search provider requires implementation work and a fresh review of what query information the provider receives.

The price and pack policy are enforced in several places, including the API and client checks. Changing just the text on a frontend card will not create a supported new offer. Use [the production launch runbook](production-launch.md) for deployment and operation details.

## 11. How to explain it to a judge

> BlindPass is an accountless paid-access application. A user pays for a batch of credits, receives them through blind issuance, and spends one credit per search. The server verifies that the credit is genuine and unused without requiring the invoice identifier or a customer account in the search request. The current frontend includes purchases, private search, an encrypted credit wallet, backups, and recovery. Local payments are simulated, while the credential cryptography and double-spend prevention are real. Network metadata and query contents remain visible, and launching with real Zcash payments requires a validated scanner integration.

For a short walkthrough: show Buy credits, simulate payment, receive ten credits, search once, show the balance of nine, then show backup/recovery. Use the live demo and privacy explorer to explain the protocol and its limits. Clearly identify development screens and simulated payment events.

## 12. Further reading

- [Project README](../README.md): commands, features, and limitations.
- [Architecture](architecture.md): detailed data flow and transaction boundaries.
- [Cryptography](cryptography.md): token protocol and implementation choices.
- [Privacy model](privacy.md): what is protected and what remains observable.
- [Zcash integration](zcash.md): scanner contract and payment setup.
- [Deployment guide](deployment.md): local environments and issuer continuity.
- [Production launch runbook](production-launch.md): deployment, monitoring, and recovery.
- [Verification record](production-verification.md): checks performed and external evidence still needed.
- [Learning roadmap](learning-roadmap-14-days.md): a structured route through the project.
