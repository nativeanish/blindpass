"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Maximize,
  Wallet,
  UserRound,
  Search,
  ArrowDown,
} from "lucide-react";
import { Logo, Badge, SectionLabel } from "@blindpass/ui";
import {
  ArchitectureDiagram,
  CryptoVisualization,
  SideChannels,
} from "../../components/privacy-explorer";
const LiveDemo = dynamic(
  () => import("../../components/live-demo").then((m) => m.LiveDemo),
  { ssr: false, loading: () => <p>Loading the live protocol…</p> },
);
const slides = [
  {
    label: "THE PROBLEM",
    title: "Private payment ≠ private usage.",
    text: "Zcash can shield a payment on-chain. A service can still attach that payment to a session and every future request.",
  },
  {
    label: "THE ORDINARY MODEL",
    title: "One session. Every request connected.",
    text: "A persistent identifier makes the merchant’s correlation trivial.",
  },
  {
    label: "THE ARCHITECTURE",
    title: "Prove access. Leave identity out.",
    text: "A payment authorizes a blind batch. A credential authorizes a resource. Neither requires an account.",
  },
  {
    label: "LIVE PURCHASE",
    title: "Two buyers. One common configuration.",
    text: "Alice and Bob each buy 10 credits for 0.01 ZEC. Only the payment event is simulated.",
  },
  {
    label: "BLIND ISSUANCE",
    title: "The merchant never sees your final credits.",
    text: "Blinding happens locally. The issuer evaluates. The client verifies the proof and unblinds.",
  },
  {
    label: "UNLINKABLE REDEMPTION",
    title: "Valid credit. Unknown purchase.",
    text: "Shuffled redemptions carry no invoice ID. Transcript-only 50/50 is an equal-prior illustration, not a real-world anonymity estimate.",
  },
  {
    label: "REPLAY DEFENSE",
    title: "Valid once. Then spent.",
    text: "A PostgreSQL unique constraint atomically reserves the credential. Twenty competing requests produce exactly one winner.",
  },
  {
    label: "MALICIOUS ISSUER",
    title: "An unusual key is a privacy warning.",
    text: "Even a correctly signed response is rejected if its key, expiry, class or key ID differs from the trusted common policy.",
  },
  {
    label: "THE HONEST LIMIT",
    title: "Unlinkable is not network anonymous.",
    text: "IP addresses, timing, TLS/browser fingerprints and query contents still matter. Tor is a separate layer, not a guarantee.",
  },
  {
    label: "BUILD WITH IT",
    title: "Pay privately. Use privately.",
    text: "Zcash protects the payment. BlindPass breaks the cryptographic payment-to-usage link. Network anonymity remains a separate layer.",
  },
];
export default function Presentation() {
  const [slide, setSlide] = useState(0);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if ((e.target as HTMLElement).matches("input,textarea")) return;
      if (e.key === "ArrowRight") setSlide((s) => Math.min(9, s + 1));
      if (e.key === "ArrowLeft") setSlide((s) => Math.max(0, s - 1));
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const current = slides[slide];
  return (
    <div className="presentation" id="main-content">
      <header className="presentation-header">
        <Link href="/">
          <Logo />
        </Link>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Badge tone="green">LIVE REFERENCE IMPLEMENTATION</Badge>
          <button
            aria-label="Enter fullscreen"
            className="button button-ghost button-small"
            onClick={() => document.documentElement.requestFullscreen?.()}
          >
            <Maximize size={14} />
          </button>
          <Link className="text-link" href="/demo">
            Open app <ArrowUpRight size={13} />
          </Link>
        </div>
      </header>
      <main className="presentation-stage">
        <SectionLabel>
          {String(slide + 1).padStart(2, "0")} / {current.label}
        </SectionLabel>
        <h1>{current.title}</h1>
        <p>{current.text}</p>
        {slide === 0 && (
          <div className="presentation-terminal">
            shielded payment → session_928fa → every request
            <small>
              A private payment can still create an identifiable relationship.
            </small>
          </div>
        )}
        {slide === 1 && (
          <div
            className="vertical-flow"
            style={{ maxWidth: 500, margin: "30px auto" }}
          >
            <div className="flow-block">
              <Wallet />
              <span>
                Invoice<code>invoice_81</code>
              </span>
            </div>
            <ArrowDown />
            <div className="flow-block">
              <UserRound />
              <span>
                Session<code>session_928fa</code>
              </span>
            </div>
            <ArrowDown />
            <div className="flow-block">
              <Search />
              <span>
                Requests 1, 2, 3<code>All linked to the invoice</code>
              </span>
            </div>
          </div>
        )}
        {slide === 2 && (
          <div style={{ marginTop: 35 }}>
            <ArchitectureDiagram />
          </div>
        )}
        <div
          className="presentation-live"
          style={{ display: [3, 5, 6, 7].includes(slide) ? "block" : "none" }}
        >
          <LiveDemo compact />
        </div>
        {slide === 4 && (
          <div style={{ marginTop: 45 }}>
            <CryptoVisualization active />
          </div>
        )}
        {slide === 8 && (
          <div style={{ marginTop: 35 }}>
            <SideChannels />
          </div>
        )}
        {slide === 9 && (
          <>
            <div className="presentation-terminal">
              <small>Workspace client SDK</small>
              {'await client.buy("search-10");'}
              <br />
              {'await client.search("zcash orchard");'}
              <small>
                Accountless · Single-use · Cryptographically blind issuance
              </small>
            </div>
            <Link className="button" href="/docs">
              Developer integration <ArrowUpRight size={16} />
            </Link>
          </>
        )}
      </main>
      <footer className="presentation-controls">
        <div>
          <button
            aria-label="Previous slide"
            disabled={slide === 0}
            onClick={() => setSlide((s) => s - 1)}
          >
            <ArrowLeft size={16} />
          </button>
          <span>{String(slide + 1).padStart(2, "0")} / 10</span>
          <button
            aria-label="Next slide"
            disabled={slide === 9}
            onClick={() => setSlide((s) => s + 1)}
          >
            <ArrowRight size={16} />
          </button>
        </div>
        <div className="presentation-dots">
          {slides.map((s, i) => (
            <button
              key={s.label}
              aria-label={`Go to slide ${i + 1}`}
              className={slide === i ? "active" : ""}
              onClick={() => setSlide(i)}
            />
          ))}
        </div>
        <span>← → to navigate · Real app embedded</span>
      </footer>
    </div>
  );
}
