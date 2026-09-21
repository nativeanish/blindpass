import { keyGen, TokenIssuer } from "../packages/privacy-pass/src/index.js";
import {
  b64,
  sha256,
  epochDates,
  currentEpoch,
  type Manifest,
} from "../packages/shared/src/index.js";
export async function cryptoFixture() {
  const key = await keyGen();
  const epoch = currentEpoch();
  const manifest: Manifest = {
    version: 1,
    issuer: "localhost:3000",
    activeKeyId: await sha256(key.publicKey),
    tokenType: 1,
    tokenClass: "search-v1",
    epoch,
    ...epochDates(epoch),
    publicKey: b64(key.publicKey),
    originScope: "localhost:3000",
    batchSize: 10,
  };
  return { key, manifest, issuer: new TokenIssuer(manifest, key.privateKey) };
}
