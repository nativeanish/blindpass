"use client";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowUpRight,
  Wallet,
  ScanLine,
  Link2Off,
  RefreshCw,
  Database,
  ShieldCheck,
} from "lucide-react";
import { AppShell } from "../../components/shell";
import { Badge, ErrorNotice, SectionLabel } from "@blindpass/ui";
import { browserClient } from "../../lib/vault";
interface Stats {
  invoices: number;
  payments: number;
  issued: number;
  redeemed: number;
  epoch: string;
  keyId: string;
  fingerprint: string;
  events: { kind: string; count: number }[];
  paymentsDataset: {
    id: string;
    status: string;
    credit_count: number;
    issuer_epoch: string;
  }[];
  redemptionsDataset: {
    token_hash: string;
    issuer_epoch: string;
    status: string;
  }[];
}
export default function Admin() {
  const { data, error, refetch } = useQuery({
    queryKey: ["admin"],
    queryFn: () => browserClient().request<Stats>("/api/admin/stats"),
    refetchInterval: 5000,
  });
  return (
    <AppShell>
      <div id="main-content">
        <div className="page-heading">
          <div>
            <SectionLabel>DEVELOPMENT / MERCHANT VIEW</SectionLabel>
            <h1>What the merchant can see.</h1>
            <p>
              Two useful datasets. Deliberately no cryptographic join between
              them.
            </p>
          </div>
          <button
            className="button button-secondary button-small"
            onClick={() => refetch()}
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>
        <ErrorNotice error={error} />
        {data && (
          <>
            <div className="admin-stats">
              {[
                {
                  label: "Invoices created",
                  value: data.invoices,
                  icon: Wallet,
                },
                {
                  label: "Payments confirmed",
                  value: data.payments,
                  icon: Activity,
                },
                { label: "Credits issued", value: data.issued, icon: ScanLine },
                {
                  label: "Credits redeemed",
                  value: data.redeemed,
                  icon: ArrowUpRight,
                },
              ].map((s) => (
                <div className="stat-card" key={s.label}>
                  <div className="stat-title">
                    {s.label}
                    <s.icon size={16} />
                  </div>
                  <div className="stat-value">{s.value}</div>
                </div>
              ))}
            </div>
            <div className="merchant-datasets">
              <div className="panel">
                <div className="panel-header">
                  <h3>
                    <Database
                      size={14}
                      style={{ display: "inline", marginRight: 8 }}
                    />
                    Payments dataset
                  </h3>
                  <Badge>INVOICES</Badge>
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Invoice ID</th>
                      <th>Status</th>
                      <th>Credits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.paymentsDataset.map((p) => (
                      <tr key={p.id}>
                        <td>{p.id.slice(0, 15)}…</td>
                        <td>{p.status.replaceAll("_", " ")}</td>
                        <td>{p.credit_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.paymentsDataset.length && (
                  <p className="panel-body">No purchases yet.</p>
                )}
              </div>
              <div className="no-join">
                <Link2Off size={27} />
                <span>NO JOIN</span>
              </div>
              <div className="panel">
                <div className="panel-header">
                  <h3>
                    <ScanLine
                      size={14}
                      style={{ display: "inline", marginRight: 8 }}
                    />
                    Redemptions dataset
                  </h3>
                  <Badge tone="green">TOKEN HASHES</Badge>
                </div>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Token hash</th>
                      <th>Epoch</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.redemptionsDataset.map((t) => (
                      <tr key={t.token_hash}>
                        <td>{t.token_hash}…</td>
                        <td>{t.issuer_epoch}</td>
                        <td>{t.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data.redemptionsDataset.length && (
                  <p className="panel-body">No credentials redeemed yet.</p>
                )}
              </div>
            </div>
            <div className="grid-two">
              <div className="panel">
                <div className="panel-header">
                  <h3>Common issuer configuration</h3>
                  <Badge tone="green">SHARED KEY ACTIVE</Badge>
                </div>
                <div className="panel-body">
                  <div className="detail-list">
                    <div className="detail-row">
                      <span>Issuer epoch</span>
                      <span className="mono">{data.epoch}</span>
                    </div>
                    <div className="detail-row">
                      <span>Key ID</span>
                      <span className="mono" style={{ fontSize: 10 }}>
                        {data.keyId.slice(0, 22)}…
                      </span>
                    </div>
                    <div className="detail-row">
                      <span>Token type</span>
                      <span>RFC 9578 · 0x0001</span>
                    </div>
                    <div className="detail-row">
                      <span>Identity fingerprint</span>
                      <span
                        className="mono"
                        style={{ fontSize: 9, overflowWrap: "anywhere" }}
                      >
                        {data.fingerprint}
                      </span>
                    </div>
                  </div>
                  <p className="panel-note">
                    A single key per epoch, a common class and a common expiry.
                    Never an invoice-specific key or credential label.
                  </p>
                </div>
              </div>
              <div className="panel">
                <div className="panel-header">
                  <h3>Aggregate security events</h3>
                  <ShieldCheck size={17} className="accent" />
                </div>
                <div className="panel-body">
                  <div className="detail-list">
                    <div className="detail-row">
                      <span>Replay attempts</span>
                      <span>
                        {data.events.find(
                          (e) => e.kind === "TOKEN_ALREADY_SPENT",
                        )?.count ?? 0}
                      </span>
                    </div>
                    <div className="detail-row">
                      <span>Invalid credentials</span>
                      <span>
                        {data.events.find((e) => e.kind === "INVALID_TOKEN")
                          ?.count ?? 0}
                      </span>
                    </div>
                    <div className="detail-row">
                      <span>Post-issuance reorgs</span>
                      <span>
                        {data.events.find(
                          (e) => e.kind === "post_issuance_reorg",
                        )?.count ?? 0}
                      </span>
                    </div>
                  </div>
                  <p className="panel-note">
                    No IP logs, persistent client identifiers or token-linked
                    query history. Timestamps and operational metadata still
                    require careful retention policies.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}
        <div className="privacy-note">
          <Link2Off size={20} />
          <p>
            <strong>
              Absence of a database join is only one part of the guarantee.
            </strong>
            <br />
            The blind protocol prevents direct transcript matching. Metadata can
            still correlate users. This admin surface and all debug endpoints
            are disabled in production.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
