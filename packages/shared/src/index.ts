import { z } from "zod";
export const TOKEN_CLASS = "search-v1";
export const TOKEN_TYPE = 1;
export const BATCH_SIZE = 10;
export const ErrorCodes = [
  "PAYMENT_NOT_CONFIRMED",
  "INVOICE_EXPIRED",
  "ISSUANCE_ALREADY_COMPLETED",
  "ISSUER_POLICY_VIOLATION",
  "INVALID_TOKEN",
  "TOKEN_ALREADY_SPENT",
  "TOKEN_EXPIRED",
  "WRONG_TOKEN_CLASS",
  "WRONG_ISSUER_EPOCH",
  "SERVICE_TEMPORARILY_UNAVAILABLE",
  "TOR_NOT_AVAILABLE",
  "INVALID_REQUEST",
  "NOT_FOUND",
  "VAULT_LOCKED",
] as const;
export type ErrorCode = (typeof ErrorCodes)[number];
export class BlindPassError extends Error {
  constructor(
    public code: ErrorCode,
    public status = 400,
    message?: string,
  ) {
    super(message ?? code.replaceAll("_", " ").toLowerCase());
    this.name = "BlindPassError";
  }
}
export function b64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_");
}
export function unb64(value: string): Uint8Array {
  return Uint8Array.from(
    atob(value.replaceAll("-", "+").replaceAll("_", "/")),
    (c) => c.charCodeAt(0),
  );
}
export function utf8(s: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(s);
}
export function buffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}
export async function sha256(bytes: Uint8Array | string): Promise<string> {
  return b64(
    new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        buffer(typeof bytes === "string" ? utf8(bytes) : bytes),
      ),
    ),
  );
}
// Only JSON-compatible data enters application signatures. Lexicographic keys make signatures independent of transport ordering.
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b, "en"))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export function epochDates(epoch: string) {
  if (!/^\d{4}-\d{2}$/.test(epoch))
    throw new BlindPassError("WRONG_ISSUER_EPOCH");
  const [year, month] = epoch.split("-").map(Number);
  if (month < 1 || month > 12) throw new BlindPassError("WRONG_ISSUER_EPOCH");
  return {
    validFrom: new Date(Date.UTC(year, month - 1, 1)).toISOString(),
    issuanceEndsAt: new Date(Date.UTC(year, month, 1)).toISOString(),
    expiresAt: new Date(Date.UTC(year, month, 8)).toISOString(),
  };
}
export const currentEpoch = () => new Date().toISOString().slice(0, 7);
export const ManifestSchema = z
  .object({
    version: z.literal(1),
    issuer: z.string(),
    activeKeyId: z.string(),
    tokenType: z.literal(1),
    tokenClass: z.string(),
    epoch: z.string(),
    validFrom: z.string(),
    issuanceEndsAt: z.string(),
    expiresAt: z.string(),
    publicKey: z.string(),
    originScope: z.string(),
    batchSize: z.literal(10),
  })
  .strict();
export type Manifest = z.infer<typeof ManifestSchema>;
export const SignedManifestSchema = z
  .object({
    manifest: ManifestSchema,
    signature: z.string(),
    signingPublicKey: z.string(),
  })
  .strict();
export type SignedManifest = z.infer<typeof SignedManifestSchema>;
export interface SignedDocument<T> {
  document: T;
  signature: string;
  signingPublicKey: string;
}
export interface InvoiceDocument {
  invoice_id: string;
  offer_id: string;
  zec_amount: string;
  credit_count: number;
  token_class: string;
  issuer_configuration_hash: string;
  payment_address: string;
  confirmation_policy: number;
  payment_deadline: string;
  issuance_deadline: string;
  refund_policy: string;
}
export type InvoiceStatus =
  | "WAITING_FOR_PAYMENT"
  | "PAYMENT_DETECTED"
  | "WAITING_FOR_CONFIRMATION"
  | "PAYMENT_CONFIRMED"
  | "ISSUING_PRIVATE_CREDITS"
  | "CREDITS_READY"
  | "EXPIRED"
  | "PAYMENT_REORGED";
export interface Invoice {
  id: string;
  capability?: string;
  offerId: string;
  zecAmount: string;
  creditCount: number;
  tokenClass: string;
  issuerEpoch: string;
  issuerConfigHash: string;
  paymentAddress: string;
  paymentUri: string;
  status: InvoiceStatus;
  expiresAt: string;
  issuanceDeadline: string;
  createdAt: string;
  document: SignedDocument<InvoiceDocument>;
  simulated: boolean;
}
export interface StoredCredential {
  token: string;
  epoch: string;
  tokenClass: string;
  expiresAt: string;
}
export interface SearchResult {
  id: string;
  title: string;
  url: string;
  description: string;
  category: string;
}
export interface SearchResponse {
  query: string;
  results: SearchResult[];
  creditConsumed: true;
  total: number;
}
export interface Offer {
  id: string;
  name: string;
  zecAmount: string;
  creditCount: number;
  tokenClass: string;
  enabled: boolean;
}
export async function verifySignature(
  document: unknown,
  signature: string,
  publicKey: string,
) {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      buffer(unb64(publicKey)),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      "Ed25519",
      key,
      buffer(unb64(signature)),
      buffer(utf8(canonical(document))),
    );
  } catch {
    return false;
  }
}
export const fingerprint = async (publicKey: string) =>
  (await sha256(unb64(publicKey))).replaceAll("=", "");
