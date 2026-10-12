import type { Database } from "./db/connection.js";
import type { PaymentWatcher } from "@blindpass/zcash";
import type { InvoiceService } from "./invoices.js";

// Reuses authenticated scanner reads and the same idempotent transaction as
// webhooks. No payment data is attached to credential redemption records.
export class PaymentReconciler {
  status: {
    lastRunAt: string | null;
    lastSuccessAt: string | null;
    lastErrorAt: string | null;
  } = { lastRunAt: null, lastSuccessAt: null, lastErrorAt: null };
  private timer?: ReturnType<typeof setTimeout>;
  private running?: Promise<void>;
  private stopped = false;
  constructor(
    private database: Database,
    private watcher: PaymentWatcher,
    private invoices: InvoiceService,
    private intervalMs: number,
  ) {}
  runOnce() {
    if (this.running) return this.running;
    this.running = this.reconcile().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }
  private async reconcile() {
    this.status.lastRunAt = new Date().toISOString();
    const rows = await this.database.sql`
      UPDATE invoices SET scanner_checked_at=now() WHERE id IN (
        SELECT id FROM invoices WHERE created_at>now()-interval '7 days'
        AND (scanner_checked_at IS NULL OR scanner_checked_at<now()-interval '30 seconds')
        ORDER BY scanner_checked_at ASC NULLS FIRST, created_at LIMIT 20
        FOR UPDATE SKIP LOCKED
      ) RETURNING id`;
    for (let i = 0; i < rows.length && !this.stopped; i += 4) {
      await Promise.all(
        rows.slice(i, i + 4).map(async (row) => {
          try {
            const event = await this.watcher.getInvoice(row.id);
            if (event) await this.invoices.payment(event);
            this.status.lastSuccessAt = new Date().toISOString();
          } catch {
            this.status.lastErrorAt = new Date().toISOString();
            await this.database
              .sql`INSERT INTO audit_events(kind,count) VALUES('scanner_reconciliation_failed',1) ON CONFLICT(kind) DO UPDATE SET count=audit_events.count+1`;
          }
        }),
      );
    }
  }
  start() {
    const tick = async () => {
      try {
        await this.runOnce();
      } catch {
        this.status.lastErrorAt = new Date().toISOString();
      }
      if (!this.stopped) {
        this.timer = setTimeout(tick, this.intervalMs);
        this.timer.unref();
      }
    };
    this.timer = setTimeout(tick, 1000);
    this.timer.unref();
  }
  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.running;
  }
}
