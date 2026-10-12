"use client";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { Badge, ErrorNotice } from "@blindpass/ui";
import { browserClient } from "../../../lib/vault";
import { PAYMENT_ENVIRONMENT_LABELS } from "@blindpass/shared";
import { useService } from "../../../lib/service";
export default function Help() {
  const { data, error } = useService();
  const { data: health, isError } = useQuery({
    queryKey: ["health"],
    queryFn: () => browserClient().request<{ status: string }>("/api/health"),
    refetchInterval: 30000,
  });
  return (
    <div id="main-content">
      <div className="page-heading">
        <div>
          <h1>A little help, when you need it.</h1>
          <p>Service details, payment support, and wallet recovery.</p>
        </div>
        <Badge tone={isError ? "amber" : "green"}>
          {isError
            ? "SERVICE UNAVAILABLE"
            : health
              ? "SERVICE ONLINE"
              : "CHECKING SERVICE"}
        </Badge>
      </div>
      <ErrorNotice error={error} />
      <div className="recovery-grid">
        <section className="panel">
          <div className="panel-header">
            <h3>Service details</h3>
          </div>
          <div className="panel-body detail-list">
            <div className="detail-row">
              <span>Payment network</span>
              <strong>
                {data
                  ? data.paymentMode === "mock"
                    ? "Simulation · no real payments"
                    : `Zcash ${PAYMENT_ENVIRONMENT_LABELS[data.paymentEnvironment]}`
                  : "Checking…"}
              </strong>
            </div>
            <div className="detail-row">
              <span>Price</span>
              <strong>0.01 ZEC / 10 searches</strong>
            </div>
            <div className="detail-row">
              <span>Resource</span>
              <strong>Technical standards search</strong>
            </div>
            <div className="detail-row">
              <span>New purchases close</span>
              <strong>
                {data ? new Date(data.issuanceEndsAt).toLocaleString() : "—"}
              </strong>
            </div>
            <div className="detail-row">
              <span>Current credits expire</span>
              <strong>
                {data ? new Date(data.creditExpiresAt).toLocaleString() : "—"}
              </strong>
            </div>
            <p className="panel-note">
              Credit expiry is shared by everyone in a monthly batch. It is not
              a full month from the purchase date. A completed search uses one
              credit, including searches with no results.
            </p>
            <span className="eyebrow">ISSUER FINGERPRINT</span>
            <code className="issuer-fingerprint">
              {data?.fingerprint ?? "Loading…"}
            </code>
          </div>
        </section>
        <section className="panel">
          <div className="panel-header">
            <h3>Payment support</h3>
          </div>
          <div className="panel-body recovery-form">
            <p>
              If payment is not reflected yet, reopen the invoice from
              Purchases. Confirmations take time; missed notifications are
              checked automatically against the configured scanner.
            </p>
            <p>
              For an unissued paid invoice or late payment, contact the operator
              for manual review. Refunds are not automatic. Share the invoice ID
              first; keep your backup passphrase, credentials, and invoice
              capability private unless a verified support process specifically
              needs the capability.
            </p>
            {data?.supportUrl &&
            /^(https:\/\/|mailto:)/.test(data.supportUrl) ? (
              <a
                className="button button-secondary"
                href={data.supportUrl}
                target="_blank"
                rel="noreferrer"
              >
                Contact operator <ExternalLink size={15} />
              </a>
            ) : (
              <div className="notice">
                <span>
                  Operator support has not been configured for this development
                  service.
                </span>
              </div>
            )}
            <Link className="text-link" href="/app/purchases">
              Open your purchases <ExternalLink size={14} />
            </Link>
          </div>
        </section>
      </div>
      <section className="panel" style={{ marginTop: 24 }}>
        <div className="panel-header">
          <h3>Common questions</h3>
        </div>
        <div className="panel-body help-questions">
          <details id="payment-networks" open>
            <summary>How do I switch Zcash networks?</summary>
            <p>
              Use the Zcash network selector at the top of the app. Simulation
              uses no real funds. Devnet uses Zcash testnet funds. Mainnet uses
              real ZEC. Networks marked “Not configured” are not offered by this
              service yet.
            </p>
            <p>
              Switching opens that network’s workspace. Your wallet, credits,
              and purchases stay with the original workspace; return there to
              resume an existing payment.
            </p>
          </details>
          <details id="issuer-policy" open>
            <summary>
              Buying credits reports an issuer policy violation.
            </summary>
            <p>
              Read the purchase error for the specific mismatch. The hostname
              and port must match the service configuration: localhost and
              127.0.0.1 are different wallet addresses. Also check your device
              date and time if the credit period differs.
            </p>
            <p>
              If the signing identity or an already trusted monthly
              configuration changed, keep your browser data and export an
              encrypted backup from Wallet &amp; backup. Ask the operator to
              verify the original fingerprint and restore the matching keys and
              configuration. Clearing site data loses local credits and purchase
              recovery information; it does not repair the issuer.
            </p>
          </details>
          <details open>
            <summary>I closed the browser while receiving credits.</summary>
            <p>
              Open Purchases and resume the batch. Encrypted recovery state is
              saved before issuance, so the same batch can be recovered after a
              refresh or connection failure. Keep browser data intact. Recovery
              of an already issued batch is available until its shared credit
              expiry.
            </p>
          </details>
          <details>
            <summary>I lost my browser data or changed devices.</summary>
            <p>
              Restore an encrypted backup from Wallet & backup into an empty
              wallet. Without a backup, lost bearer credits cannot be recovered
              or replaced. A backup made before a purchase cannot restore that
              purchase.
            </p>
          </details>
          <details>
            <summary>A search failed and my balance changed.</summary>
            <p>
              A confirmed API failure before completion returns the credit. If
              the connection disappears after the server might have completed
              the search, the credit is set aside and the outcome stays
              unconfirmed. Retrying the query uses another credit.
            </p>
          </details>
          <details>
            <summary>What does private search protect?</summary>
            <p>
              Blind credentials remove the direct cryptographic payment
              identifier from redemption. The service still receives your query
              and network connection. No accounts, tracking cookies, or
              server-side query history are used. For network protection, use
              the CLI’s verified Tor mode.
            </p>
          </details>
        </div>
      </section>
      <div className="privacy-note">
        <ShieldCheck size={21} />
        <p>
          Search results come from a bundled technical corpus, not a live web
          search engine. Verify the payment network and expiry before paying.{" "}
          <Link href="/demo/privacy" className="text-link">
            Read the privacy model.
          </Link>
        </p>
      </div>
    </div>
  );
}
