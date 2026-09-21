"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Plus,
  ArrowUpRight,
  ScanLine,
  ArrowDownLeft,
  Check,
  ShieldCheck,
  Activity,
  Globe,
  Search,
} from "lucide-react";
import { Badge, ErrorNotice, EmptyState } from "@blindpass/ui";
import { browserClient } from "../../lib/vault";
import { SearchForm } from "../../components/search-form";
export default function Dashboard() {
  const { data: state, error } = useQuery({
    queryKey: ["wallet"],
    queryFn: () => browserClient().options.store.load(),
  });
  const { data: directory } = useQuery({
    queryKey: ["configuration"],
    queryFn: () => browserClient().configuration(),
  });
  const balance =
    state?.credentials.filter((c) => Date.parse(c.expiresAt) > Date.now())
      .length ?? 0;
  const manifest = directory?.manifest;
  return (
    <div id="main-content">
      <div className="page-heading">
        <div>
          <h1>Your private workspace.</h1>
          <p>
            Your credits stay on this device. Your identity stays out of the
            picture.
          </p>
        </div>
        <Link href="/app/buy" className="button button-small">
          <Plus size={15} />
          Buy credits
        </Link>
      </div>
      <ErrorNotice error={error} />
      <div className="stats-grid">
        <div className="stat-card primary">
          <div className="stat-title">
            <span>Available private credits</span>
            <ScanLine size={17} />
          </div>
          <div className="stat-value">
            {balance}
            <span
              style={{
                fontSize: 13,
                letterSpacing: 0,
                marginLeft: 10,
                color: "#9eb28f",
              }}
            >
              searches
            </span>
          </div>
          <div className="stat-caption">
            <span className="status-dot" /> Stored locally · Cryptographically
            unlinkable
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-title">
            Credits used <ArrowUpRight size={17} />
          </div>
          <div className="stat-value">{state?.used ?? 0}</div>
          <div className="stat-caption">One credit, one successful search</div>
        </div>
        <div className="stat-card">
          <div className="stat-title">
            Credits received <ArrowDownLeft size={17} />
          </div>
          <div className="stat-value">
            {(state?.credentials.length ?? 0) + (state?.used ?? 0)}
          </div>
          <div className="stat-caption">Issued in common batches of 10</div>
        </div>
      </div>
      <div className="grid-two">
        <div>
          <div className="panel">
            <div className="panel-header">
              <h3>What would you like to find?</h3>
              <Badge tone="green">1 CREDIT / SEARCH</Badge>
            </div>
            <div className="panel-body">
              <SearchForm />
              <p style={{ fontSize: 10 }}>
                Search 1,806 privacy, security and internet standards resources.
                <br />
                No account. No server-side search history.
              </p>
            </div>
          </div>
          <div className="privacy-note">
            <ShieldCheck size={20} />
            <p>
              <strong>A credit proves you have access.</strong>
              <br />
              It does not tell the service which payment bought it. IP
              addresses, request timing and query contents remain a separate
              privacy concern.{" "}
              <Link href="/demo/privacy" className="accent">
                Understand the difference ↗
              </Link>
            </p>
          </div>
          <div className="panel">
            <div className="panel-header">
              <h3>Recent activity</h3>
              <Badge>ON THIS DEVICE ONLY</Badge>
            </div>
            <div className="panel-body">
              {state?.activity.length ? (
                state.activity.slice(0, 5).map((event, i) => (
                  <div className="activity-row" key={`${event.at}-${i}`}>
                    <span className="activity-icon">
                      <Check size={13} />
                    </span>
                    <span>{event.kind}</span>
                    <time>
                      {new Date(event.at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                ))
              ) : (
                <EmptyState
                  icon={<Activity size={24} />}
                  heading="A clean slate."
                >
                  Your local activity will appear here after you purchase or
                  redeem a credit.
                </EmptyState>
              )}
            </div>
          </div>
        </div>
        <div>
          <div className="panel">
            <div className="panel-header">
              <h3>Privacy at a glance</h3>
              <span className="status-dot" />
            </div>
            <div className="panel-body">
              <div className="detail-list">
                <div className="detail-row">
                  <span>Credential protocol</span>
                  <span className="mono" style={{ fontSize: 10 }}>
                    RFC 9578 · VOPRF
                  </span>
                </div>
                <div className="detail-row">
                  <span>Token class</span>
                  <Badge>{manifest?.tokenClass ?? "search-v1"}</Badge>
                </div>
                <div className="detail-row">
                  <span>Common epoch</span>
                  <span className="mono">{manifest?.epoch ?? "Loading…"}</span>
                </div>
                <div className="detail-row">
                  <span>Credits expire</span>
                  <span>
                    {manifest
                      ? new Date(manifest.expiresAt).toLocaleDateString(
                          undefined,
                          { day: "numeric", month: "short", year: "numeric" },
                        )
                      : "—"}
                  </span>
                </div>
                <div className="detail-row">
                  <span>Account identifier</span>
                  <span className="accent">None</span>
                </div>
                <div className="detail-row">
                  <span>Network transport</span>
                  <Badge tone="amber">
                    <Globe size={10} />
                    DIRECT
                  </Badge>
                </div>
              </div>
              <div className="panel-note">
                Encrypted on this device using a non-extractable browser key.
                Clearing site data deletes your credits. Device compromise or
                same-origin scripts can access the vault.
              </div>
              <Link
                href="/demo/privacy"
                className="text-link"
                style={{ marginTop: 18 }}
              >
                Explore your privacy layers <ArrowUpRight size={13} />
              </Link>
            </div>
          </div>
          <div className="panel" style={{ marginTop: 20 }}>
            <div className="panel-body">
              <Search size={20} className="accent" />
              <h3 style={{ fontSize: 15, margin: "15px 0 10px" }}>
                A little less attached.
              </h3>
              <p style={{ fontSize: 11, lineHeight: 1.8 }}>
                Get 10 private searches for 0.01 ZEC. A small pack of access. No
                ongoing relationship required.
              </p>
              <Link
                href="/app/buy"
                className="text-link"
                style={{ marginTop: 19 }}
              >
                Get your first credits <ArrowRightIcon />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
function ArrowRightIcon() {
  return <ArrowUpRight size={14} />;
}
