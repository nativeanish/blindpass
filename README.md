# BlindPass

**Pay privately. Use privately.**

Purchase digital access with shielded ZEC and redeem it later using unlinkable single-use credentials. BlindPass is a working, accountless reference application with a Next.js product interface, Fastify API, PostgreSQL database, encrypted CLI, real Privacy Pass cryptography, and a judge-ready live demo.

## What it is — and what it is not

A payment proves “someone paid for these credits.” A credential proves “the holder of a legitimately issued credit may use this resource.” Neither needs a customer account, API key or invoice identifier at redemption.

BlindPass combines three distinct properties:

| Layer | Protection | Limit |
| --- | --- | --- |
| Shielded Zcash payment | Shielded payment information on the public chain | Merchant and scanner see incoming payment data |
| Blind Privacy Pass issuance | Direct cryptographic issuance/redemption unlinkability under the protocol assumptions | Does not hide IP addresses, timing or query contents |
| Optional Tor CLI transport | Reduces source network exposure to the destination | Does not guarantee anonymity or protect a compromised endpoint |

This is **not total internet anonymity**. TLS fingerprints, browser fingerprints, query contents, provider identity, small anonymity sets, network observers and compromised devices remain relevant.

**Default development mode simulates only payment events. It never simulates credential cryptography.** Sample payment URIs contain an obviously non-payable address. Do not send funds to a development invoice. The real scanner bridge requires separately deployed Zcash tooling; no Zcash node, wallet or CipherPay account is bundled or falsely represented as connected.

## Quickstart

Requires Node.js 22 or later (24 tested), pnpm 9.10+, and Docker Compose.

```bash
pnpm install
docker compose up -d postgres
pnpm dev
```

Open **http://localhost:3000**. The API listens on **http://localhost:3001**. Migrations and the 1,806-entry local search corpus are loaded automatically. No paid external services, ZEC or Tor are needed.

Optional configuration:

```bash
cp .env.example .env
```

If PostgreSQL port 5432 is occupied, set `POSTGRES_PORT=55432` and change `DATABASE_URL` to use port 55432. This checkout’s local ignored `.env` uses that alternative port. Use `localhost:3000` consistently; the trusted issuer hostname must match `ISSUER_ORIGIN`.

Alternative container quickstart:

```bash
docker compose up --build
```

The default Compose deployment is a **local development demonstration**, including mock payments. It is not a production configuration.

## Try the complete flow

1. Open `/app/buy` and choose **10 private searches — 0.01 ZEC**.
2. Create a signed invoice; click **Simulate payment confirmation**.
3. Click **Receive private credits**. The browser blinds requests, verifies issuer proofs and unblinds locally.
4. Open `/app/search`, enter a query and redeem one credit. The local balance becomes 9.
5. Open `/demo` and **Run complete demo**. Alice and Bob purchase identical batches, issue 20 real credentials, redeem in shuffled order, and test replay, forgery and four malicious issuer configurations.
6. Run the privacy audit and explore the clearly labeled network side-channel scenario.

Routes:

| Route | Purpose |
| --- | --- |
| `/` | Public product site |
| `/app` | Encrypted local wallet overview |
| `/app/buy` | Signed invoice, payment states and real issuance |
| `/app/search` | Fixed-cost local technical search |
| `/demo` | Actual two-client protocol and attack demonstration |
| `/demo/privacy` | Transcript comparison, side channels and architecture |
| `/admin` | Development-only merchant datasets and aggregate metrics |
| `/presentation` | Ten keyboard-navigable judge slides with embedded live app |
| `/docs` | In-app developer documentation |

`pnpm demo` starts PostgreSQL, API and web, seeds two independent in-memory clients, and opens the path to the browser demonstration. Stop an existing `pnpm dev` first to avoid port conflicts. It does not automatically open a browser or send mainnet transactions.

## Architecture and repository

