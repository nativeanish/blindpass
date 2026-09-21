import { describe, it, expect } from "vitest";
import {
  createBlindBatch,
  authorization,
  parseAuthorization,
  TokenIssuer,
} from "../packages/privacy-pass/src/index.js";
import { b64, unb64 } from "../packages/shared/src/index.js";
import { cryptoFixture } from "./helpers.js";
describe("RFC 9578 privately verifiable tokens", () => {
  it("blinds, verifies the proof, unblinds, verifies and serializes RFC 9577", async () => {
    const f = await cryptoFixture();
    const batch = await createBlindBatch(f.manifest);
    expect(batch.requests).toHaveLength(10);
    const tokens = await batch.finalize(
      await f.issuer.evaluate(batch.requests),
    );
    for (const token of tokens) {
      await expect(f.issuer.verify(token.token)).resolves.toBeDefined();
      expect(parseAuthorization(authorization(token))).toBe(token.token);
    }
    expect(new Set(tokens.map((t) => t.token)).size).toBe(10);
  });
  it("rejects modified tokens, wrong keys, wrong classes and expired epochs", async () => {
    const f = await cryptoFixture();
    const batch = await createBlindBatch(f.manifest, 1);
    const [token] = await batch.finalize(
      await f.issuer.evaluate(batch.requests),
    );
    const altered = unb64(token.token);
    altered[100] ^= 1;
    await expect(f.issuer.verify(b64(altered))).rejects.toMatchObject({
      code: "INVALID_TOKEN",
    });
    await expect(
      (await cryptoFixture()).issuer.verify(token.token),
    ).rejects.toMatchObject({ code: "INVALID_TOKEN" });
    await expect(
      f.issuer.verify(token.token, Date.parse(f.manifest.expiresAt)),
    ).rejects.toMatchObject({ code: "TOKEN_EXPIRED" });
    await expect(
      f.issuer.verify(token.token, Date.now(), "other"),
    ).rejects.toMatchObject({ code: "WRONG_TOKEN_CLASS" });
    await expect(
      new TokenIssuer(
        { ...f.manifest, activeKeyId: "wrong" },
        f.key.privateKey,
      ).verify(token.token),
    ).rejects.toMatchObject({ code: "WRONG_ISSUER_EPOCH" });
  });
  it("rejects malicious response proofs and appended bytes", async () => {
    const f = await cryptoFixture();
    const batch = await createBlindBatch(f.manifest, 1);
    const responses = await f.issuer.evaluate(batch.requests);
    const corrupt = unb64(responses[0]);
    corrupt[100] ^= 1;
    await expect(batch.finalize([b64(corrupt)])).rejects.toMatchObject({
      code: "INVALID_TOKEN",
    });
    expect(() => parseAuthorization('PrivateToken token="AAAA"')).toThrow();
  });
});
