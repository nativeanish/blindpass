import "./provider.ts";
import {
  AuthenticatorInput,
  Token,
  TOKEN_TYPES,
  privateVerif,
} from "@cloudflare/privacypass-ts";
import {
  VOPRFClient,
  FinalizeData,
  Evaluation,
  DLEQProof,
  Oprf,
} from "@cloudflare/voprf-ts";
import {
  b64,
  unb64,
  sha256,
  BlindPassError,
  type Manifest,
  type StoredCredential,
} from "@blindpass/shared";
import { challengeFor } from "./index.ts";

// Only public library APIs are used. The serialized blinding data is a secret:
// persist it in an encrypted local vault, never send it to the issuer.
export interface RecoverableBatch {
  version: 1;
  requests: string[];
  finalizeData: string[];
}
export async function createRecoverableBatch(
  manifest: Manifest,
): Promise<RecoverableBatch> {
  const type = TOKEN_TYPES.VOPRF;
  const challengeDigest = unb64(
    await sha256((await challengeFor(manifest)).serialize()),
  );
  const keyId = unb64(await sha256(unb64(manifest.publicKey)));
  const client = new VOPRFClient(type.suite, unb64(manifest.publicKey));
  const entries = await Promise.all(
    Array.from({ length: manifest.batchSize }, async () => {
      const input = new AuthenticatorInput(
        type,
        type.value,
        crypto.getRandomValues(new Uint8Array(32)),
        challengeDigest,
        keyId,
      );
      const [data, request] = await client.blind([input.serialize()]);
      return {
        request: b64(
          new privateVerif.TokenRequest(
            keyId.at(-1)!,
            request.blinded[0].serialize(),
          ).serialize(),
        ),
        data: b64(data.serialize()),
      };
    }),
  );
  return {
    version: 1,
    requests: entries.map((e) => e.request),
    finalizeData: entries.map((e) => e.data),
  };
}
export async function finalizeRecoverableBatch(
  manifest: Manifest,
  batch: RecoverableBatch,
  responses: string[],
): Promise<StoredCredential[]> {
  try {
    if (
      batch.version !== 1 ||
      batch.requests.length !== manifest.batchSize ||
      batch.finalizeData.length !== manifest.batchSize ||
      responses.length !== manifest.batchSize
    )
      throw new Error("Invalid batch size");
    const type = TOKEN_TYPES.VOPRF;
    const client = new VOPRFClient(type.suite, unb64(manifest.publicKey));
    const challengeDigest = await sha256(
      (await challengeFor(manifest)).serialize(),
    );
    const keyId = await sha256(unb64(manifest.publicKey));
    return await Promise.all(
      responses.map(async (response, i) => {
        const bytes = unb64(response);
        if (bytes.length !== 145) throw new Error("Invalid response size");
        const data = FinalizeData.deserialize(
          type.suite,
          unb64(batch.finalizeData[i]),
        );
        if (
          data.inputs.length !== 1 ||
          data.blinds.length !== 1 ||
          data.evalReq.blinded.length !== 1
        )
          throw new Error("Invalid finalization state");
        const input = AuthenticatorInput.deserialize(
          type,
          Uint8Array.from(data.inputs[0]),
          {
            bytesRead: 0,
          },
        );
        if (
          data.inputs[0].length !== 98 ||
          b64(input.challengeDigest) !== challengeDigest ||
          b64(input.tokenKeyId) !== keyId
        )
          throw new Error("Invalid token context");
        const request = new privateVerif.TokenRequest(
          unb64(keyId).at(-1)!,
          data.evalReq.blinded[0].serialize(),
        );
        if (b64(request.serialize()) !== batch.requests[i])
          throw new Error("Recovery transcript mismatch");
        const parsed = privateVerif.TokenResponse.deserialize(bytes);
        const evaluation = new Evaluation(
          Oprf.Mode.VOPRF,
          [client.group.desElt(parsed.evaluateMsg)],
          DLEQProof.deserialize(client.group.id, parsed.evaluateProof),
        );
        const [authenticator] = await client.finalize(data, evaluation);
        return {
          token: b64(new Token(type, input, authenticator).serialize()),
          epoch: manifest.epoch,
          tokenClass: manifest.tokenClass,
          expiresAt: manifest.expiresAt,
        };
      }),
    );
  } catch {
    throw new BlindPassError(
      "INVALID_TOKEN",
      400,
      "Unable to verify the recovered batch. Your recovery state has been kept; no credits were stored.",
    );
  }
}
