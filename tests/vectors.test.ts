import "../packages/privacy-pass/src/provider.js";
import { test, expect, vi } from "vitest";
import { VOPRFClient } from "@cloudflare/voprf-ts";
import {
  privateVerif,
  TokenChallenge,
  TOKEN_TYPES,
} from "@cloudflare/privacypass-ts";
import vectors from "./vectors/rfc9578-go.json";
const hex = (v: string) => Uint8Array.from(Buffer.from(v, "hex"));
const toHex = (v: Uint8Array) => Buffer.from(v).toString("hex");
test.each(vectors)("RFC 9578 reference implementation vector", async (v) => {
  const nonce = vi
    .spyOn(crypto, "getRandomValues")
    .mockReturnValueOnce(hex(v.nonce));
  const blind = vi
    .spyOn(VOPRFClient.prototype, "randomBlinder")
    .mockResolvedValueOnce(TOKEN_TYPES.VOPRF.group.desScalar(hex(v.blind)));
  try {
    const client = new privateVerif.Client();
    const request = await client.createTokenRequest(
      TokenChallenge.deserialize(hex(v.token_challenge)),
      hex(v.pkS),
    );
    expect(toHex(request.serialize())).toBe(v.token_request);
    const issuer = new privateVerif.Issuer(
      "issuer.example",
      hex(v.skS),
      hex(v.pkS),
    );
    const response = await issuer.issue(request);
    expect(toHex(response.serialize().slice(0, 49))).toBe(
      v.token_response.slice(0, 98),
    );
    const token = await client.finalize(response);
    expect(toHex(token.serialize())).toBe(v.token);
    expect(await issuer.verify(token)).toBe(true);
  } finally {
    nonce.mockRestore();
    blind.mockRestore();
  }
});