```text
apps/web                    Next.js / React / Tailwind product interface
apps/api                    Fastify, invoice authorization, signed configuration
apps/demo-service           Local PostgreSQL full-text search + bundled corpus
packages/privacy-pass       Small auditable Cloudflare RFC 9578 wrapper
packages/blindpass-client   Browser/CLI SDK and issuer-policy enforcement
packages/blindpass-server   Transactional credential middleware
packages/zcash              Mock watcher + authenticated scanner boundary
packages/shared             Strict schemas, types, canonical application encoding
packages/ui                 Shared visual components
cli                         Encrypted file vault, commands, verified Tor transport
infra                       SQL migration, Docker images, Tor, webhook fixture
tests                       Vectors, crypto, concurrency, API, policy, browser tests
docs                        Architecture, threat model, protocol and demo guides
```

There are no user, account or profile tables. `invoices` and `issuance_authorizations` describe purchases. `redeemed_tokens` stores only a domain-separated SHA-256 token hash, common epoch, reservation/spend state and timestamps. It has no invoice foreign key. The redemption module never queries invoices.

## Privacy Pass design

The cryptographic boundary uses `@cloudflare/privacypass-ts@0.9.0` and `@cloudflare/voprf-ts@1.0.0`, with the library’s Noble provider. Token type `0x0001` is the RFC 9578 privately verifiable VOPRF(P-384, SHA-384). No custom elliptic-curve arithmetic or blind-signature primitive is implemented.

Every buyer in a UTC calendar month shares the epoch key, class `search-v1`, batch size 10 and expiry. Issuance ends at the next month boundary; verification continues for a common seven-day grace period. The standard token’s challenge binds the common class and dates. Invoice IDs and purchase timestamps never enter token inputs.

The application transports ten independent standardized requests in a JSON envelope. That envelope is not the generic batched-token draft or a claim of full RFC issuance HTTP interoperability. Redemption uses `Authorization: PrivateToken token="<padded base64url>"`.

A stable Ed25519 key signs the public manifest and invoice documents. This is operational integrity, separate from anonymous-credential cryptography. Clients pin an expected identity fingerprint or persist it after a trusted first bootstrap. A cached epoch configuration must remain identical. A merchant signature alone does not prove cross-client consistency on first use; independent pinning and a future transparency log are needed for that threat.

## CLI and encrypted credentials

```bash
pnpm blindpass offers
pnpm blindpass buy search-10

# In another terminal, development only:
pnpm blindpass demo:pay <invoice-id>
# Equivalent:
pnpm demo:confirm-payment <invoice-id>

pnpm blindpass invoices
pnpm blindpass balance
pnpm blindpass search "zcash orchard"
pnpm blindpass inspect
pnpm blindpass audit-privacy
pnpm blindpass demo
```

`buy --no-wait` returns after invoice creation; `issue <invoice-id>` resumes an unissued paid purchase. A workspace command binary is also provided at `cli/bin/blindpass.mjs`.

The CLI vault is `~/.blindpass/credentials.db`, encrypted with AES-256-GCM and scrypt key derivation, with mode 0600 files in a 0700 directory. Linux `secret-tool` / Secret Service is preferred. Otherwise enter a strong passphrase interactively or set `BLINDPASS_VAULT_PASSWORD` through your secret manager. Do not commit it. There is no plaintext key-file fallback. `BLINDPASS_HOME` can select an isolated vault.

The browser uses encrypted IndexedDB plus a non-extractable Web Crypto key. The key and ciphertext are origin-local; malicious same-origin scripts and a compromised device remain capable of spending credits. Clearing site data deletes them. There is no account-based recovery.

## Tor mode

```bash
docker compose --profile tor up -d tor
pnpm blindpass search --tor "zcash orchard"
```

The proxy defaults to `socks5h://127.0.0.1:9050`; `ALL_PROXY` or `TOR_PROXY` overrides it. `--tor` requires a successful Tor Project exit check before showing `TOR CONNECTED`. Failures return `TOR_NOT_AVAILABLE` and never fall back to direct transport. Use `BLINDPASS_API_URL` for a reachable HTTPS or onion service; a Tor exit cannot access your local API at `localhost:3001`. The default direct development flow works without Tor.

## Zcash setup

Mock mode has no chain or wallet connection. For real payments, configure `ZCASH_PAYMENT_MODE=scanner` and provide the scanner bridge URL, API credential and webhook authentication secret. The bridge must derive unique diversified ZIP-316 Unified Addresses with Orchard receivers, validate them using established Zcash libraries, and scan using incoming viewing capability. Amounts are fixed, and memos are empty. The merchant API does not accept or need a spending key. See [Zcash integration](docs/zcash.md) for the exact contract and testnet procedure.

