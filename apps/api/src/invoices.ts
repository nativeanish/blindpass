import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  BlindPassError,
  sha256,
  canonical,
  type Invoice,
  type InvoiceDocument,
  type SignedDocument,
  type InvoiceStatus,
} from "@blindpass/shared";
import {
  zatoshis,
  type PaymentWatcher,
  type PaymentEvent,
} from "@blindpass/zcash";
import type { Database } from "./db/connection.js";
import { invoices, offers } from "./db/schema.js";
import type { Keys } from "./keys.js";
import { config } from "./config.js";
type InvoiceRow = typeof invoices.$inferSelect;
export class InvoiceService {
  constructor(
    private database: Database,
    private keys: Keys,
    private watcher: PaymentWatcher,
  ) {}
  private public(row: InvoiceRow): Invoice {
    return {
      id: row.id,
      offerId: row.offerId,
      zecAmount: row.zecAmount,
      creditCount: row.creditCount,
      tokenClass: row.tokenClass,
      issuerEpoch: row.issuerEpoch,
      issuerConfigHash: row.issuerConfigHash,
      paymentAddress: row.paymentAddress,
      paymentUri: row.paymentUri,
      status: row.status as InvoiceStatus,
      expiresAt: row.expiresAt.toISOString(),
      issuanceDeadline: row.issuanceDeadline.toISOString(),
      createdAt: row.createdAt.toISOString(),
      document: row.document as SignedDocument<InvoiceDocument>,
      simulated: config.ZCASH_PAYMENT_MODE === "mock",
    };
  }
  async create(offerId: string) {
    const keys = { ...this.keys };
    const [offer] = await this.database.db
      .select()
      .from(offers)
      .where(eq(offers.id, offerId));
    if (!offer?.enabled)
      throw new BlindPassError("NOT_FOUND", 404, "Offer unavailable.");
    const id = `inv_${randomUUID()}`;
    const capability = randomBytes(32).toString("base64url");
    const hash = await sha256(capability);
    const end = Math.min(
      Date.now() + 30 * 60 * 1000,
      Date.parse(keys.manifest.issuanceEndsAt),
    );
    if (end <= Date.now())
      throw new BlindPassError(
        "WRONG_ISSUER_EPOCH",
        503,
        "Issuer needs epoch rotation.",
      );
    const expiresAt = new Date(end);
    const issuanceDeadline = new Date(
      Math.min(end + 24 * 3600000, Date.parse(keys.manifest.issuanceEndsAt)),
    );
    const destination = await this.watcher.createInvoice({
      invoiceId: id,
      amount: offer.zecAmount,
    });
    const configHash = await sha256(canonical(keys.manifest));
    const document = await keys.sign<InvoiceDocument>({
      invoice_id: id,
      offer_id: offer.id,
      zec_amount: offer.zecAmount,
      credit_count: offer.creditCount,
      token_class: offer.tokenClass,
      issuer_configuration_hash: configHash,
      payment_address: destination.address,
      confirmation_policy: config.ZCASH_CONFIRMATIONS,
      payment_deadline: expiresAt.toISOString(),
      issuance_deadline: issuanceDeadline.toISOString(),
      refund_policy:
        "Contact the operator with the invoice capability for unissued paid invoices. Automatic refunds and replacement of lost bearer credentials are not supported.",
    });
    const [row] = await this.database.db
      .insert(invoices)
      .values({
        id,
        capabilitySecretHash: hash,
        offerId,
        zecAmount: offer.zecAmount,
        creditCount: offer.creditCount,
        tokenClass: offer.tokenClass,
        issuerEpoch: keys.manifest.epoch,
        issuerConfigHash: configHash,
        paymentAddress: destination.address,
        paymentUri: destination.paymentUri,
        status: "WAITING_FOR_PAYMENT",
        expiresAt,
        issuanceDeadline,
        document,
      })
      .returning();
    return { ...this.public(row), capability };
  }
  async get(capability: string) {
    const hash = await sha256(capability);
    await this.database
      .sql`UPDATE invoices SET status='EXPIRED' WHERE capability_secret_hash=${hash} AND ((expires_at<now() AND status='WAITING_FOR_PAYMENT') OR (issuance_deadline<now() AND status IN ('PAYMENT_DETECTED','WAITING_FOR_CONFIRMATION','PAYMENT_REORGED','PAYMENT_CONFIRMED')))`;
    const [row] = await this.database.db
      .select()
      .from(invoices)
      .where(eq(invoices.capabilitySecretHash, hash));
    if (!row) throw new BlindPassError("NOT_FOUND", 404);
    return this.public(row);
  }
  async payment(event: PaymentEvent) {
    await this.database.sql.begin(async (tx) => {
      const [row] =
        await tx`SELECT * FROM invoices WHERE id=${event.invoiceId} FOR UPDATE`;
      if (!row) throw new BlindPassError("NOT_FOUND", 404);
      if (zatoshis(event.amount) < zatoshis(row.zec_amount))
        throw new BlindPassError(
          "INVALID_REQUEST",
          400,
          "Payment amount is insufficient.",
        );
      const inserted =
        await tx`INSERT INTO invoice_payment_events(id,invoice_id,txid,amount,block_height,confirmations,reorg) VALUES(${event.eventId},${event.invoiceId},${event.txid},${event.amount},${event.blockHeight},${event.confirmations},${event.reorg}) ON CONFLICT DO NOTHING RETURNING id`;
      if (!inserted.length) return;
      // A reorg for an unrelated transfer must not revoke a different payment.
      if (row.payment_txid && row.payment_txid !== event.txid) {
        await tx`INSERT INTO audit_events(kind,count) VALUES('additional_invoice_payment',1) ON CONFLICT(kind) DO UPDATE SET count=audit_events.count+1`;
        return;
      }
      if (event.reorg) {
        if (row.status === "CREDITS_READY") {
          await tx`INSERT INTO audit_events(kind,count) VALUES('post_issuance_reorg',1) ON CONFLICT(kind) DO UPDATE SET count=audit_events.count+1`;
          return;
        }
        await tx`UPDATE invoices SET status='PAYMENT_REORGED',confirmed_at=NULL WHERE id=${event.invoiceId}`;
        await tx`DELETE FROM issuance_authorizations WHERE invoice_id=${event.invoiceId} AND status='authorized'`;
        return;
      }
      if (row.status === "CREDITS_READY" || row.status === "PAYMENT_CONFIRMED")
        return;
      const observedAt = event.observedAt
        ? Date.parse(event.observedAt)
        : row.detected_at
          ? new Date(row.detected_at).getTime()
          : Date.now();
      if (
        observedAt < new Date(row.created_at).getTime() ||
        observedAt > Date.now() + 60000
      )
        throw new BlindPassError(
          "INVALID_REQUEST",
          400,
          "Invalid payment observation time.",
        );
      if (
        new Date(row.expires_at).getTime() < observedAt ||
        new Date(row.issuance_deadline).getTime() < Date.now()
      ) {
        await tx`UPDATE invoices SET status='EXPIRED' WHERE id=${event.invoiceId}`;
        return;
      }
      const state =
        event.confirmations >= config.ZCASH_CONFIRMATIONS
          ? "PAYMENT_CONFIRMED"
          : event.confirmations > 0
            ? "WAITING_FOR_CONFIRMATION"
            : "PAYMENT_DETECTED";
      await tx`UPDATE invoices SET status=${state},payment_txid=${event.txid},detected_at=COALESCE(detected_at,${new Date(observedAt).toISOString()}::timestamptz),confirmed_at=CASE WHEN ${state}='PAYMENT_CONFIRMED' THEN now() ELSE NULL END WHERE id=${event.invoiceId}`;
      if (state === "PAYMENT_CONFIRMED")
        await tx`INSERT INTO issuance_authorizations(invoice_id,status) VALUES(${event.invoiceId},'authorized') ON CONFLICT(invoice_id) DO NOTHING`;
    });
  }
}
