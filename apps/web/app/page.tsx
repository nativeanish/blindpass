import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  CheckCheck,
  Wallet,
  ScanLine,
  Search,
  Link2Off,
  Globe,
  Layers,
  Code2,
  Terminal,
  UserRound,
} from "lucide-react";
import { Header } from "../components/shell";
import { ArchitectureDiagram } from "../components/privacy-explorer";
import { Logo, Badge, SectionLabel } from "@blindpass/ui";
export default function Home() {
  return (
    <>
      <Header />
      <main className="landing" id="main-content">
        <section className="hero">
          <div>
            <SectionLabel>PRIVATE PAYMENTS. UNLINKABLE ACCESS.</SectionLabel>
            <h1>
              Pay privately.
              <br />
              <span>Use privately.</span>
            </h1>
            <p className="hero-description">
              Your payment shouldn’t become your identity.
              <br />
              Buy digital access with shielded ZEC. Use it later with
              unlinkable, single-use credentials.
            </p>
            <div className="hero-buttons">
              <Link href="/app/buy" className="button">
                Get private credits <ArrowUpRight size={17} />
              </Link>
              <Link href="/docs" className="button button-secondary">
                <Code2 size={16} />
                Developer docs
              </Link>
            </div>
            <div className="hero-note">
              <span>
                <Check size={12} />
                No account required
              </span>
              <span>
                <Check size={12} />
                No API keys
              </span>
              <span>
                <Check size={12} />
                Open source
              </span>
            </div>
          </div>
          <div
            className="hero-visual"
            aria-label="Conceptual private credit preview"
          >
            <div className="protocol-preview">
              <div className="preview-top">
                <span className="preview-label mono">YOUR PRIVATE CREDITS</span>
                <Badge tone="green">
                  <span className="status-dot" />
                  UNLINKABLE
                </Badge>
              </div>
              <div className="preview-main">
                <div className="preview-balance">
                  <strong>10</strong>
                  <div>
                    private searches
                    <small>One credential. One request. No account.</small>
                  </div>
                </div>
                <div className="credit-grid">
                  {Array.from({ length: 10 }, (_, i) => (
                    <div className="credit-dot" key={i}>
                      <ScanLine size={18} />
                    </div>
                  ))}
                </div>
                <div className="preview-meta mono">
                  <span>SHIELDED ZEC → BLIND ISSUANCE</span>
                  <span>RFC 9578 ↗</span>
                </div>
              </div>
            </div>
            <div className="preview-float">
              <span className="check-tile">
                <Check size={17} />
              </span>
              <div>
                <strong>Access granted.</strong>
                <small>Link to payment? Cryptographically unknown.</small>
              </div>
            </div>
            <span className="visual-caption mono">
              PROTOCOL PREVIEW · YOUR SECRET STAYS YOURS
            </span>
          </div>
        </section>
        <div className="protocol-strip">
          <span className="mono">BUILT ON PROVEN PRIMITIVES</span>
          <span>
            <span className="zcash-mark">ⓩ</span> Zcash shielded payments
          </span>
          <span>
            <ScanLine size={15} /> IETF Privacy Pass
          </span>
          <span>
            <Layers size={15} /> P-384 / SHA-384
          </span>
          <span>
            <Terminal size={15} /> Developer-first
          </span>
        </div>
        <section className="section">
          <div className="section-head">
            <div>
              <SectionLabel>THE MISSING PRIVACY LAYER</SectionLabel>
              <h2>
                A private payment.
                <br />
                Shouldn’t create a usage profile.
              </h2>
            </div>
            <p>
              Even a shielded payment can lead to a session that links every
              request. BlindPass breaks the direct cryptographic link between
              purchase and use.
            </p>
          </div>
          <div className="comparison-grid">
            <div className="panel">
              <div className="panel-header">
                <h3>Ordinary paid access</h3>
                <Badge>LINKED BY DESIGN</Badge>
              </div>
              <div className="diagram-row">
                <div className="diagram-node">
                  <Wallet size={20} />
                  Payment
                </div>
                <ArrowRight className="diagram-arrow" size={17} />
                <div className="diagram-node">
                  <UserRound size={20} />
                  Session
                </div>
                <ArrowRight className="diagram-arrow" size={17} />
                <div className="diagram-node">
                  <Search size={20} />
                  Every request
                </div>
              </div>
              <p className="panel-caption">
                <Link2Off size={14} />
                Private payment. Identifiable usage.
              </p>
            </div>
            <div className="panel panel-green">
              <div className="panel-header">
                <h3>Access with BlindPass</h3>
                <Badge tone="green">CRYPTOGRAPHICALLY UNLINKED</Badge>
              </div>
              <div className="diagram-row">
                <div className="diagram-node">
                  <Wallet size={20} />
                  Payment
                </div>
                <ArrowRight className="diagram-arrow" size={17} />
                <div className="diagram-node">
                  <ScanLine size={20} />
                  Blind issuance
                </div>
                <span className="diagram-break">
                  <Link2Off size={18} />
                  NO LINK
                </span>
                <div className="diagram-node">
                  <Search size={20} />
                  Request
                </div>
              </div>
              <p className="panel-caption">
                <Check size={14} className="accent" />
                The service verifies a credit, not a customer.
              </p>
            </div>
          </div>
        </section>
        <section className="section" id="how-it-works">
          <div className="section-head">
            <div>
              <SectionLabel>LESS IDENTITY. SAME ACCESS.</SectionLabel>
              <h2>Three steps. No account required.</h2>
            </div>
          </div>
          <div className="steps-grid">
            <div>
              <div className="step-number">
                01 / PAY <Wallet size={17} />
              </div>
              <h3>Pay with shielded ZEC.</h3>
              <p>
                Choose a fixed-price credit pack. Pay from your external Zcash
                wallet to a unique shielded receiving address.
              </p>
            </div>
            <div>
              <div className="step-number">
                02 / RECEIVE <ScanLine size={17} />
              </div>
              <h3>Receive private credits.</h3>
              <p>
                Your device blinds token requests. The issuer evaluates them.
                Your device verifies the proofs and unblinds your credentials.
              </p>
            </div>
            <div>
              <div className="step-number">
                03 / REDEEM <CheckCheck size={17} />
              </div>
              <h3>Use them on your terms.</h3>
              <p>
                Present one credit when you need access. It is verified and
                atomically spent, without a cryptographic pointer to your
                invoice.
              </p>
            </div>
          </div>
        </section>
        <section className="section">
          <div className="section-head">
            <div>
              <SectionLabel>PRECISE BY DESIGN</SectionLabel>
              <h2>
                Privacy has layers.
                <br />
                We’re clear about each one.
              </h2>
            </div>
            <p>
              Cryptographic unlinkability is not total internet anonymity. Each
              layer has a specific job.
            </p>
          </div>
          <div className="panel">
            <table className="layer-table">
              <thead>
                <tr>
                  <th>Privacy layer</th>
                  <th>What it protects</th>
                  <th>What it doesn’t hide</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <span className="layer-name">
                      <Wallet size={21} />
                      Zcash
                    </span>
                  </td>
                  <td>
                    <span className="table-check">↳</span> Shielded on-chain
                    payment details
                  </td>
                  <td className="muted">Your API request from the merchant</td>
                </tr>
                <tr>
                  <td>
                    <span className="layer-name">
                      <ScanLine size={21} />
                      Blind credentials
                    </span>
                  </td>
                  <td>
                    <span className="table-check">↳</span> The cryptographic
                    payment-to-use link
                  </td>
                  <td className="muted">
                    Your IP, timing or browser fingerprint
                  </td>
                </tr>
                <tr>
                  <td>
                    <span className="layer-name">
                      <Globe size={21} />
                      Tor / relay
                    </span>
                  </td>
                  <td>
                    <span className="table-check">↳</span> Source network
                    identity at destination
                  </td>
                  <td className="muted">
                    Query contents or every correlation risk
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <Link
            href="/demo/privacy"
            className="text-link"
            style={{ marginTop: 23 }}
          >
            Explore the privacy model <ArrowUpRight size={14} />
          </Link>
        </section>
        <section className="section developer-grid">
          <div>
            <SectionLabel>BUILT FOR BUILDERS</SectionLabel>
            <h2>
              Paid access.
              <br />
              Without the identity stack.
            </h2>
            <p>
              One private credit, one request. Add accountless access to search,
              downloads, or your next data API. Start with the working
              TypeScript reference integration.
            </p>
            <Link className="button button-secondary" href="/docs">
              Read the integration guide <ArrowUpRight size={15} />
            </Link>
            <p style={{ marginTop: 15, fontSize: 10 }}>
              Workspace SDKs included. Packages are not yet published to npm.
            </p>
          </div>
          <div className="code-block">
            <div className="code-head">
              <span>YOUR-API.TS</span>
              <Badge>TYPESCRIPT</Badge>
            </div>
            <pre>
              <span className="code-keyword">import</span>
              {' { blindpass } from "@blindpass/server";\n\n'}
              <span className="code-comment">
                {"// A credit proves access. Not identity.\n"}
              </span>
              {
                'const protect = blindpass({\n  offer: "search-v1",\n  cost: 1,\n  redemption\n});\n\napp.get("/search", request =>\n  protect(request.headers.authorization,\n    () => search(request.query.q)\n  )\n);'
              }
            </pre>
          </div>
        </section>
        <section className="landing-section">
          <SectionLabel>THE ARCHITECTURE</SectionLabel>
          <h2>One authorization. Two separate records.</h2>
          <p className="section-intro">
            The issuer authorizes a paid batch. The API verifies a credit,
            without receiving its purchase identifier.
          </p>
          <ArchitectureDiagram />
        </section>
        <section className="footer-cta">
          <div>
            <h2>Access, without the attachment.</h2>
            <p>
              Ten private searches. One shielded payment. No account required.
            </p>
          </div>
          <Link className="button" href="/app">
            Explore BlindPass <ArrowUpRight size={17} />
          </Link>
        </section>
        <footer className="public-footer">
          <Link href="/">
            <Logo small />
          </Link>
          <span>Pay privately. Use privately. Know the limits.</span>
          <nav>
            <Link href="/docs">Documentation</Link>
            <Link href="/demo/privacy">Privacy model</Link>
            <Link href="/app/help">Service & support ↗</Link>
          </nav>
        </footer>
      </main>
    </>
  );
}