## API integration

The workspace SDK packages are not published to npm yet. Use them inside the monorepo or build/package them before distributing.

```ts
import { blindpass, RedemptionService } from '@blindpass/server';

const redemption = new RedemptionService(sql, epochIssuers);
const protect = blindpass({ offer: 'search-v1', cost: 1, redemption });
app.get('/search', request =>
  protect(request.headers.authorization, () => search(request.query.q))
);
```

```ts
const client = new BlindPassClient({
  baseUrl: 'https://search.example', issuer: 'search.example',
  store: encryptedStore, expectedFingerprint: trustedFingerprint
});
const invoice = await client.buy('search-10');
// After external payment confirmation:
await client.issue(invoice);
await client.search('privacy');
```

[OpenAPI specification](docs/openapi.yaml) · [Architecture](docs/architecture.md) · [Cryptography](docs/cryptography.md)

## Testing

```bash
pnpm lint
pnpm typecheck
pnpm test                    # Includes PostgreSQL integration tests
pnpm test:stress             # 10,000 real issue/finalize/redeem cycles
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm audit --audit-level high
```

PostgreSQL must be running. Integration tests create and remove isolated random schemas; use a disposable test database with schema privileges. The stress gate exercises actual token verification and PostgreSQL reservation/spend operations, not a mocked signer. Tests cover published reference-vector bytes, proof failure, forgery, expiry, policy attacks, payment states, reorgs, duplicate events, reservation rollback and a 20-request replay race. Browser tests drive the real purchase/search and Alice/Bob demos.

## Threat model and security assumptions

The merchant operates both issuer and API. It knows a payment authorized a batch and that a credential was validly redeemed, but correct blind issuance provides no direct cryptographic matching identifier. A malicious merchant can still attempt traffic correlation, first-use configuration partitioning, selective refusal, or endpoint compromise. Independent client distribution, stable configuration pins and consistent shared epochs are necessary. Browser JavaScript delivered by a malicious merchant is itself an important trust boundary.

Logs deliberately omit request URLs, IPs, credentials, capabilities and queries. Metrics are aggregate counts. Deployment proxies, scanners, hosting platforms and backups need their own retention policies. JavaScript does not guarantee constant-time execution. This composition has not been independently audited.

## Known limitations and production considerations

- Real chain scanning and address derivation are an external integration requirement. CipherPay credentials/API compatibility have not been assumed or fabricated.
- The bundled app demonstrates one class and one functioning 10-credit offer; the 25-credit offer is visibly unavailable.
- Same-request issuance retries work while client blinding state is available. A browser/process crash after committed issuance can lose credits. Replacement/refund credentials are future work; no silent reissuance is allowed.
- A search response lost after commitment has an ambiguous outcome. The SDK conservatively removes that credit and does not automatically replay it.
- Reorgs before issuance revoke authorization. Reorgs after issuance are merchant risk because issued credits cannot be individually revoked without adding linkage.
- A month-boundary restart/rotation is needed to load the next epoch. Previous keys must remain available through grace. Keep a stable signing identity and back up secrets with the database.
- Global configuration transparency, OHTTP, hardware-backed browser recovery and production DoS economics require further work.
- Admin/debug endpoints exist only outside production. Production startup rejects mock payments and missing explicit secrets.

See [Deployment](docs/deployment.md), [Threat model](docs/threat-model.md), [Privacy](docs/privacy.md), [Security](SECURITY.md), and the [2:45 judge script](docs/demo-script.md).

## Future work

OHTTP, larger anonymity pools, wallet-native storage, mobile SDKs, refund credentials, fixed-value denominations, anonymous metered sessions, a merchant configuration transparency log, multi-provider relays, additional private payment rails, MCP integration, VPN day passes, private downloads and paid data APIs. These are roadmap items, not represented as implemented features.

## License

MIT for BlindPass code. Third-party libraries retain their licenses. The published RFC test vector includes attribution in `tests/vectors/README.md`; the local corpus includes RFC title/publication metadata and source links.
