import "./provider.ts";
import {
  privateVerif,
  Token,
  TokenChallenge,
  AuthorizationHeader,
  TOKEN_TYPES,
  WWWAuthenticateHeader,
} from "@cloudflare/privacypass-ts";
import {
  b64,
  unb64,
  sha256,
  canonical,
  BlindPassError,
  type Manifest,
  type StoredCredential,
} from "@blindpass/shared";
export { privateVerif, Token, TokenChallenge, TOKEN_TYPES };
export const keyGen = privateVerif.keyGen;
export {
  createRecoverableBatch,
  finalizeRecoverableBatch,
  type RecoverableBatch,
} from "./recovery.ts";
export async function challengeFor(manifest: Manifest) {
  const context = unb64(
    await sha256(
      canonical({
        domain: "blindpass-context-v1",
        tokenClass: manifest.tokenClass,
        epoch: manifest.epoch,
        expiresAt: manifest.expiresAt,
      }),
    ),
  );
  return new TokenChallenge(1, manifest.issuer, context, [
    manifest.originScope,
  ]);
}
export async function createBlindBatch(manifest: Manifest, count = 10) {
  const challenge = await challengeFor(manifest);
  const clients = Array.from(
    { length: count },
    () => new privateVerif.Client(),
  );
  const requests = await Promise.all(
    clients.map(async (client) =>
      b64(
        (
          await client.createTokenRequest(challenge, unb64(manifest.publicKey))
        ).serialize(),
      ),
    ),
  );
  return {
    requests,
    async finalize(responses: string[]): Promise<StoredCredential[]> {
      if (responses.length !== clients.length)
        throw new BlindPassError(
          "INVALID_TOKEN",
          400,
          "Incorrect issuance response size.",
        );
      return Promise.all(
        clients.map(async (client, i) => {
          try {
            const bytes = unb64(responses[i]);
            if (bytes.length !== 145) throw new Error("length");
            const token = await client.finalize(
              privateVerif.TokenResponse.deserialize(bytes),
            );
            return {
              token: b64(token.serialize()),
              epoch: manifest.epoch,
              tokenClass: manifest.tokenClass,
              expiresAt: manifest.expiresAt,
            };
          } catch {
            throw new BlindPassError(
              "INVALID_TOKEN",
              400,
              "Issuer proof verification failed. No credits were stored.",
            );
          }
        }),
      );
    },
  };
}
export class TokenIssuer {
  private issuer: privateVerif.Issuer;
  constructor(
    public manifest: Manifest,
    privateKey: Uint8Array,
  ) {
    this.issuer = new privateVerif.Issuer(
      manifest.issuer,
      privateKey,
      unb64(manifest.publicKey),
    );
  }
  async evaluate(requests: string[]) {
    const expected = unb64(this.manifest.activeKeyId).at(-1);
    return Promise.all(
      requests.map(async (request) => {
        try {
          const bytes = unb64(request);
          if (bytes.length !== 52) throw new Error("length");
          const parsed = privateVerif.TokenRequest.deserialize(bytes);
          if (parsed.truncatedTokenKeyId !== expected) throw new Error("key");
          return b64((await this.issuer.issue(parsed)).serialize());
        } catch {
          throw new BlindPassError("INVALID_TOKEN");
        }
      }),
    );
  }
  async verify(
    raw: string,
    now = Date.now(),
    tokenClass = this.manifest.tokenClass,
  ) {
    let token: Token;
    try {
      const bytes = unb64(raw);
      if (bytes.length !== 146 || b64(bytes) !== raw)
        throw new Error("noncanonical");
      token = Token.deserialize(TOKEN_TYPES.VOPRF, bytes);
      if (!(await this.issuer.verify(token))) throw new Error("authenticator");
    } catch {
      throw new BlindPassError("INVALID_TOKEN", 401);
    }
    if (b64(token.authInput.tokenKeyId) !== this.manifest.activeKeyId)
      throw new BlindPassError("WRONG_ISSUER_EPOCH", 401);
    if (now >= Date.parse(this.manifest.expiresAt))
      throw new BlindPassError("TOKEN_EXPIRED", 401);
    if (now < Date.parse(this.manifest.validFrom))
      throw new BlindPassError("WRONG_ISSUER_EPOCH", 401);
    if (tokenClass !== this.manifest.tokenClass)
      throw new BlindPassError("WRONG_TOKEN_CLASS", 401);
    const expected = await sha256(
      (await challengeFor(this.manifest)).serialize(),
    );
    if (b64(token.authInput.challengeDigest) !== expected)
      throw new BlindPassError("WRONG_TOKEN_CLASS", 401);
    return token;
  }
}
export function authorization(credential: StoredCredential | string) {
  const raw = typeof credential === "string" ? credential : credential.token;
  return new AuthorizationHeader(
    Token.deserialize(TOKEN_TYPES.VOPRF, unb64(raw)),
  ).toString(true);
}
export function parseAuthorization(header?: string): string {
  if (!header)
    throw new BlindPassError(
      "INVALID_TOKEN",
      401,
      "A single-use private credit is required.",
    );
  // Validate the canonical wire length before the library parser; its deserializer permits trailing bytes.
  const match =
    /^PrivateToken\s+token="([A-Za-z0-9_-]+={0,2})"(?:\s*,\s*[a-zA-Z][a-zA-Z0-9_-]*=(?:"[^"\r\n]*"|[^,\s]+))*$/i.exec(
      header,
    );
  try {
    if (
      !match ||
      unb64(match[1]).length !== 146 ||
      b64(unb64(match[1])) !== match[1]
    )
      throw new Error("encoding");
  } catch {
    throw new BlindPassError("INVALID_TOKEN", 401);
  }
  if (!match) throw new BlindPassError("INVALID_TOKEN", 401);
  return match[1];
}
export async function spentHash(raw: string) {
  const prefix = new TextEncoder().encode("blindpass-spent-token-v1");
  const token = unb64(raw);
  const bytes = new Uint8Array(prefix.length + token.length);
  bytes.set(prefix);
  bytes.set(token, prefix.length);
  return sha256(bytes);
}
export async function wwwAuthenticate(manifest: Manifest) {
  return new WWWAuthenticateHeader(
    await challengeFor(manifest),
    unb64(manifest.publicKey),
  ).toString();
}
