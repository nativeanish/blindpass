"use client";
import { useState } from "react";
import { Activity, RefreshCw, LockKeyhole, LogOut } from "lucide-react";
import { Badge, ErrorNotice } from "@blindpass/ui";
import { Header } from "../../components/shell";
interface Status {
  totals: {
    invoices: number;
    payments: number;
    issued: number;
    redeemed: number;
  };
  invoiceStates: { status: string; count: number }[];
  events: { kind: string; count: number }[];
  epoch: string;
  issuanceEndsAt: string;
  expiresAt: string;
  network: string;
  paymentMode: string;
  ready: boolean;
  provisionedEpochs: string[];
  checkedAt: string;
  reconciliation: {
    lastRunAt: string | null;
    lastSuccessAt: string | null;
    lastErrorAt: string | null;
  } | null;
}
export default function Operator() {
  const [key, setKey] = useState("");
  const [status, setStatus] = useState<Status>();
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  async function refresh() {
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch("/api/ops/status", {
        headers: { Authorization: `Bearer ${key}` },
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new Error(
          response.status === 401
            ? "The operator key is missing or incorrect."
            : "Unable to load service status. Try again shortly.",
        );
      setStatus(await response.json());
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const formatDate = (value?: string | null) =>
    value ? new Date(value).toLocaleString() : "Not observed yet";
  return (
    <>
      <Header />
      <main className="operator-page" id="main-content">
        <div className="page-heading">
          <div>
            <span className="eyebrow">SERVICE OPERATIONS</span>
            <h1>Keep private access running.</h1>
            <p>
              Aggregate service health. No credentials, customer profiles, or
              search queries.
            </p>
          </div>
          <Badge>OPERATOR ONLY</Badge>
        </div>
        <ErrorNotice error={error} />
        {!status ? (
          <section className="panel operator-login">
            <div className="panel-header">
              <h3>
                <LockKeyhole size={18} />
                Authenticate
              </h3>
            </div>
            <form
              className="panel-body recovery-form"
              onSubmit={(e) => {
                e.preventDefault();
                void refresh();
              }}
            >
              <p>
                Use the operator key provisioned with your deployment. It stays
                in memory for this page session and is cleared on reload.
              </p>
              <label htmlFor="operator-key">Operator API key</label>
              <input
                id="operator-key"
                type="password"
                autoComplete="off"
                required
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
              <button className="button" disabled={busy}>
                {busy ? "Connecting…" : "Open operations"}
                <Activity size={16} />
              </button>
            </form>
          </section>
        ) : (
          <>
            <div className="operator-actions">
              <Badge tone={status.ready ? "green" : "amber"}>
                {status.ready ? "API READY" : "EPOCH ROTATION REQUIRED"}
              </Badge>
              <span className="muted">
                Checked {formatDate(status.checkedAt)}
              </span>
              <button
                className="button button-small button-secondary"
                onClick={refresh}
                disabled={busy}
              >
                <RefreshCw size={14} />
                Refresh
              </button>
              <button
                className="button button-small button-secondary"
                onClick={() => {
                  setKey("");
                  setStatus(undefined);
                  setError(undefined);
                }}
              >
                <LogOut size={14} />
                Lock
              </button>
            </div>
            <div className="stats-grid">
              {Object.entries(status.totals).map(([label, count]) => (
                <div className="stat-card" key={label}>
                  <div className="stat-title">
                    {label === "issued"
                      ? "Credits issued"
                      : label === "redeemed"
                        ? "Credits redeemed"
                        : label === "payments"
                          ? "Confirmed payments"
                          : "Invoices created"}
                  </div>
                  <div className="stat-value">{count}</div>
                  <div className="stat-caption">All time · aggregate</div>
                </div>
              ))}
            </div>
            <div className="recovery-grid">
              <section className="panel">
                <div className="panel-header">
                  <h3>Payment operations</h3>
                  <Badge tone="amber">
                    {status.paymentMode} · {status.network}
                  </Badge>
                </div>
                <div className="panel-body detail-list">
                  {status.invoiceStates.map((row) => (
                    <div className="detail-row" key={row.status}>
                      <span>{row.status.replaceAll("_", " ")}</span>
                      <strong>{row.count}</strong>
                    </div>
                  ))}
                  <div className="detail-row">
                    <span>Last reconciliation run</span>
                    <strong>
                      {formatDate(status.reconciliation?.lastRunAt)}
                    </strong>
                  </div>
                  <div className="detail-row">
                    <span>Last successful scanner read</span>
                    <strong>
                      {formatDate(status.reconciliation?.lastSuccessAt)}
                    </strong>
                  </div>
                  <div className="detail-row">
                    <span>Last scanner error</span>
                    <strong>
                      {formatDate(status.reconciliation?.lastErrorAt)}
                    </strong>
                  </div>
                  <p className="panel-note">
                    A successful read is not proof of current chain
                    synchronization. Monitor the scanner itself and verify
                    external payment settlement.
                  </p>
                </div>
              </section>
              <section className="panel">
                <div className="panel-header">
                  <h3>Issuer key lifecycle</h3>
                </div>
                <div className="panel-body detail-list">
                  <div className="detail-row">
                    <span>Active epoch</span>
                    <strong>{status.epoch}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Issuance closes</span>
                    <strong>{formatDate(status.issuanceEndsAt)}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Verification grace ends</span>
                    <strong>{formatDate(status.expiresAt)}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Provisioned epochs</span>
                    <strong>
                      {status.provisionedEpochs.join(", ") ||
                        "Explicit current key only"}
                    </strong>
                  </div>
                  <p className="panel-note">
                    Provision the next monthly key before cutoff. The API
                    switches to provisioned keys automatically. Missing keys
                    stop new purchases; existing valid credits remain
                    redeemable.
                  </p>
                </div>
              </section>
            </div>
            <section className="panel" style={{ marginTop: 24 }}>
              <div className="panel-header">
                <h3>Protocol and scanner events</h3>
              </div>
              <div className="panel-body detail-list">
                {status.events.length ? (
                  status.events.map((event) => (
                    <div className="detail-row" key={event.kind}>
                      <span>{event.kind.replaceAll("_", " ")}</span>
                      <strong>{event.count}</strong>
                    </div>
                  ))
                ) : (
                  <p>No events recorded.</p>
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}
