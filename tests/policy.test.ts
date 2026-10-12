import { beforeAll, afterAll, it, expect } from "vitest";
import { testDatabase } from "./database.js";
import { createApp } from "../apps/api/src/app.js";
import {
  BlindPassClient,
  MemoryStore,
  validateConfiguration,
} from "../packages/blindpass-client/src/index.js";
import {
  fingerprint,
  verifySignature,
  type SignedManifest,
} from "../packages/shared/src/index.js";
let database: Awaited<ReturnType<typeof testDatabase>>;
let runtime: Awaited<ReturnType<typeof createApp>>;
beforeAll(async () => {
  database = await testDatabase();
  runtime = await createApp({ database });
});
afterAll(async () => {
  await runtime?.app.close();
  await database?.cleanup();
});
it.each([
  ["key", "CONFIGURATION_CHANGED"],
  ["expiry", "INVALID_DATES"],
  ["class", "UNSUPPORTED_POLICY"],
  ["key-id", "INVALID_KEY_ID"],
])(
  "rejects malicious merchant-signed %s configuration",
  async (kind, reason) => {
    const response = await runtime.app.inject(
      `/api/dev/malicious-config/${kind}`,
    );
    expect(response.statusCode).toBe(200);
    const config = response.json<SignedManifest>();
    expect(
      await verifySignature(
        config.manifest,
        config.signature,
        config.signingPublicKey,
      ),
    ).toBe(true);
    await expect(
      validateConfiguration(config, {
        issuer: runtime.keys.manifest.issuer,
        fingerprint: await fingerprint(runtime.keys.signingPublicKey),
        previous: runtime.keys.signedManifest,
      }),
    ).rejects.toMatchObject({ code: "ISSUER_POLICY_VIOLATION", reason });
  },
);
it("accepts common policy and rejects a wrong pinned merchant identity", async () => {
  const config = runtime.keys.signedManifest;
  await expect(
    validateConfiguration(config, {
      issuer: config.manifest.issuer,
      previous: config,
    }),
  ).resolves.toEqual(config);
  await expect(
    validateConfiguration(config, {
      issuer: config.manifest.issuer,
      fingerprint: "wrong",
    }),
  ).rejects.toMatchObject({
    code: "ISSUER_POLICY_VIOLATION",
    reason: "IDENTITY_MISMATCH",
  });
});
it("distinguishes address and clock mismatches from invalid signatures", async () => {
  const config = runtime.keys.signedManifest;
  await expect(
    validateConfiguration(config, { issuer: "127.0.0.1:3000" }),
  ).rejects.toMatchObject({
    reason: "ISSUER_MISMATCH",
    message: expect.stringContaining('Expected issuer "127.0.0.1:3000"'),
  });
  await expect(
    validateConfiguration(config, {
      issuer: config.manifest.issuer,
      epoch: config.manifest.epoch === "2020-01" ? "2020-02" : "2020-01",
    }),
  ).rejects.toMatchObject({ reason: "EPOCH_MISMATCH" });
  await expect(
    validateConfiguration(
      { ...config, signature: "invalid" },
      { issuer: config.manifest.issuer },
    ),
  ).rejects.toMatchObject({ reason: "INVALID_SIGNATURE" });
  await expect(
    validateConfiguration({} as SignedManifest, {
      issuer: config.manifest.issuer,
    }),
  ).rejects.toMatchObject({ reason: "INVALID_CONFIGURATION" });
});
it.each(["identity", "configuration"])(
  "blocks purchases and preserves the complete wallet when the trusted %s changes",
  async (kind) => {
    const store = new MemoryStore();
    const state = await store.load();
    state.configuration = structuredClone(runtime.keys.signedManifest);
    state.trustedFingerprint = await fingerprint(runtime.keys.signingPublicKey);
    state.credentials = [
      {
        token: "saved-credit",
        epoch: runtime.keys.manifest.epoch,
        expiresAt: runtime.keys.manifest.expiresAt,
        tokenClass: "search-v1",
      },
    ];
    state.used = 2;
    if (kind === "identity") state.trustedFingerprint = "previous-identity";
    else state.configuration.manifest.activeKeyId = "previous-monthly-key";
    await store.save(state);
    const requests: string[] = [];
    const client = new BlindPassClient({
      baseUrl: "http://localhost:3000",
      issuer: runtime.keys.manifest.issuer,
      store,
      transport: async (url) => {
        requests.push(new URL(url).pathname);
        return Response.json(runtime.keys.signedManifest);
      },
    });
    await expect(client.buy()).rejects.toMatchObject({
      code: "ISSUER_POLICY_VIOLATION",
      reason:
        kind === "identity" ? "IDENTITY_MISMATCH" : "CONFIGURATION_CHANGED",
    });
    expect(requests).toEqual(["/.well-known/private-token-issuer-directory"]);
    expect(await store.load()).toEqual(state);
  },
);
