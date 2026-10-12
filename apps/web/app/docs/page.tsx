import Link from "next/link";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { Header } from "../../components/shell";
import { SectionLabel, Badge } from "@blindpass/ui";
import { ArchitectureDiagram } from "../../components/privacy-explorer";
function Code({ title, children }: { title: string; children: string }) {
  return (
    <div className="code-block">
      <div className="code-head">
        {title}
        <Badge>BLINDPASS</Badge>
      </div>
      <pre>{children}</pre>
    </div>
  );
}
export default function Docs() {
  return (
    <>
      <Header />
      <main className="docs-layout" id="main-content">
        <nav className="docs-nav" aria-label="Documentation sections">
          {[
            ["overview", "Overview"],
            ["quickstart", "Quickstart"],
            ["integration", "API integration"],
            ["cli", "CLI & Tor"],
            ["architecture", "Architecture"],
            ["privacy", "Privacy & threat model"],
            ["payments", "Zcash integration"],
            ["production", "Production checklist"],
          ].map(([id, label]) => (
            <a href={`#${id}`} key={id}>
              {label}
            </a>
          ))}
        </nav>
        <article className="docs-content">
          <SectionLabel>DEVELOPER DOCUMENTATION</SectionLabel>
          <h1>
            Access is a proof.
            <br />
            It doesn’t need a profile.
          </h1>
          <p>
            BlindPass is a working TypeScript reference application for shielded
            payments and blind, single-use paid access. The repository includes
            the API, SDKs, encrypted CLI vault, PostgreSQL schema, tests and
            deployment instructions.
          </p>
          <section id="overview">
            <h2>What you’re building with</h2>
            <p>
              RFC 9578 privately verifiable tokens, type 0x0001: VOPRF over
              P-384 with SHA-384, implemented by Cloudflare’s Privacy Pass
              library. Ed25519 signs operational invoices and configuration.
              PostgreSQL provides authoritative, atomic replay protection.
            </p>
            <div className="privacy-note">
              <ShieldCheck size={19} />
              <p>
                The default mode simulates Zcash payment events. Blinding,
                evaluation, proof verification, finalization and redemption use
                real cryptography. This is a reference implementation, not an
                independently audited production payment service.
              </p>
            </div>
          </section>
          <section id="quickstart">
            <h2>Running locally</h2>
            <p>
              Requires Node.js 22+, pnpm 9 and Docker. Copy{" "}
              <code>.env.example</code> to <code>.env</code> if you need to
              customize ports or configuration. Development keys are generated
              locally and excluded from version control.
            </p>
            <Code title="TERMINAL">
              {
                "pnpm install\ndocker compose up -d postgres\npnpm dev\n\n# Website: http://localhost:3000\n# API:     http://localhost:3001\n\n# Optional: start everything + two demo clients\npnpm demo"
              }
            </Code>
            <p>
              Open Buy credits, create an invoice, simulate payment
              confirmation, then receive your private credentials. Visit the
              Live demo for replay, forgery and malicious issuer attacks.
            </p>
            <Link href="/app" className="text-link">
              Open your private workspace <ArrowUpRight size={14} />
            </Link>
          </section>
          <section id="integration">
            <h2>Protect a fixed-cost endpoint</h2>
            <p>
              The SDK packages are included in this pnpm workspace. They are not
              yet published to npm. The server middleware wraps a resource
              handler in a reservation transaction. It requires the configured
              epoch verifier and a PostgreSQL connection.
            </p>
            <Code title="SERVER / TYPESCRIPT">
              {
                'import { blindpass, RedemptionService } from "@blindpass/server";\n\nconst redemption = new RedemptionService(sql, epochIssuers);\nconst protect = blindpass({\n  offer: "search-v1", cost: 1, redemption\n});\n\napp.get("/search", request =>\n  protect(request.headers.authorization,\n    () => search(request.query.q)\n  )\n);'
              }
            </Code>
            <Code title="CLIENT / TYPESCRIPT">
              {
                'const client = new BlindPassClient({\n  baseUrl: "https://search.example",\n  issuer: "search.example",\n  store: encryptedCredentialStore,\n  expectedFingerprint: trustedMerchantFingerprint\n});\n\nconst invoice = await client.buy("search-10");\n// Pay externally; poll until PAYMENT_CONFIRMED.\nawait client.issue(invoice);\nconst result = await client.search("zcash orchard");'
              }
            </Code>
            <h3>Wire format</h3>
            <Code title="HTTP">
              {
                'GET /api/search?q=privacy\nAuthorization: PrivateToken token="<padded base64url>"\n\n200 OK\n{\n  "query": "privacy",\n  "results": [...],\n  "total": 42,\n  "creditConsumed": true\n}'
              }
            </Code>
            <p>
              The illustrated total above is an example, not a live count. The
              protected handler must complete without irreversible external side
              effects before a rollback is safe. The included local search meets
              that condition. Query contents are never persisted in the
              spent-token table.
            </p>
            <h3>Important endpoints</h3>
            <Code title="API SURFACE">
              {
                "GET  /api/offers\nPOST /api/invoices\nGET  /api/invoices/:capability\nGET  /.well-known/private-token-issuer-directory\nPOST /api/issuance\nGET  /api/search?q=...\nGET  /api/privacy-audit\nGET  /api/health"
              }
            </Code>
            <p>
              The full OpenAPI document is provided in{" "}
              <code>docs/openapi.yaml</code>. The ten-token JSON issuance
              envelope is application-specific; the token protocol and
              authorization header use the selected RFCs.
            </p>
          </section>
          <section id="cli">
            <h2>The terminal is a first-class client</h2>
            <Code title="CLI">
              {
                'pnpm blindpass offers\npnpm blindpass buy search-10\n\n# Another terminal, development mode only:\npnpm blindpass demo:pay <invoice-id>\n\npnpm blindpass balance\npnpm blindpass search "zcash orchard"\npnpm blindpass inspect\npnpm blindpass audit-privacy'
              }
            </Code>
            <p>
              Credentials live in <code>~/.blindpass/credentials.db</code>,
              encrypted with AES-256-GCM. Linux Secret Service is preferred.
              Otherwise set a strong <code>BLINDPASS_VAULT_PASSWORD</code> or
              enter a passphrase interactively. Files use mode 0600. Full
              credentials are never printed.
            </p>
            <h3>Require a verified Tor connection</h3>
            <Code title="NETWORK TRANSPORT">
              {
                'BLINDPASS_API_URL=https://your-reachable-service.example \\\n  pnpm blindpass search --tor "zcash orchard"\n\n# Default proxy: socks5h://127.0.0.1:9050\n# ALL_PROXY or TOR_PROXY may override it.'
              }
            </Code>
            <p>
              The CLI checks its Tor exit before using the proxy. A failed check
              produces <code>TOR_NOT_AVAILABLE</code>; there is no silent direct
              fallback. An exit cannot reach a service bound to your computer’s
              localhost. Use a reachable HTTPS deployment or correctly
              configured onion service. Tor does not hide your query from its
              destination.
            </p>
          </section>
          <section id="architecture">
            <h2>A deliberate separation</h2>
            <ArchitectureDiagram />
            <p style={{ marginTop: 20 }}>
              The payment service stores invoice and authorization records. The
              resource service stores domain-separated token hashes with their
              common epoch. The redemption module never queries invoices. The
              browser keeps purchase capabilities and bearer credentials
              locally; it never sends a purchase identifier with a redemption.
            </p>
          </section>
          <section id="privacy">
            <h2>Privacy, stated precisely</h2>
            <p>
              Zcash protects shielded on-chain payment information. The blind
              credential protocol removes the direct cryptographic relationship
              between issuance and redemption under its security assumptions.
              Neither layer automatically hides IP addresses, TLS or browser
              fingerprints, timing, query contents, provider identity or
              compromised devices.
            </p>
            <h3>Configuration consistency matters</h3>
            <p>
              Clients verify an Ed25519-signed manifest and enforce the issuer,
              key ID, token type, class, calendar epoch and common expiry. A key
              change inside the same cached epoch is rejected. Pin a merchant
              fingerprint through an independent trusted channel for a stronger
              bootstrap than trust on first use. A signature alone cannot prove
              global configuration consistency; a public transparency log
              remains future work.
            </p>
            <h3>Small sets and metadata</h3>
            <p>
              A single purchaser can have cryptographically blind credentials
              while still being the obvious practical source of later usage. The
              auditor reports common-class confirmed purchases and does not
              pretend to know distinct people. The 50/50 comparison is a
              transcript-only, equal-prior teaching illustration.
            </p>
            <h3>Local storage and loss</h3>
            <p>
              The browser stores ciphertext and a non-extractable key in
              IndexedDB. This protects stored credential bytes from casual
              inspection, not compromised devices or malicious same-origin
              scripts. Encrypted pending issuance state allows recovery after a
              refresh or crash. Save a passphrase-protected backup from Wallet &
              backup before clearing browser data. Restore into an empty wallet
              for the same issuer. Without a current backup, lost bearer credits
              cannot be recovered; automatic replacement credentials are not
              supported.
            </p>
          </section>
          <section id="payments">
            <h2>Shielded Zcash integration</h2>
            <p>
              The production boundary is a self-hosted scanner bridge,
              documented in <code>docs/zcash.md</code>. It must derive and
              decode ZIP-316 Unified Addresses with an Orchard receiver,
              validate address checksums and receiver contents with established
              Zcash libraries, and scan incoming payments with incoming viewing
              capability. The API never needs a merchant spending key.
            </p>
            <p style={{ marginTop: 14 }}>
              The bridge contract uses fixed-price invoices, unique diversified
              addresses, empty memos, confirmation updates and signed webhooks.
              It is not an invented CipherPay API. External scanner
              implementation, credentials and a tested wallet are required to
              receive real ZEC. Mainnet configuration must be deliberate.
            </p>
          </section>
          <section id="production">
            <h2>Before handling real value</h2>
            <p>
              Arrange independent security review, a tested payment scanner,
              secure epoch key custody, stable signing identity, TLS, log
              policies at every proxy/CDN, rate limits appropriate to your
              privacy goals, database backups, and a manual refund policy.
              Rotate shared epoch keys with overlap through the common grace
              period. Debug routes are disabled in production. The separate
              operator dashboard requires its own access key and exposes
              aggregate service data.
            </p>
            <Code title="VERIFICATION">
              {
                "pnpm lint\npnpm typecheck\npnpm test\npnpm test:stress\npnpm build\npnpm test:e2e"
              }
            </Code>
            <p>
              Detailed architecture, cryptography, Zcash, privacy, threat-model,
              deployment and judge-demo documents ship in the repository’s{" "}
              <code>docs/</code> directory. Start with{" "}
              <code>docs/production-launch.md</code>
              for the HTTPS stack, scanner reconciliation, key provisioning, and
              recovery procedures.
            </p>
          </section>
        </article>
      </main>
    </>
  );
}
