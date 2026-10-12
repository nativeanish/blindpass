import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { keyGen } from "../packages/privacy-pass/src/index.js";
import {
  b64,
  currentEpoch,
  fingerprint,
} from "../packages/shared/src/index.js";
const output = resolve(process.argv[2] ?? ".secrets/production.env");
const pair = await crypto.subtle.generateKey("Ed25519", true, [
  "sign",
  "verify",
]);
const publicKey = b64(
  new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)),
);
const current = currentEpoch();
const next = new Date(
  Date.UTC(Number(current.slice(0, 4)), Number(current.slice(5)), 1),
)
  .toISOString()
  .slice(0, 7);
const ring = {
  [current]: b64((await keyGen()).privateKey),
  [next]: b64((await keyGen()).privateKey),
};
const content = [
  `MERCHANT_CONFIG_PRIVATE_KEY=${b64(new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey)))}`,
  `MERCHANT_CONFIG_PUBLIC_KEY=${publicKey}`,
  `OPERATOR_API_KEY=${randomBytes(32).toString("base64url")}`,
  `PRIVACYPASS_ISSUER_KEYS='${JSON.stringify(ring)}'`,
  "",
].join("\n");
await mkdir(dirname(output), { recursive: true, mode: 0o700 });
await writeFile(output, content, { mode: 0o600, flag: "wx" });
console.log(
  `New signing identity and ${current}/${next} epoch keys saved to ${output}. Existing files are never overwritten.`,
);
console.log(
  `Public NEXT_PUBLIC_BLINDPASS_FINGERPRINT=${await fingerprint(publicKey)}`,
);
console.log(
  "Back up this file securely with your database. Reuse this identity on every deployment; do not regenerate it for a running service.",
);
