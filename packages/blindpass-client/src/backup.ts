import { z } from "zod";
import { b64, unb64, buffer, SignedManifestSchema } from "@blindpass/shared";
import type { ClientState } from "./index.ts";
const LIMIT = 5 * 1024 * 1024;
const ITERATIONS = 600000;
const encoded = z
  .string()
  .max(LIMIT)
  .regex(/^[A-Za-z0-9_-]*={0,2}$/);
const date = z.string().datetime();
const document = z
  .object({
    invoice_id: z.string(),
    offer_id: z.string(),
    zec_amount: z.string(),
    credit_count: z.number().int(),
    token_class: z.string(),
    issuer_configuration_hash: z.string(),
    payment_address: z.string(),
    confirmation_policy: z.number().int(),
    payment_deadline: date,
    issuance_deadline: date,
    refund_policy: z.string(),
  })
  .strict();
const StateSchema = z
  .object({
    credentials: z
      .array(
        z
          .object({
            token: encoded.refine((v) => unb64(v).length === 146),
            epoch: z.string(),
            tokenClass: z.literal("search-v1"),
            expiresAt: date,
          })
          .strict(),
      )
      .max(10000),
    used: z.number().int().nonnegative(),
    uncertain: z.number().int().nonnegative().optional(),
    invoices: z
      .array(
        z
          .object({
            id: z.string(),
            capability: z.string().optional(),
            offerId: z.string(),
            zecAmount: z.string(),
            creditCount: z.number().int(),
            tokenClass: z.string(),
            issuerEpoch: z.string(),
            issuerConfigHash: z.string(),
            paymentAddress: z.string(),
            paymentUri: z.string(),
            status: z.enum([
              "WAITING_FOR_PAYMENT",
              "PAYMENT_DETECTED",
              "WAITING_FOR_CONFIRMATION",
              "PAYMENT_CONFIRMED",
              "ISSUING_PRIVATE_CREDITS",
              "CREDITS_READY",
              "EXPIRED",
              "PAYMENT_REORGED",
            ]),
            expiresAt: date,
            issuanceDeadline: date,
            createdAt: date,
            document: z
              .object({
                document,
                signature: encoded,
                signingPublicKey: encoded,
              })
              .strict(),
            simulated: z.boolean(),
          })
          .strict(),
      )
      .max(10000),
    trustedFingerprint: z.string().optional(),
    configuration: SignedManifestSchema.optional(),
    activity: z
      .array(z.object({ kind: z.string().max(300), at: date }).strict())
      .max(1000),
    lastBackupAt: date.optional(),
    pendingIssuance: z
      .record(
        z.string(),
        z
          .object({
            configuration: SignedManifestSchema,
            batch: z
              .object({
                version: z.literal(1),
                requests: z.array(encoded).length(10),
                finalizeData: z.array(encoded).length(10),
              })
              .strict(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();
const Payload = z
  .object({ issuer: z.string().min(1), createdAt: date, state: StateSchema })
  .strict();
const Envelope = z
  .object({
    format: z.literal("blindpass-backup"),
    version: z.literal(1),
    iterations: z.literal(ITERATIONS),
    salt: encoded,
    iv: encoded,
    data: encoded,
  })
  .strict();
async function derive(passphrase: string, salt: Uint8Array) {
  if (passphrase.length < 12 || passphrase.length > 1024)
    throw new Error("Use a backup passphrase between 12 and 1,024 characters.");
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: buffer(salt),
      iterations: ITERATIONS,
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
const aad = new TextEncoder().encode("blindpass-backup-v1");
export async function encryptBackup(
  payload: { issuer: string; createdAt: string; state: ClientState },
  passphrase: string,
) {
  const parsed = Payload.parse(payload);
  const bytes = new TextEncoder().encode(JSON.stringify(parsed));
  if (bytes.length > LIMIT / 2)
    throw new Error("Wallet is too large for this backup format.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad },
    await derive(passphrase, salt),
    bytes,
  );
  return JSON.stringify({
    format: "blindpass-backup",
    version: 1,
    iterations: ITERATIONS,
    salt: b64(salt),
    iv: b64(iv),
    data: b64(new Uint8Array(data)),
  });
}
export async function decryptBackup(content: string, passphrase: string) {
  if (content.length > LIMIT) throw new Error("Backup exceeds the 5 MB limit.");
  try {
    const envelope = Envelope.parse(JSON.parse(content));
    const salt = unb64(envelope.salt),
      iv = unb64(envelope.iv);
    if (salt.length !== 16 || iv.length !== 12)
      throw new Error("Invalid encryption parameters");
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: buffer(iv), additionalData: aad },
      await derive(passphrase, salt),
      buffer(unb64(envelope.data)),
    );
    return Payload.parse(JSON.parse(new TextDecoder().decode(plaintext)));
  } catch {
    throw new Error(
      "Unable to unlock this backup. Check the passphrase and use an unmodified BlindPass backup file.",
    );
  }
}
