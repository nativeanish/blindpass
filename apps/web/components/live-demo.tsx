"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import {
  BlindPassClient,
  MemoryStore,
  validateConfiguration,
  authorization,
} from "@blindpass/client";
import {
  b64,
  fingerprint,
  type Invoice,
  type SignedManifest,
} from "@blindpass/shared";
import { spentHash } from "@blindpass/privacy-pass";
import {
  Play,
  Check,
  ArrowUpRight,
  ScanLine,
  Shuffle,
  RotateCcw,
  ShieldCheck,
  FlaskConical,
  Terminal,
} from "lucide-react";
import { Badge, ErrorNotice, SectionLabel } from "@blindpass/ui";
import { CryptoVisualization, SideChannels } from "./privacy-explorer";
type Person = "Alice" | "Bob";
interface Actor {
  client: BlindPassClient;
  invoice?: Invoice;
  issued: boolean;
}
export function LiveDemo({ compact = false }: { compact?: boolean }) {
  const actors = useRef<Partial<Record<Person, Actor>>>({});
  const replayToken = useRef<string | undefined>(undefined);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(
    "Ready to demonstrate real blind issuance.",
  );
  const [error, setError] = useState<unknown>();
  const [redemptions, setRedemptions] = useState<string[]>([]);
  const [attacks, setAttacks] = useState<Record<string, string>>({});
  const [audit, setAudit] = useState<string[]>();
  function actor(name: Person) {
    return (actors.current[name] ??= {
      client: new BlindPassClient({
        baseUrl: "",
        issuer: location.host,
        store: new MemoryStore(),
      }),
      issued: false,
    });
  }
  function update() {
    setVersion((v) => v + 1);
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
    } catch (e) {
      setError(e);
      setStage("Operation paused. See the error above.");
    } finally {
      setBusy(false);
      update();
    }
  }
  async function create(name: Person) {
    setStage(`Creating ${name}’s signed invoice…`);
    actor(name).invoice = await actor(name).client.buy();
    update();
  }
  async function confirm() {
    setStage("SIMULATED PAYMENT EVENT · confirming both purchases");
    for (const name of ["Alice", "Bob"] as const) {
      const a = actor(name);
      if (!a.invoice) throw new Error("Create both invoices first.");
      await a.client.request(`/api/dev/pay/${a.invoice.id}`, {
        method: "POST",
        body: "{}",
      });
      a.invoice = { ...a.invoice, status: "PAYMENT_CONFIRMED" };
    }
    update();
  }
  async function issue() {
    for (const name of ["Alice", "Bob"] as const) {
      const a = actor(name);
      if (!a.invoice) throw new Error("Create both invoices first.");
      await a.client.issue(a.invoice, (s) => setStage(`${name} · ${s}`));
      a.issued = true;
    }
    setStage(
      "20 real private credentials issued. The issuer saw only blinded requests.",
    );
    update();
  }
  async function redeemWithHashes() {
    const tokens = [];
    for (const name of ["Alice", "Bob"] as const) {
      const a = actor(name);
      const state = await a.client.options.store.load();
      const token = state.credentials.shift();
      if (!token) throw new Error("Issue both batches first.");
      await a.client.options.store.save(state);
      tokens.push(token);
    }
    if (crypto.getRandomValues(new Uint8Array(1))[0] % 2) tokens.reverse();
    setStage("Redeeming shuffled credentials with the protected search API…");
    for (const token of tokens) {
      await actor("Alice").client.request("/api/search?q=privacy", {
        headers: { Authorization: authorization(token) },
      });
      replayToken.current = token.token;
      const hash = await spentHash(token.token);
      setRedemptions((prev) => [...prev, `${hash.slice(0, 16)}…`]);
    }
    setStage(
      "Two credentials verified and spent. No invoice identifier was presented.",
    );
  }
  async function expectRejection(
    name: string,
    work: () => Promise<unknown>,
    expected: string,
  ) {
    try {
      await work();
      throw new Error("Attack unexpectedly succeeded.");
    } catch (e) {
      if ((e as { code?: string }).code !== expected) throw e;
      setAttacks((a) => ({ ...a, [name]: expected }));
      setStage(
        `${expected} · enforcement verified against the running application.`,
      );
    }
  }
  async function replay() {
    if (!replayToken.current) throw new Error("Redeem a credential first.");
    await expectRejection(
      "Replay",
      () =>
        actor("Alice").client.request("/api/search?q=privacy", {
          headers: { Authorization: authorization(replayToken.current!) },
        }),
      "TOKEN_ALREADY_SPENT",
    );
  }
  async function forge() {
    const fake = crypto.getRandomValues(new Uint8Array(146));
    fake[0] = 0;
    fake[1] = 1;
    await expectRejection(
      "Forgery",
      () =>
        actor("Alice").client.request("/api/search?q=privacy", {
          headers: { Authorization: `PrivateToken token="${b64(fake)}"` },
        }),
      "INVALID_TOKEN",
    );
  }
  async function malicious() {
    const trusted = await actor("Alice").client.configuration();
    const pin = await fingerprint(trusted.signingPublicKey);
    for (const kind of ["key", "expiry", "class", "key-id"]) {
      const changed = await actor("Alice").client.request<SignedManifest>(
        `/api/dev/malicious-config/${kind}`,
      );
      await expectRejection(
        `Issuer ${kind}`,
        () =>
          validateConfiguration(changed, {
            issuer: trusted.manifest.issuer,
            fingerprint: pin,
            previous: trusted,
          }),
        "ISSUER_POLICY_VIOLATION",
      );
    }
  }
  async function all() {
    await create("Alice");
    await create("Bob");
    await confirm();
    await issue();
    await redeemWithHashes();
    await replay();
    await forge();
    await malicious();
    setStage(
      "Demo complete. Real credentials verified. Replay, forgery and malicious configuration rejected.",
    );
  }
  const alice = actors.current.Alice,
    bob = actors.current.Bob;
  const purchased = !!alice?.invoice && !!bob?.invoice;
  const issued = !!alice?.issued && !!bob?.issued;
  return (
    <div id="main-content" data-version={version}>
      {!compact && (
        <div className="page-heading">
          <div>
            <SectionLabel>LIVE PROTOCOL LAB</SectionLabel>
            <h1>Don’t take our word for it.</h1>
            <p>
              Two clients. Real blinded credentials. A merchant with no
              cryptographic join.
            </p>
          </div>
          <Link
            href="/presentation"
            className="button button-secondary button-small"
          >
            Presentation <ArrowUpRight size={14} />
          </Link>
        </div>
      )}
      <div className="demo-toolbar">
        <div>
          <Badge tone="amber">
            <FlaskConical size={11} />
            PAYMENT SIMULATED
          </Badge>
          <Badge tone="green">CRYPTOGRAPHY REAL</Badge>
        </div>
        <button
          className="button button-small"
          disabled={busy || issued}
          onClick={() => run(all)}
        >
          <Play size={14} />
          {busy ? "Running protocol…" : "Run complete demo"}
        </button>
      </div>
      <ErrorNotice error={error} />
      <div className="demo-clients">
        {(["Alice", "Bob"] as const).map((name, i) => {
          const a = actors.current[name];
          return (
            <div className="panel" key={name}>
              <div className="panel-header">
                <h3 className="client-name">
                  <span className={`client-avatar client-${i}`}>{name[0]}</span>
                  {name}
                  <span className="muted">/ Client {i + 1}</span>
                </h3>
                <Badge tone={a?.issued ? "green" : "neutral"}>
                  {a?.issued
                    ? "10 CREDITS ISSUED"
                    : a?.invoice
                      ? "INVOICE CREATED"
                      : "READY"}
                </Badge>
              </div>
              <div className="panel-body">
                <div className="client-offer">
                  <span>10 private searches</span>
                  <span>
                    0.01 <small>ZEC</small>
                  </span>
                </div>
                <p className="mono invoice-short">
                  {a?.invoice
                    ? `invoice_${name[0]} · ${a.invoice.id.slice(4, 17)}…`
                    : "No purchase yet"}
                </p>
                <div className="demo-shared">
                  <span>
                    <Check size={12} />
                    search-v1
                  </span>
                  <span>
                    <Check size={12} />
                    Common epoch
                  </span>
                  <span>
                    <Check size={12} />
                    Same key & expiry
                  </span>
                </div>
                <button
                  className="button button-secondary button-block button-small"
                  disabled={busy || !!a?.invoice}
                  onClick={() => run(() => create(name))}
                >
                  1. Create {name} purchase <ArrowUpRight size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="demo-controls">
        <button
          className="button button-secondary button-small"
          disabled={busy || !purchased || issued}
          onClick={() => run(confirm)}
        >
          2. Confirm both payments
        </button>
        <button
          className="button button-secondary button-small"
          disabled={
            busy || alice?.invoice?.status !== "PAYMENT_CONFIRMED" || issued
          }
          onClick={() => run(issue)}
        >
          3. Issue blind credentials
        </button>
        <button
          className="button button-secondary button-small"
          disabled={busy || !issued || redemptions.length > 0}
          onClick={() => run(redeemWithHashes)}
        >
          <Shuffle size={14} />
          4. Redeem shuffled credits
        </button>
      </div>
      <div className="demo-status" role="status">
        <span className="status-dot" />
        <span>{stage}</span>
        {busy && <div className="loading-line" />}
      </div>
      <CryptoVisualization active={busy} />
      <div className="demo-transcripts">
        <div className="panel">
          <div className="panel-header">
            <h3>Issuance transcript</h3>
            <Badge>MERCHANT VIEW</Badge>
          </div>
          <div className="terminal-output">
            <span className="terminal-comment">
              // Authorized batches. Blinded requests only.
            </span>
            {(["Alice", "Bob"] as const).map((name) => (
              <div key={name}>
                {actors.current[name]?.issued ? (
                  <>
                    <span className="accent">invoice_{name[0]}</span>
                    <span> → 10 blinded requests</span>
                  </>
                ) : (
                  <span className="muted">
                    invoice_{name[0]} → awaiting issuance
                  </span>
                )}
              </div>
            ))}
            <span className="terminal-comment">
              // Final credentials are never received here.
            </span>
          </div>
        </div>
        <div className="transcript-gap">
          <Link2OffIcon />
        </div>
        <div className="panel">
          <div className="panel-header">
            <h3>Redemption transcript</h3>
            <Badge tone="green">NO INVOICE FIELD</Badge>
          </div>
          <div className="terminal-output">
            <span className="terminal-comment">
              // Domain-separated token hashes only.
            </span>
            {redemptions.length ? (
              redemptions.map((hash, i) => (
                <div key={i}>
                  <span className="accent">token_hash_{i ? "Y" : "X"}</span> →{" "}
                  <span>{hash}</span>
                </div>
              ))
            ) : (
              <div className="muted">Waiting for shuffled redemptions…</div>
            )}
            <span className="terminal-comment">
              // Which invoice? No cryptographic matching signal.
            </span>
          </div>
        </div>
      </div>
      {redemptions.length > 0 && (
        <div className="demo-matrix">
          <div>
            <h3>Transcript-only unlinkability demonstration</h3>
            <p>
              Identical shared configurations, two buyers, equal-prior
              illustration. These values do not measure real-world anonymity.
            </p>
          </div>
          <table className="probability-table">
            <thead>
              <tr>
                <th />
                <th>Invoice A</th>
                <th>Invoice B</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>Token X</th>
                <td>50%</td>
                <td>50%</td>
              </tr>
              <tr>
                <th>Token Y</th>
                <td>50%</td>
                <td>50%</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <div className="section-heading-small">
        <SectionLabel>TRY TO BREAK IT</SectionLabel>
        <h2>Valid once. Verifiable always.</h2>
      </div>
      <div className="attack-grid">
        {[
          {
            title: "Replay a spent credential",
            subtitle: "Submit the exact same token again.",
            fn: replay,
            key: "Replay",
            icon: RotateCcw,
            disabled: !redemptions.length,
          },
          {
            title: "Forge a credential",
            subtitle: "Submit random token material.",
            fn: forge,
            key: "Forgery",
            icon: ScanLine,
            disabled: false,
          },
          {
            title: "Malicious issuer configuration",
            subtitle: "Try unique keys, expiry, class and key ID.",
            fn: malicious,
            key: "Issuer key-id",
            icon: ShieldCheck,
            disabled: false,
          },
        ].map((attack, i) => (
          <div className="panel" key={attack.key}>
            <div className="panel-body">
              <attack.icon size={21} className="accent" />
              <h3>{attack.title}</h3>
              <p>{attack.subtitle}</p>
              <button
                className="button button-secondary button-small button-block"
                disabled={busy || attack.disabled}
                onClick={() => run(attack.fn)}
              >
                {i + 5}. Run attack <ArrowUpRight size={13} />
              </button>
              {attacks[attack.key] && (
                <div className="attack-result">
                  <Check size={12} />
                  {attacks[attack.key]}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="section-heading-small">
        <SectionLabel>THE HONEST LIMITATION</SectionLabel>
        <h2>What if the network gives you away?</h2>
      </div>
      <SideChannels />
      <div className="panel" style={{ marginTop: 24 }}>
        <div className="panel-header">
          <h3>Privacy audit</h3>
          <button
            className="button button-secondary button-small"
            disabled={busy}
            onClick={() =>
              run(async () => {
                const result = await actor("Alice").client.privacyAudit();
                setAudit(result.checks);
              })
            }
          >
            <Terminal size={13} />
            Run privacy audit
          </button>
        </div>
        <div className="panel-body">
          {audit ? (
            <>
              <div className="audit-checks">
                {audit.map((c) => (
                  <span key={c}>
                    <Check size={14} />
                    {c}
                  </span>
                ))}
              </div>
              <div className="notice">
                <strong>DIRECT NETWORK CONNECTION</strong>
                <span>
                  Mock payment: Orchard receiver validation is not applicable.
                  No arbitrary privacy score is assigned.
                </span>
              </div>
            </>
          ) : (
            <p style={{ fontSize: 12 }}>
              Inspect shared configuration, credential design and transport
              assumptions.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
function Link2OffIcon() {
  return (
    <>
      <span />
      <ScanLine size={23} />
      <small>NO JOIN</small>
      <span />
    </>
  );
}
