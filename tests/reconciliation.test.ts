import { beforeAll, afterAll, it, expect } from "vitest";
import { testDatabase } from "./database.js";
import { createApp } from "../apps/api/src/app.js";
import { PaymentReconciler } from "../apps/api/src/reconciliation.js";
import { MockPaymentWatcher } from "../packages/zcash/src/index.js";
import type { Invoice } from "../packages/shared/src/index.js";
let database: Awaited<ReturnType<typeof testDatabase>>;
let runtime: Awaited<ReturnType<typeof createApp>>;
beforeAll(async () => {
  database = await testDatabase();
  runtime = await createApp({ database });
});
afterAll(async () => {
  await runtime?.app.close();
  await database?.cleanup();
});
it("reconciles a missed notification and honors an on-time observation arriving after the payment deadline", async () => {
  const invoice = (
    await runtime.app.inject({
      method: "POST",
      url: "/api/invoices",
      payload: { offerId: "search-10" },
    })
  ).json<Invoice>();
  await database.sql`UPDATE invoices SET created_at=now()-interval '1 hour',expires_at=now()-interval '1 minute' WHERE id=${invoice.id}`;
  const watcher = new MockPaymentWatcher();
  await watcher.emit({
    eventId: "missed-event-123",
    invoiceId: invoice.id,
    txid: "test-transaction-123",
    amount: "0.01",
    blockHeight: 1,
    confirmations: 3,
    reorg: false,
    observedAt: new Date(Date.now() - 120000).toISOString(),
  });
  const reconciler = new PaymentReconciler(
    database,
    watcher,
    runtime.invoiceService,
    30000,
  );
  await Promise.all([reconciler.runOnce(), reconciler.runOnce()]);
  expect((await runtime.invoiceService.get(invoice.capability!)).status).toBe(
    "PAYMENT_CONFIRMED",
  );
  const [row] =
    await database.sql`SELECT count(*)::int AS count FROM issuance_authorizations WHERE invoice_id=${invoice.id}`;
  expect(row.count).toBe(1);
  expect(reconciler.status.lastSuccessAt).not.toBeNull();
  await runtime.invoiceService.payment({
    eventId: "unrelated-reorg-event",
    invoiceId: invoice.id,
    txid: "unrelated-transaction",
    amount: "0.01",
    blockHeight: 1,
    confirmations: 0,
    reorg: true,
  });
  expect((await runtime.invoiceService.get(invoice.capability!)).status).toBe(
    "PAYMENT_CONFIRMED",
  );
});
it("reports scanner failures as aggregate counts without losing purchase state", async () => {
  const invoice = (
    await runtime.app.inject({
      method: "POST",
      url: "/api/invoices",
      payload: { offerId: "search-10" },
    })
  ).json<Invoice>();
  const watcher = new MockPaymentWatcher();
  watcher.getInvoice = async () => {
    throw new Error("scanner unavailable");
  };
  const reconciler = new PaymentReconciler(
    database,
    watcher,
    runtime.invoiceService,
    30000,
  );
  await reconciler.runOnce();
  expect(reconciler.status.lastErrorAt).not.toBeNull();
  expect((await runtime.invoiceService.get(invoice.capability!)).status).toBe(
    "WAITING_FOR_PAYMENT",
  );
  const [event] =
    await database.sql`SELECT count FROM audit_events WHERE kind='scanner_reconciliation_failed'`;
  expect(event.count).toBeGreaterThan(0);
});

it("keeps an on-time detected payment awaiting confirmation after the payment deadline", async () => {
  const invoice = (
    await runtime.app.inject({
      method: "POST",
      url: "/api/invoices",
      payload: { offerId: "search-10" },
    })
  ).json<Invoice>();
  await database.sql`UPDATE invoices SET created_at=now()-interval '1 hour',expires_at=now()-interval '1 minute' WHERE id=${invoice.id}`;
  const event = {
    eventId: "on-time-detected-transfer",
    invoiceId: invoice.id,
    txid: "on-time-detected-transaction",
    amount: "0.01",
    blockHeight: 1,
    confirmations: 1,
    reorg: false,
    observedAt: new Date(Date.now() - 120000).toISOString(),
  };
  await runtime.invoiceService.payment(event);
  expect((await runtime.invoiceService.get(invoice.capability!)).status).toBe(
    "WAITING_FOR_CONFIRMATION",
  );
  await runtime.invoiceService.payment({
    ...event,
    eventId: "on-time-confirmed-transfer",
    confirmations: 3,
  });
  expect((await runtime.invoiceService.get(invoice.capability!)).status).toBe(
    "PAYMENT_CONFIRMED",
  );
});
