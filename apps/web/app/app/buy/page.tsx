"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { QRCodeSVG } from "qrcode.react";
import {
  ScanLine,
  Check,
  Copy,
  ArrowUpRight,
  ArrowRight,
  Wallet,
  ShieldCheck,
  FlaskConical,
} from "lucide-react";
import { Badge, ErrorNotice } from "@blindpass/ui";
import { PAYMENT_ENVIRONMENT_LABELS, type Invoice } from "@blindpass/shared";
import { browserClient } from "../../../lib/vault";
import { useService } from "../../../lib/service";
const steps = [
  "Waiting for payment",
  "Payment detected",
  "Waiting for confirmation",
  "Payment confirmed",
  "Issuing private credits",
  "10 private credits ready",
];
const statusSteps: Record<string, number> = {
  WAITING_FOR_PAYMENT: 0,
  PAYMENT_DETECTED: 1,
  WAITING_FOR_CONFIRMATION: 2,
  PAYMENT_CONFIRMED: 3,
  ISSUING_PRIVATE_CREDITS: 4,
  CREDITS_READY: 5,
};
export default function Buy() {
  const [invoice, setInvoice] = useState<Invoice>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [stage, setStage] = useState("");
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState(false);
  const qc = useQueryClient();
  const { data: latest, error: invoiceError } = useQuery({
    queryKey: ["invoice", invoice?.id],
    enabled: !!invoice && !ready,
    queryFn: () => browserClient().invoice(invoice!.capability!),
    refetchInterval: (query) =>
      ["EXPIRED", "CREDITS_READY"].includes(query.state.data?.status ?? "")
        ? false
        : 3000,
  });
  const { data: service } = useService();
  useEffect(() => {
    const id = new URLSearchParams(location.search).get("invoice");
    if (id)
      void browserClient()
        .options.store.load()
        .then((state) => {
          const saved = state.invoices.find((i) => i.id === id);
          if (saved) {
            setInvoice(saved);
            setReady(saved.status === "CREDITS_READY");
          } else
            setError(
              new Error(
                "This purchase is not in this wallet. Restore its backup first.",
              ),
            );
        })
        .catch(setError);
  }, []);
  const state = ready
    ? "CREDITS_READY"
    : busy && stage
      ? "ISSUING_PRIVATE_CREDITS"
      : latest?.status === "CREDITS_READY" ||
          invoice?.status === "ISSUING_PRIVATE_CREDITS"
        ? "PAYMENT_CONFIRMED"
        : (latest?.status ?? invoice?.status);
  const step = statusSteps[state ?? ""] ?? 0;
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    try {
      await work();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
      setStage("");
    }
  }
  async function simulate() {
    for (const confirmations of [0, 1, 3]) {
      await browserClient().request(`/api/dev/pay/${invoice!.id}`, {
        method: "POST",
        body: JSON.stringify({ confirmations }),
      });
      await qc.invalidateQueries({ queryKey: ["invoice"] });
      await new Promise((r) => setTimeout(r, 550));
    }
  }
  return (
    <div id="main-content">
      <div className="page-heading">
        <div>
          <h1>
            {ready
              ? "Your credits are ready."
              : invoice
                ? "A private purchase."
                : "A little access. No strings."}
          </h1>
          <p>
            {ready
              ? "Verified and unblinded on your device. Ready when you are."
              : "Fixed-price credits. Shielded payments. No subscription or account."}
          </p>
        </div>
        <Badge tone="green">PRIVATE SEARCH</Badge>
      </div>
      <ErrorNotice error={error ?? invoiceError} />
      {(error as { code?: string } | undefined)?.code ===
        "ISSUER_POLICY_VIOLATION" && (
        <p className="panel-note">
          Your wallet has been kept.{" "}
          <Link className="text-link" href="/app/help#issuer-policy">
            Get help with issuer verification.
          </Link>
        </p>
      )}
      {invoice && !ready && (
        <button
          className="text-link"
          style={{ marginBottom: 20 }}
          onClick={() => {
            setInvoice(undefined);
            setError(undefined);
            setStage("");
          }}
        >
          ← Back to credit packs
        </button>
      )}
      {!invoice ? (
        <>
          <div className="offer-grid">
            <div className="offer-card">
              <div className="offer-top">
                <ScanLine size={24} />
                <Badge tone="green">AVAILABLE</Badge>
              </div>
              <h2>10 private searches</h2>
              <p>A fresh batch of unlinkable, single-use credits.</p>
              <div className="offer-price">
                0.01 <span>ZEC / batch</span>
              </div>
              <p>One credit per search. No recurring charge.</p>
              <div className="offer-features">
                <span>
                  <Check />
                  Cryptographically blind issuance
                </span>
                <span>
                  <Check />
                  Shared monthly epoch & expiration
                </span>
                <span>
                  <Check />
                  Encrypted, device-local storage
                </span>
              </div>
              <button
                className="button button-block"
                disabled={busy}
                onClick={() =>
                  action(async () => {
                    setInvoice(await browserClient().buy("search-10"));
                    await qc.invalidateQueries({ queryKey: ["wallet"] });
                  })
                }
              >
                {busy ? "Creating signed invoice…" : "Get 10 private credits"}
                <ArrowRight size={16} />
              </button>
            </div>
            <div className="offer-card purchase-guide">
              <ShieldCheck size={26} className="accent" />
              <h2>Know what you’re buying.</h2>
              <p>
                Search a curated library of internet standards, privacy, and
                security resources. One completed query uses one credit.
              </p>
              <div className="detail-list">
                <div className="detail-row">
                  <span>Payment network</span>
                  <strong>
                    {service?.paymentMode === "mock"
                      ? "Simulation · no real funds"
                      : service
                        ? `Zcash ${PAYMENT_ENVIRONMENT_LABELS[service.paymentEnvironment]}`
                        : "Checking…"}
                  </strong>
                </div>
                <div className="detail-row">
                  <span>Current batch expires</span>
                  <strong>
                    {service
                      ? new Date(service.creditExpiresAt).toLocaleString()
                      : "Checking…"}
                  </strong>
                </div>
                <div className="detail-row">
                  <span>Renewal</span>
                  <strong>No automatic charges</strong>
                </div>
              </div>
              <p>
                All credits in a monthly epoch expire together. This is not a
                full month from purchase. Save a wallet backup after receiving
                credits.
              </p>
              <Link href="/app/help" className="text-link">
                Payment and recovery help <ArrowUpRight size={14} />
              </Link>
            </div>
          </div>
          <div className="privacy-note" style={{ maxWidth: 740 }}>
            <ShieldCheck size={20} />
            <p>
              <strong>
                The merchant sees a payment, not your future requests.
              </strong>
              <br />
              Identical batches share the same key, token class and expiry.
              Network and timing information can still create links.
            </p>
          </div>
          <PendingInvoices onResume={setInvoice} />
        </>
      ) : (
        <div className="purchase-layout">
          <div className="panel">
            <div className="panel-header">
              <h3>{ready ? "Private credits received" : "Payment details"}</h3>
              <Badge tone={ready ? "green" : "amber"}>
                {ready
                  ? "PROOF VERIFIED"
                  : invoice.simulated
                    ? "SIMULATED PAYMENT"
                    : "ZCASH PAYMENT"}
              </Badge>
            </div>
            <div className="panel-body">
              {ready ? (
                <>
                  <div className="preview-balance">
                    <strong className="accent">10</strong>
                    <div>
                      private credits<small>Ready for single-use access</small>
                    </div>
                  </div>
                  <div className="credit-grid">
                    {Array.from({ length: 10 }, (_, i) => (
                      <div className="credit-dot" key={i}>
                        <Check size={15} />
                      </div>
                    ))}
                  </div>
                  <div className="notice success">
                    <strong>10 PRIVATE CREDITS READY</strong>
                    <span>
                      The issuer never received these final credential values.
                    </span>
                  </div>
                  <Link href="/app/search" className="button button-block">
                    Make your first private search <ArrowRight size={16} />
                  </Link>
                  <Link
                    href="/app/wallet"
                    className="text-link"
                    style={{ marginTop: 16 }}
                  >
                    Back up these credits <ShieldCheck size={15} />
                  </Link>
                  <p className="panel-note">
                    Immediate redemption can reveal a timing relationship. For
                    stronger separation, redeem later using a separately
                    configured network privacy layer.
                  </p>
                </>
              ) : (
                <>
                  <div className="qr-layout">
                    <div className="qr-box">
                      <QRCodeSVG
                        value={invoice.paymentUri}
                        size={154}
                        fgColor="#14200e"
                        bgColor="#f0f1e9"
                      />
                    </div>
                    <div>
                      <span className="eyebrow">AMOUNT DUE</span>
                      <div className="invoice-amount">
                        0.01 <small>ZEC</small>
                      </div>
                      <p style={{ fontSize: 11, margin: "7px 0" }}>
                        10 private search credits
                      </p>
                      <Badge>{invoice.issuerEpoch} EPOCH</Badge>
                    </div>
                  </div>
                  {invoice.simulated && (
                    <div className="notice">
                      <strong className="accent">
                        SIMULATED PAYMENT EVENT
                      </strong>
                      <span>
                        This is a non-payable sample URI. Do not send ZEC. Use
                        the local confirmation button below.
                      </span>
                    </div>
                  )}
                  <span className="eyebrow">
                    {invoice.simulated
                      ? "SAMPLE PAYMENT URI · NOT PAYABLE"
                      : "ZIP-321 PAYMENT URI"}
                  </span>
                  <div className="invoice-address mono">
                    {invoice.paymentUri}
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      className="button button-secondary button-small"
                      disabled={state === "EXPIRED"}
                      onClick={() =>
                        action(async () => {
                          await navigator.clipboard.writeText(
                            invoice.paymentUri,
                          );
                          setCopied(true);
                        })
                      }
                    >
                      <Copy size={14} />
                      {copied ? "Copied" : "Copy payment URI"}
                    </button>
                    {!invoice.simulated && state !== "EXPIRED" && (
                      <a
                        href={invoice.paymentUri}
                        className="button button-secondary button-small"
                      >
                        Open in wallet <ArrowUpRight size={14} />
                      </a>
                    )}
                  </div>
                  <div className="spacer" />
                  <div className="detail-list">
                    <div className="detail-row">
                      <span>Invoice</span>
                      <span className="mono" style={{ fontSize: 9 }}>
                        {invoice.id.slice(0, 20)}…
                      </span>
                    </div>
                    <div className="detail-row">
                      <span>Payment deadline</span>
                      <span>
                        {new Date(invoice.expiresAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="detail-row">
                      <span>Memo</span>
                      <span>Empty by default</span>
                    </div>
                    <div className="detail-row">
                      <span>Receiver</span>
                      <span>
                        {invoice.simulated
                          ? "Simulated · not an address"
                          : "Scanner-validated Orchard UA"}
                      </span>
                    </div>
                  </div>
                  {invoice.simulated && step < 3 && (
                    <button
                      className="button button-block"
                      style={{ marginTop: 24 }}
                      disabled={busy || state === "EXPIRED"}
                      onClick={() => action(simulate)}
                    >
                      <FlaskConical size={16} />
                      {busy
                        ? "Simulating confirmation…"
                        : "Simulate payment confirmation"}
                    </button>
                  )}
                  {step === 3 && (
                    <button
                      className="button button-block"
                      style={{ marginTop: 24 }}
                      disabled={busy}
                      onClick={() =>
                        action(async () => {
                          await browserClient().issue(invoice, setStage);
                          setReady(true);
                          await qc.invalidateQueries({ queryKey: ["wallet"] });
                          await qc.invalidateQueries({ queryKey: ["balance"] });
                        })
                      }
                    >
                      {latest?.status === "CREDITS_READY"
                        ? "Recover private credits"
                        : "Receive private credits"}{" "}
                      <ScanLine size={16} />
                    </button>
                  )}
                  {state === "EXPIRED" && (
                    <div className="notice error">
                      INVOICE_EXPIRED — create a new invoice.
                    </div>
                  )}
                  {state === "PAYMENT_REORGED" && (
                    <div className="notice error">
                      PAYMENT_REORGED — payment authorization was withdrawn.
                    </div>
                  )}
                  {busy && stage && (
                    <div role="status">
                      <div className="loading-line" />
                      <p style={{ fontSize: 11 }}>{stage}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          <div>
            <div className="panel">
              <div className="panel-header">
                <h3>From payment to private access</h3>
                <Wallet size={16} className="muted" />
              </div>
              <div className="panel-body">
                <div className="progress-list">
                  {steps.map((label, i) => (
                    <div
                      className={`progress-step ${i < step ? "done" : i === step ? "current" : ""}`}
                      key={label}
                    >
                      <div className="progress-circle">
                        {i < step ? (
                          <Check size={12} />
                        ) : (
                          String(i + 1).padStart(2, "0")
                        )}
                      </div>
                      <div>
                        <strong>{label}</strong>
                        <small>
                          {
                            [
                              "Awaiting payment authorization",
                              "Payment observed by watcher",
                              "Common confirmation policy",
                              "One batch authorized",
                              "Blind, evaluate, verify, unblind",
                              "Encrypted on your device",
                            ][i]
                          }
                        </small>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="privacy-note">
              <ShieldCheck size={20} />
              <p>
                <strong>What the issuer sees</strong>
                <br />
                An authorized invoice and ten blinded elements. Your final
                credential values stay on your device until you choose to spend
                them.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function PendingInvoices({
  onResume,
}: {
  onResume: (invoice: Invoice) => void;
}) {
  const { data } = useQuery({
    queryKey: ["wallet"],
    queryFn: () => browserClient().options.store.load(),
  });
  const pending = data?.invoices.filter((i) => i.status !== "CREDITS_READY");
  if (!pending?.length) return null;
  return (
    <div className="panel" style={{ maxWidth: 740, marginTop: 24 }}>
      <div className="panel-header">
        <h3>Pending purchases on this device</h3>
      </div>
      <div className="panel-body">
        {pending.slice(0, 5).map((i) => (
          <div className="activity-row" key={i.id}>
            <span className="mono">{i.id.slice(0, 15)}…</span>
            <span>{i.zecAmount} ZEC</span>
            <button
              className="button button-small button-secondary"
              style={{ marginLeft: "auto" }}
              onClick={() => onResume(i)}
            >
              Resume
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
