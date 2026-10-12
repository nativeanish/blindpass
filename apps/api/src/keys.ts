import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generatePublicKey, Oprf } from "@cloudflare/voprf-ts";
import { keyGen, TokenIssuer } from "@blindpass/privacy-pass";
import {
  b64,
  unb64,
  buffer,
  utf8,
  canonical,
  sha256,
  epochDates,
  currentEpoch,
  verifySignature,
  type Manifest,
  type SignedManifest,
  type SignedDocument,
} from "@blindpass/shared";
import type { Database } from "./db/connection.js";
import { config } from "./config.js";
interface SigningKeys {
  privateKey: string;
  publicKey: string;
}
async function developmentSecret<T>(
  name: string,
  create: () => Promise<T>,
): Promise<T> {
  const dir = resolve(process.env.BLINDPASS_SECRETS_DIR ?? ".secrets");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const file = resolve(dir, name);
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const value = await create();
  try {
    await writeFile(file, JSON.stringify(value), { mode: 0o600, flag: "wx" });
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      return JSON.parse(await readFile(file, "utf8")) as T;
    throw error;
  }
}
export async function loadKeys(database: Database) {
  const signing: SigningKeys =
    process.env.MERCHANT_CONFIG_PRIVATE_KEY &&
    process.env.MERCHANT_CONFIG_PUBLIC_KEY
      ? {
          privateKey: process.env.MERCHANT_CONFIG_PRIVATE_KEY,
          publicKey: process.env.MERCHANT_CONFIG_PUBLIC_KEY,
        }
      : await developmentSecret("merchant-signing.json", async () => {
          const pair = await crypto.subtle.generateKey("Ed25519", true, [
            "sign",
            "verify",
          ]);
          return {
            privateKey: b64(
              new Uint8Array(
                await crypto.subtle.exportKey("pkcs8", pair.privateKey),
              ),
            ),
            publicKey: b64(
              new Uint8Array(
                await crypto.subtle.exportKey("raw", pair.publicKey),
              ),
            ),
          };
        });
  const signingKey = await crypto.subtle.importKey(
    "pkcs8",
    buffer(unb64(signing.privateKey)),
    "Ed25519",
    false,
    ["sign"],
  );
  async function sign<T>(document: T): Promise<SignedDocument<T>> {
    return {
      document,
      signature: b64(
        new Uint8Array(
          await crypto.subtle.sign(
            "Ed25519",
            signingKey,
            buffer(utf8(canonical(document))),
          ),
        ),
      ),
      signingPublicKey: signing.publicKey,
    };
  }
  const probe = await sign({ purpose: "blindpass-startup-key-check" });
  if (
    !(await verifySignature(probe.document, probe.signature, signing.publicKey))
  )
    throw new Error("Merchant signing key pair does not match.");
  const epoch = currentEpoch();
  const keyring = JSON.parse(
    process.env.PRIVACYPASS_ISSUER_KEYS || "{}",
  ) as Record<string, string>;
  if (
    !keyring[epoch] &&
    process.env.PRIVACYPASS_ISSUER_KEYS &&
    config.BLINDPASS_ENV === "production"
  )
    throw new Error(`No provisioned issuer key for ${epoch}.`);
  if (
    !keyring[epoch] &&
    process.env.PRIVACYPASS_ISSUER_SECRET &&
    process.env.PRIVACYPASS_ISSUER_EPOCH !== epoch
  )
    throw new Error(
      "Explicit issuer key must name the current PRIVACYPASS_ISSUER_EPOCH.",
    );
  const activeSecret = keyring[epoch] ?? process.env.PRIVACYPASS_ISSUER_SECRET;
  const privateKey = activeSecret
    ? unb64(activeSecret)
    : unb64(
        (
          await developmentSecret(`issuer-${epoch}.json`, async () => ({
            privateKey: b64((await keyGen()).privateKey),
          }))
        ).privateKey,
      );
  const publicKey = generatePublicKey(Oprf.Suite.P384_SHA384, privateKey);
  const manifest: Manifest = {
    version: 1,
    issuer: config.ISSUER_ORIGIN,
    activeKeyId: await sha256(publicKey),
    tokenType: 1,
    tokenClass: "search-v1",
    epoch,
    ...epochDates(epoch),
    publicKey: b64(publicKey),
    originScope: config.ISSUER_ORIGIN,
    batchSize: 10,
  };
  const signed = await sign(manifest);
  const signedManifest: SignedManifest = {
    manifest,
    signature: signed.signature,
    signingPublicKey: signing.publicKey,
  };
  await database.sql.begin(async (tx) => {
    // Serialize first registration as well as rotation across replicas.
    await tx`SELECT pg_advisory_xact_lock(724862094)`;
    const [latest] =
      await tx`SELECT manifest FROM issuer_epochs ORDER BY valid_from DESC LIMIT 1`;
    if (latest) {
      const registered = latest.manifest as SignedManifest;
      if (
        registered.signingPublicKey !== signing.publicKey ||
        registered.manifest.issuer !== manifest.issuer
      )
        throw new Error(
          "Refusing to replace the registered merchant identity or issuer hostname.",
        );
    }
    await tx`INSERT INTO issuer_epochs(epoch,issuer_key_id,public_key,valid_from,valid_until,verification_grace_until,manifest) VALUES(${epoch},${manifest.activeKeyId},${manifest.publicKey},${manifest.validFrom},${manifest.issuanceEndsAt},${manifest.expiresAt},${JSON.stringify(signedManifest)}::jsonb) ON CONFLICT DO NOTHING`;
    const [existing] =
      await tx`SELECT manifest FROM issuer_epochs WHERE epoch=${epoch}`;
    if (
      canonical((existing.manifest as SignedManifest).manifest) !==
      canonical(manifest)
    )
      throw new Error(
        "Refusing to replace an existing common epoch key or policy. Restore the epoch secret and issuer configuration.",
      );
  });
  const issuer = new TokenIssuer(manifest, privateKey);
  const issuers = [issuer];
  const previous =
    await database.sql`SELECT epoch,manifest FROM issuer_epochs WHERE epoch<>${epoch} AND verification_grace_until>now()`;
  const previousSecrets = JSON.parse(
    process.env.PRIVACYPASS_PREVIOUS_KEYS || "{}",
  ) as Record<string, string>;
  for (const row of previous) {
    let secret = previousSecrets[row.epoch] ?? keyring[row.epoch];
    if (!secret && config.BLINDPASS_ENV !== "production") {
      try {
        secret = (
          JSON.parse(
            await readFile(
              resolve(
                process.env.BLINDPASS_SECRETS_DIR ?? ".secrets",
                `issuer-${row.epoch}.json`,
              ),
              "utf8",
            ),
          ) as { privateKey: string }
        ).privateKey;
      } catch {
        continue;
      }
    }
    if (!secret && config.BLINDPASS_ENV === "production")
      throw new Error(
        `Missing verification key for unexpired epoch ${row.epoch}.`,
      );
    if (
      secret &&
      b64(generatePublicKey(Oprf.Suite.P384_SHA384, unb64(secret))) !==
        (row.manifest as SignedManifest).manifest.publicKey
    )
      throw new Error(`Previous epoch key does not match ${row.epoch}.`);
    if (secret)
      issuers.push(
        new TokenIssuer(
          (row.manifest as SignedManifest).manifest,
          unb64(secret),
        ),
      );
  }
  return {
    issuer,
    issuers,
    manifest,
    signedManifest,
    sign,
    signingPublicKey: signing.publicKey,
  };
}
export type Keys = Awaited<ReturnType<typeof loadKeys>>;
