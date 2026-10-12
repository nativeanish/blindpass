import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  primaryKey,
  boolean,
} from "drizzle-orm/pg-core";
export const offers = pgTable("offers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  zecAmount: text("zec_amount").notNull(),
  creditCount: integer("credit_count").notNull(),
  tokenClass: text("token_class").notNull(),
  enabled: boolean("enabled").notNull().default(true),
});
export const issuerEpochs = pgTable("issuer_epochs", {
  epoch: text("epoch").primaryKey(),
  issuerKeyId: text("issuer_key_id").notNull(),
  publicKey: text("public_key").notNull(),
  validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
  validUntil: timestamp("valid_until", { withTimezone: true }).notNull(),
  verificationGraceUntil: timestamp("verification_grace_until", {
    withTimezone: true,
  }).notNull(),
  manifest: jsonb("manifest").notNull(),
});
export const invoices = pgTable("invoices", {
  id: text("id").primaryKey(),
  capabilitySecretHash: text("capability_secret_hash").notNull().unique(),
  offerId: text("offer_id")
    .notNull()
    .references(() => offers.id),
  zecAmount: text("zec_amount").notNull(),
  creditCount: integer("credit_count").notNull(),
  tokenClass: text("token_class").notNull(),
  issuerEpoch: text("issuer_epoch")
    .notNull()
    .references(() => issuerEpochs.epoch),
  issuerConfigHash: text("issuer_config_hash").notNull(),
  paymentAddress: text("payment_address").notNull().unique(),
  paymentUri: text("payment_uri").notNull(),
  status: text("status").notNull(),
  paymentTxid: text("payment_txid"),
  scannerCheckedAt: timestamp("scanner_checked_at", { withTimezone: true }),
  detectedAt: timestamp("detected_at", { withTimezone: true }),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  issuanceDeadline: timestamp("issuance_deadline", {
    withTimezone: true,
  }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  document: jsonb("document").notNull(),
});
export const paymentEvents = pgTable("invoice_payment_events", {
  id: text("id").primaryKey(),
  invoiceId: text("invoice_id")
    .notNull()
    .references(() => invoices.id),
  txid: text("txid").notNull(),
  amount: text("amount").notNull(),
  blockHeight: integer("block_height"),
  confirmations: integer("confirmations").notNull(),
  reorg: boolean("reorg").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const issuanceAuthorizations = pgTable("issuance_authorizations", {
  invoiceId: text("invoice_id")
    .primaryKey()
    .references(() => invoices.id),
  status: text("status").notNull(),
  requestHash: text("request_hash"),
  responses: jsonb("responses"),
  issuedCount: integer("issued_count").notNull().default(0),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});
// Intentionally no invoice reference, client ID, query, IP, or raw credential.
export const redeemedTokens = pgTable(
  "redeemed_tokens",
  {
    tokenHash: text("token_hash").notNull(),
    issuerEpoch: text("issuer_epoch").notNull(),
    status: text("status").notNull(),
    reservedAt: timestamp("reserved_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    spentAt: timestamp("spent_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.tokenHash, t.issuerEpoch] })],
);
export const auditEvents = pgTable("audit_events", {
  kind: text("kind").primaryKey(),
  count: integer("count").notNull().default(0),
});
