"use client";
import { useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Wallet,
  UserRound,
  ScanLine,
  Link2Off,
  Globe,
  Clock,
  Fingerprint,
  Check,
  ShieldCheck,
  Play,
} from "lucide-react";
import { Badge, SectionLabel } from "@blindpass/ui";
export function SideChannels() {
  const [strong, setStrong] = useState(false);
  return (
    <div className="panel sidechannel-panel">
      <div className="panel-header">
        <h3>Same cryptography. Different metadata.</h3>
        <Badge tone="amber">ILLUSTRATIVE SCENARIO</Badge>
      </div>
      <div className="panel-body">
        <div
          className="scenario-tabs"
          role="group"
          aria-label="Transport scenario"
        >
          <button
            className={!strong ? "selected" : ""}
            onClick={() => setStrong(false)}
          >
            Immediate + direct
          </button>
          <button
            className={strong ? "selected" : ""}
            onClick={() => setStrong(true)}
          >
            Stronger privacy assumptions
          </button>
        </div>
        <div className="metadata-grid">
          <div>
            <Clock size={18} />
            <small>PAYMENT → REDEMPTION</small>
            <strong>
              {strong ? "14:02:31 → next day" : "14:02:31 → 14:02:34"}
            </strong>
            <p>
              {strong
                ? "Delayed use reduces obvious timing proximity."
                : "A three-second gap creates a useful timing signal."}
            </p>
          </div>
          <div>
            <Globe size={18} />
            <small>NETWORK AT DESTINATION</small>
            <strong>
              {strong ? "Separate Tor exit" : "Same IP: 192.0.2.x"}
            </strong>
            <p>
              {strong
                ? "Assume a verified Tor transport, not just a proxy flag."
                : "An illustrative documentation IP, not your measured IP."}
            </p>
          </div>
          <div>
            <Fingerprint size={18} />
            <small>BROWSER / CLIENT METADATA</small>
            <strong>
              {strong ? "No persistent identifier" : "Same fingerprint: fp_a7…"}
            </strong>
            <p>
              {strong
                ? "Cookies stripped, common class and expiry retained."
                : "A matching browser fingerprint adds another signal."}
            </p>
          </div>
        </div>
        <div className={`correlation-result ${strong ? "reduced" : ""}`}>
          <ShieldCheck size={20} />
          <div>
            <strong>
              {strong
                ? "REDUCED SIDE-CHANNEL LINKABILITY"
                : "LIKELY CORRELATION"}
            </strong>
            <p>
              {strong
                ? "These assumptions reduce some signals. Tor does not guarantee anonymity; destination queries and timing remain relevant."
                : "Cryptographic blindness is active, but network and timing evidence can still connect the events."}
            </p>
          </div>
        </div>
        <p className="panel-note">
          This control changes an educational scenario. It does not enable Tor
          in your browser, change your network, or measure your fingerprint. Use{" "}
          <code>blindpass search --tor</code> for the implemented proxy mode.
        </p>
      </div>
    </div>
  );
}
export function CryptoVisualization({ active = false }: { active?: boolean }) {
  return (
    <div className={`crypto-visualization ${active ? "is-active" : ""}`}>
      <div className="crypto-zone">
        <span className="crypto-zone-label">ON YOUR DEVICE</span>
        <div className="crypto-node">
          <Fingerprint size={22} />
          <strong>Client secret</strong>
          <small>Never sent</small>
        </div>
        <span className="crypto-connector">
          BLIND <ArrowRight size={15} />
        </span>
        <div className="crypto-node opaque">
          <span className="opaque-symbol">░▒▓</span>
          <strong>Blinded element</strong>
          <small>Opaque to issuer</small>
        </div>
      </div>
      <div className="crypto-zone merchant">
        <span className="crypto-zone-label">MERCHANT</span>
        <div className="crypto-node">
          <ScanLine size={22} />
          <strong>Evaluate + prove</strong>
          <small>Sees: ????????</small>
        </div>
      </div>
      <div className="crypto-zone">
        <span className="crypto-zone-label">ON YOUR DEVICE</span>
        <span className="crypto-connector">
          VERIFY & UNBLIND <ArrowRight size={15} />
        </span>
        <div className="crypto-node valid">
          <Check size={22} />
          <strong>Valid credential</strong>
          <small>Payment link: unknown</small>
        </div>
      </div>
      <p className="crypto-caption">
        Conceptual visualization — not literal representation of curve
        operations.
      </p>
    </div>
  );
}
export function ArchitectureDiagram() {
  return (
    <div className="architecture">
      <div className="architecture-lane">
        <span className="eyebrow">PAYMENT & AUTHORIZATION</span>
        {[
          "External Zcash wallet",
          "ZIP-321 shielded payment",
          "Merchant wallet",
          "Read-only payment watcher",
          "Payment authorization",
          "Privacy Pass issuer",
        ].map((label, i) => (
          <div key={label}>
            <span className="architecture-box">{label}</span>
            {i < 5 && <ArrowDown size={15} />}
          </div>
        ))}
      </div>
      <div className="architecture-lane client">
        <span className="eyebrow">CLIENT · LOCAL SECRETS</span>
        {[
          "Generate & blind requests",
          "Send blinded elements to issuer",
          "Receive evaluation + proof",
          "Verify proof & unblind",
          "Encrypted credential vault",
        ].map((label, i) => (
          <div key={label}>
            <span className="architecture-box">{label}</span>
            {i < 4 && <ArrowDown size={15} />}
          </div>
        ))}
        <span className="architecture-break">
          <Link2Off size={20} />
          NO CRYPTOGRAPHIC JOIN
        </span>
      </div>
      <div className="architecture-lane">
        <span className="eyebrow">LATER · RESOURCE ACCESS</span>
        {[
          "Present one credential",
          "Protected search API",
          "Verify credential & context",
          "Atomic reservation in spent DB",
          "Execute local search",
          "Mark spent & return resource",
        ].map((label, i) => (
          <div key={label}>
            <span className="architecture-box">{label}</span>
            {i < 5 && <ArrowDown size={15} />}
          </div>
        ))}
      </div>
    </div>
  );
}
export function PrivacyExplorer() {
  return (
    <div id="main-content">
      <div className="page-heading">
        <div>
          <SectionLabel>THE PRIVACY EXPLORER</SectionLabel>
          <h1>Break the link. Know the limits.</h1>
          <p>
            A closer look at what blind credentials protect — and what they
            don’t.
          </p>
        </div>
        <Link href="/demo" className="button button-small">
          <Play size={14} />
          Run it live
        </Link>
      </div>
      <div className="comparison-grid">
        <div className="panel">
          <div className="panel-header">
            <h3>A / Ordinary paid API session</h3>
            <Badge tone="amber">DIRECTLY LINKED</Badge>
          </div>
          <div className="vertical-flow">
            <div className="flow-block">
              <Wallet size={17} />
              <span>
                Payment invoice<code>invoice_81</code>
              </span>
            </div>
            <ArrowDown size={19} />
            <div className="flow-block">
              <UserRound size={17} />
              <span>
                Persistent session<code>session_928fa</code>
              </span>
            </div>
            <ArrowDown size={19} />
            <div className="request-nodes">
              <span>Request 1</span>
              <span>Request 2</span>
              <span>Request 3</span>
            </div>
          </div>
          <div className="panel-caption">
            Same session. A direct join from payment to every request.
          </div>
        </div>
        <div className="panel panel-green">
          <div className="panel-header">
            <h3>B / BlindPass access</h3>
            <Badge tone="green">BLIND ISSUANCE</Badge>
          </div>
          <div className="vertical-flow">
            <div className="parallel-nodes">
              <div className="flow-block">
                <Wallet size={16} />
                <span>
                  Alice<code>invoice_A</code>
                </span>
              </div>
              <div className="flow-block">
                <Wallet size={16} />
                <span>
                  Bob<code>invoice_B</code>
                </span>
              </div>
            </div>
            <div className="parallel-nodes">
              <span className="mini-transcript">10 blinded requests</span>
              <span className="mini-transcript">10 blinded requests</span>
            </div>
            <div className="unlink-divider">
              <span />
              <Link2Off size={22} />
              <span />
            </div>
            <div className="parallel-nodes">
              <div className="flow-block">
                <ScanLine size={16} />
                <span>
                  Redemption<code>token_hash_X</code>
                </span>
              </div>
              <div className="flow-block">
                <ScanLine size={16} />
                <span>
                  Redemption<code>token_hash_Y</code>
                </span>
              </div>
            </div>
          </div>
          <div className="panel-caption">
            <Check size={14} className="accent" />
            No final token appears in the issuance transcript.
          </div>
        </div>
      </div>
      <div className="transcript-explainer">
        <div>
          <SectionLabel>
            TRANSCRIPT-ONLY UNLINKABILITY DEMONSTRATION
          </SectionLabel>
          <h2>
            Two identical batches.
            <br />
            No cryptographic matching signal.
          </h2>
          <p>
            Alice and Bob share the offer, batch size, key, class, epoch and
            expiry. Under an equal-prior, two-buyer illustration, the blind
            transcript provides no basis to prefer one invoice.
          </p>
          <Badge>NOT A REAL-WORLD ANONYMITY ESTIMATE</Badge>
        </div>
        <div className="panel">
          <table className="probability-table">
            <thead>
              <tr>
                <th>Issued by?</th>
                <th>Invoice A</th>
                <th>Invoice B</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>Token X</th>
                <td>
                  50<span>%</span>
                </td>
                <td>
                  50<span>%</span>
                </td>
              </tr>
              <tr>
                <th>Token Y</th>
                <td>
                  50<span>%</span>
                </td>
                <td>
                  50<span>%</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div className="section-heading-small">
        <SectionLabel>THE SIDE-CHANNEL REALITY</SectionLabel>
        <h2>Unlinkable is not network anonymous.</h2>
      </div>
      <SideChannels />
      <div className="section-heading-small">
        <SectionLabel>INSIDE THE CREDENTIAL</SectionLabel>
        <h2>The secret stays on your side.</h2>
      </div>
      <CryptoVisualization active />
      <div className="section-heading-small">
        <SectionLabel>THE COMPLETE PATH</SectionLabel>
        <h2>Three boundaries. One private credit.</h2>
      </div>
      <ArchitectureDiagram />
      <div className="privacy-note">
        <Globe size={21} />
        <p>
          <strong>
            Zcash protects shielded blockchain payment information. Privacy Pass
            removes the direct cryptographic issuance/redemption link. Network
            metadata requires a separate privacy layer.
          </strong>
          <br />
          IP addresses, TLS/browser fingerprints, request timing, query
          contents, provider identity and compromised devices are not
          automatically hidden.{" "}
          <Link href="/docs" className="accent">
            Read the threat model <ArrowUpRight size={12} />
          </Link>
        </p>
      </div>
    </div>
  );
}
