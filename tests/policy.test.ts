import { beforeAll, afterAll, it, expect } from "vitest";
import { testDatabase } from "./database.js";
import { createApp } from "../apps/api/src/app.js";
import { validateConfiguration } from "../packages/blindpass-client/src/index.js";
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
it.each(["key", "expiry", "class", "key-id"])(
  "rejects malicious merchant-signed %s configuration",
  async (kind) => {
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
    ).rejects.toMatchObject({ code: "ISSUER_POLICY_VIOLATION" });
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
  ).rejects.toMatchObject({ code: "ISSUER_POLICY_VIOLATION" });
});
