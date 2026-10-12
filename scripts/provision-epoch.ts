import { readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { parse } from "dotenv";
import { keyGen } from "../packages/privacy-pass/src/index.js";
import { b64, currentEpoch, epochDates } from "../packages/shared/src/index.js";
const epoch = process.argv[2];
if (!epoch)
  throw new Error(
    "Usage: pnpm keys:provision YYYY-MM [path-to-production.env]",
  );
epochDates(epoch);
if (epoch < currentEpoch())
  throw new Error(
    "Cannot provision a past epoch. Restore its original secret from backup instead.",
  );
const path = resolve(process.argv[3] ?? ".secrets/production.env");
const source = await readFile(path, "utf8");
const config = parse(source);
const ring = JSON.parse(config.PRIVACYPASS_ISSUER_KEYS ?? "{}") as Record<
  string,
  string
>;
if (ring[epoch])
  throw new Error(`The ${epoch} key already exists; refusing to replace it.`);
if (
  !config.MERCHANT_CONFIG_PRIVATE_KEY ||
  !config.MERCHANT_CONFIG_PUBLIC_KEY ||
  !config.PRIVACYPASS_ISSUER_KEYS
)
  throw new Error(
    "Use the existing complete production key file. Do not regenerate a deployed identity.",
  );
ring[epoch] = b64((await keyGen()).privateKey);
const next = source.replace(
  /^PRIVACYPASS_ISSUER_KEYS=.*$/m,
  `PRIVACYPASS_ISSUER_KEYS='${JSON.stringify(ring)}'`,
);
const temporary = `${path}.${randomBytes(8).toString("hex")}.tmp`;
await writeFile(temporary, next, { flag: "wx", mode: 0o600 });
await rename(temporary, path);
console.log(
  `Provisioned ${epoch} in ${path}. Existing keys and signing identity were retained. Back up the file and recreate API containers to load the additional key.`,
);
