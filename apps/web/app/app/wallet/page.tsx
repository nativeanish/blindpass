"use client";
import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  Upload,
  ShieldCheck,
  KeyRound,
  ArrowUpRight,
  Wallet,
} from "lucide-react";
import { Badge, ErrorNotice, EmptyState } from "@blindpass/ui";
import { browserClient } from "../../../lib/vault";

export default function WalletPage() {
  const qc = useQueryClient();
  const { data: state, error: loadError } = useQuery({
    queryKey: ["wallet"],
    queryFn: () => browserClient().options.store.load(),
  });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [restorePassword, setRestorePassword] = useState("");
  const [file, setFile] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [message, setMessage] = useState("");
  const credits = state?.credentials ?? [];
  const groups = [...new Set(credits.map((c) => c.epoch))].sort();
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError(undefined);
    setMessage("");
    try {
      await work();
      await qc.invalidateQueries();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function backup() {
    if (password !== confirm)
      throw new Error("The backup passphrases do not match.");
    const content = await browserClient().exportBackup(password);
    const url = URL.createObjectURL(
      new Blob([content], { type: "application/json" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `blindpass-wallet-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setPassword("");
    setConfirm("");
    setMessage(
      "Encrypted backup prepared for download. Keep the file and passphrase in separate safe places.",
    );
  }
  async function restore() {
    if (!file) throw new Error("Choose a BlindPass backup file.");
    if (file.size > 5 * 1024 * 1024)
      throw new Error("Backup exceeds the 5 MB limit.");
    await browserClient().restoreBackup(await file.text(), restorePassword);
    setRestorePassword("");
    setMessage(
      "Wallet restored. Any pending purchase can be resumed from Purchases. Credits already spent from an older backup cannot be used again.",
    );
  }
  return (
    <div id="main-content">
      <div className="page-heading">
        <div>
          <h1>Your wallet. In your hands.</h1>
          <p>Manage your private credits and protect access to them.</p>
        </div>
        <Badge tone="green">
          <ShieldCheck size={12} /> ENCRYPTED LOCALLY
        </Badge>
      </div>
      <ErrorNotice error={error ?? loadError} />
      {message && (
        <div className="notice success" role="status">
          {message}
        </div>
      )}
      <div className="stats-grid wallet-stats">
        <div className="stat-card primary">
          <div className="stat-title">
            Available credits
            <Wallet size={18} />
          </div>
          <div className="stat-value">
            {credits.filter((c) => Date.parse(c.expiresAt) > Date.now()).length}
          </div>
          <div className="stat-caption">One credit per search</div>
        </div>
        <div className="stat-card">
          <div className="stat-title">Successful searches</div>
          <div className="stat-value">{state?.used ?? 0}</div>
          <div className="stat-caption">Stored on this device only</div>
        </div>
        <div className="stat-card">
          <div className="stat-title">Last backup prepared</div>
          <div className="backup-date">
            {state?.lastBackupAt
              ? new Date(state.lastBackupAt).toLocaleDateString()
              : "No backup yet"}
          </div>
          <div className="stat-caption">Back up again after a purchase</div>
        </div>
      </div>
      {!!state?.uncertain && (
        <div className="notice">
          <strong>{state.uncertain} credit(s) set aside</strong>
          <span>
            A search response could not be confirmed. These credits are excluded
            from your balance to prevent accidental reuse. See{" "}
            <Link href="/app/help" className="text-link">
              help and recovery
            </Link>
            .
          </span>
        </div>
      )}
      <div className="panel" style={{ marginBottom: 24 }}>
        <div className="panel-header">
          <h3>Credit batches</h3>
          <Link href="/app/buy" className="text-link">
            Buy credits <ArrowUpRight size={14} />
          </Link>
        </div>
        {groups.length ? (
          <div className="panel-body">
            {groups.map((epoch) => {
              const batch = credits.filter((c) => c.epoch === epoch);
              const expires = batch[0].expiresAt;
              const expired = Date.parse(expires) <= Date.now();
              return (
                <div className="purchase-row" key={epoch}>
                  <div>
                    <strong>{epoch} shared epoch</strong>
                    <p>
                      {expired ? "Expired" : "Expires"}{" "}
                      {new Date(expires).toLocaleString()}
                    </p>
                  </div>
                  <Badge tone={expired ? "amber" : "green"}>
                    {batch.length} {expired ? "EXPIRED" : "CREDITS"}
                  </Badge>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<Wallet size={24} />}
            heading="Your first credits belong here."
          >
            Buy a batch, then save a backup before clearing your browser data.
          </EmptyState>
        )}
      </div>
      <div className="recovery-grid">
        <section className="panel">
          <div className="panel-header">
            <h3>
              <Download size={17} /> Save an encrypted backup
            </h3>
          </div>
          <form
            className="panel-body recovery-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(backup);
            }}
          >
            <p>
              Your credits, purchase capabilities, and pending purchase recovery
              data are encrypted in your browser. The file and passphrase are
              never uploaded.
            </p>
            <label htmlFor="backup-password">Backup passphrase</label>
            <input
              id="backup-password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={1024}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 12 characters"
            />
            <label htmlFor="backup-confirm">Confirm passphrase</label>
            <input
              id="backup-confirm"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={1024}
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            <button className="button" disabled={busy || !state} type="submit">
              <Download size={16} />
              {busy ? "Working…" : "Download encrypted backup"}
            </button>
            <p className="panel-note">
              There is no password reset. Keep the passphrase separately from
              the backup. Anyone with both can spend its remaining credits.
            </p>
          </form>
        </section>
        <section className="panel">
          <div className="panel-header">
            <h3>
              <Upload size={17} /> Restore a wallet
            </h3>
          </div>
          <form
            className="panel-body recovery-form"
            onSubmit={(e) => {
              e.preventDefault();
              void run(restore);
            }}
          >
            <p>
              Restore into an empty wallet on a new device or browser profile.
              An old backup cannot recreate credits already spent. Continue
              using only one copy of your restored wallet.
            </p>
            <label htmlFor="backup-file">Encrypted backup file</label>
            <input
              id="backup-file"
              type="file"
              accept=".json,application/json"
              required
              onChange={(e) => setFile(e.target.files?.[0])}
            />
            <label htmlFor="restore-password">Backup passphrase</label>
            <input
              id="restore-password"
              type="password"
              autoComplete="off"
              minLength={12}
              maxLength={1024}
              required
              value={restorePassword}
              onChange={(e) => setRestorePassword(e.target.value)}
            />
            <button
              className="button button-secondary"
              disabled={busy || !file}
              type="submit"
            >
              <Upload size={16} />
              Restore encrypted backup
            </button>
            <p className="panel-note">
              Your existing wallet is never overwritten. Use the same BlindPass
              service where you created the backup.
            </p>
          </form>
        </section>
      </div>
      <div className="privacy-note">
        <KeyRound size={21} />
        <p>
          <strong>No account means no account recovery.</strong> Your browser
          protects the local vault. Clearing site data or losing this device
          requires a backup to recover your credits. Same-origin scripts and a
          compromised device can still access your wallet.
        </p>
      </div>
    </div>
  );
}
