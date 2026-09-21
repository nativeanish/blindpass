"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, ArrowUpRight, Check, Globe, ScanLine } from "lucide-react";
import { Badge, ErrorNotice, EmptyState } from "@blindpass/ui";
import type { SearchResponse } from "@blindpass/shared";
import { browserClient } from "../../../lib/vault";
import { SearchForm } from "../../../components/search-form";
export default function SearchPage() {
  const [initial, setInitial] = useState("");
  const [result, setResult] = useState<SearchResponse>();
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const { data: balance } = useQuery({
    queryKey: ["balance"],
    queryFn: () => browserClient().balance(),
  });
  useEffect(() => {
    setInitial(new URLSearchParams(location.search).get("q") ?? "");
  }, []);
  async function search(query: string) {
    setBusy(true);
    setError(undefined);
    try {
      setResult(await browserClient().search(query));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
      await qc.invalidateQueries({ queryKey: ["balance"] });
      await qc.invalidateQueries({ queryKey: ["wallet"] });
    }
  }
  return (
    <div id="main-content">
      <div className="page-heading">
        <div>
          <h1>Curiosity, without the attachment.</h1>
          <p>
            Search privacy, security and internet standards. Each query uses one
            private credit.
          </p>
        </div>
        <Badge tone="green">
          <ScanLine size={11} />
          {balance?.remaining ?? "—"} CREDITS
        </Badge>
      </div>
      <div className="search-page-form">
        <SearchForm
          key={initial}
          initial={initial}
          busy={busy}
          onSearch={search}
        />
      </div>
      <ErrorNotice error={error} />
      {busy && (
        <div role="status">
          <div className="loading-line" />
          <p>Verifying a private credit and searching the local index…</p>
        </div>
      )}
      {result ? (
        <>
          <div className="results-top">
            <span>
              {result.total} results for{" "}
              <span className="accent">“{result.query}”</span>
            </span>
            <Badge tone="green">
              <Check size={11} />
              PRIVATE CREDIT USED · {balance?.remaining ?? "…"} REMAINING
            </Badge>
          </div>
          <div className="search-results">
            {result.results.length ? (
              result.results.map((r) => (
                <a
                  key={r.id}
                  className="search-result"
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <div className="result-title">
                    <span>{r.title}</span>
                    <ArrowUpRight size={17} className="muted" />
                  </div>
                  <div className="result-url">
                    <Globe size={12} />
                    {new URL(r.url).hostname}
                    <span> / </span>
                    {r.id}
                    <Badge>{r.category}</Badge>
                  </div>
                  <p>{r.description}</p>
                </a>
              ))
            ) : (
              <EmptyState
                icon={<Search size={26} />}
                heading="No matches in this corpus."
              >
                Try a broader technical term. The search executed, so one credit
                was consumed.
              </EmptyState>
            )}
          </div>
        </>
      ) : (
        <div className="panel" style={{ marginTop: 30 }}>
          <EmptyState
            icon={<Search size={28} />}
            heading="A quieter way to find answers."
          >
            1,806 indexed technical resources. Your queries are processed to
            return results and are not saved as server-side search history.
          </EmptyState>
          {balance?.remaining === 0 && (
            <div style={{ textAlign: "center", paddingBottom: 30 }}>
              <Link href="/app/buy" className="button button-small">
                Get private credits <ArrowUpRight size={14} />
              </Link>
            </div>
          )}
        </div>
      )}
      <div className="privacy-note">
        <Globe size={19} />
        <p>
          <strong>Your query reaches the service.</strong> BlindPass removes the
          direct cryptographic link to payment. It does not hide your query
          contents or your current network connection. Use the CLI’s verified
          Tor mode for an additional network layer.
        </p>
      </div>
    </div>
  );
}
