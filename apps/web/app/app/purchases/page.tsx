"use client";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Receipt, ArrowRight, Plus } from "lucide-react";
import { Badge, EmptyState, ErrorNotice } from "@blindpass/ui";
import { browserClient } from "../../../lib/vault";
export default function Purchases() {
  const { data, error } = useQuery({
    queryKey: ["wallet"],
    queryFn: () => browserClient().options.store.load(),
  });
  return (
    <div id="main-content">
      <div className="page-heading">
        <div>
          <h1>Pick up where you left off.</h1>
          <p>
            Your purchases are saved in this browser. Resume payment or recover
            a credit batch.
          </p>
        </div>
        <Link href="/app/buy" className="button button-small">
          <Plus size={15} />
          Buy credits
        </Link>
      </div>
      <ErrorNotice error={error} />
      <div className="panel">
        <div className="panel-header">
          <h3>Purchase history</h3>
          <Badge>DEVICE ONLY</Badge>
        </div>
        {data?.invoices.length ? (
          <div className="panel-body">
            {data.invoices.map((invoice) => {
              const pending = !!data.pendingIssuance?.[invoice.id];
              const ready = invoice.status === "CREDITS_READY";
              const expired =
                !ready &&
                !pending &&
                Date.parse(invoice.issuanceDeadline) < Date.now();
              return (
                <article className="purchase-row" key={invoice.id}>
                  <div className="purchase-info">
                    <strong>
                      {invoice.creditCount} private searches{" "}
                      <span className="muted">· {invoice.zecAmount} ZEC</span>
                    </strong>
                    <p>
                      {new Date(invoice.createdAt).toLocaleString()} ·{" "}
                      {invoice.simulated
                        ? "Simulated payment"
                        : "Shielded payment"}
                    </p>
                    <small className="mono muted">
                      {invoice.id.slice(0, 20)}…
                    </small>
                  </div>
                  <Badge tone={ready ? "green" : "amber"}>
                    {ready
                      ? "CREDITS RECEIVED"
                      : pending
                        ? "RECOVERY AVAILABLE"
                        : expired
                          ? "EXPIRED"
                          : invoice.status.replaceAll("_", " ")}
                  </Badge>
                  {!ready && (
                    <Link
                      className="button button-small button-secondary"
                      href={`/app/buy?invoice=${encodeURIComponent(invoice.id)}`}
                    >
                      {pending ? "Recover credits" : "View purchase"}
                      <ArrowRight size={14} />
                    </Link>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<Receipt size={26} />}
            heading="No purchases on this device."
          >
            Your next purchase will appear here. If you changed devices, restore
            your wallet backup first.
          </EmptyState>
        )}
      </div>
      <div className="privacy-note">
        <Receipt size={20} />
        <p>
          Purchase history stays in your encrypted local wallet. It is never
          sent with a search request. Back up your wallet to keep access to
          unpaid and unfinished purchases.
        </p>
      </div>
    </div>
  );
}
