import { it, expect } from "vitest";
import { config, assertProductionConfig } from "../apps/api/src/config.js";
import { createApp } from "../apps/api/src/app.js";
import { keyGen } from "../packages/privacy-pass/src/index.js";
import { b64, currentEpoch } from "../packages/shared/src/index.js";
import { MockPaymentWatcher } from "../packages/zcash/src/index.js";
import { testDatabase } from "./database.js";

it("requires production secrets, forbids mock payments and omits debug routes", async () => {
  const originalConfig = { ...config };
  const envKeys = [
    "MERCHANT_CONFIG_PRIVATE_KEY",
    "MERCHANT_CONFIG_PUBLIC_KEY",
    "PRIVACYPASS_ISSUER_SECRET",
    "PRIVACYPASS_ISSUER_EPOCH",
    "ZCASH_SCANNER_URL",
    "ZCASH_SCANNER_API_KEY",
    "ZCASH_WEBHOOK_SECRET",
    "ISSUER_ORIGIN",
  ];
  const originalEnv = Object.fromEntries(
    envKeys.map((k) => [k, process.env[k]]),
  );
  let database: Awaited<ReturnType<typeof testDatabase>> | undefined;
  let runtime: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    config.BLINDPASS_ENV = "production";
    delete process.env.MERCHANT_CONFIG_PRIVATE_KEY;
    expect(assertProductionConfig).toThrow("MERCHANT_CONFIG_PRIVATE_KEY");
    const signing = await crypto.subtle.generateKey("Ed25519", true, [
      "sign",
      "verify",
    ]);
    Object.assign(process.env, {
      MERCHANT_CONFIG_PRIVATE_KEY: b64(
        new Uint8Array(
          await crypto.subtle.exportKey("pkcs8", signing.privateKey),
        ),
      ),
      MERCHANT_CONFIG_PUBLIC_KEY: b64(
        new Uint8Array(await crypto.subtle.exportKey("raw", signing.publicKey)),
      ),
      PRIVACYPASS_ISSUER_SECRET: b64((await keyGen()).privateKey),
      PRIVACYPASS_ISSUER_EPOCH: currentEpoch(),
      ZCASH_SCANNER_URL: "https://scanner.example",
      ZCASH_SCANNER_API_KEY: "test-only",
      ZCASH_WEBHOOK_SECRET: "test-only",
      ISSUER_ORIGIN: "search.example",
    });
    config.ISSUER_ORIGIN = "search.example";
    config.ZCASH_PAYMENT_MODE = "mock";
    expect(assertProductionConfig).toThrow("cannot simulate");
    config.ZCASH_PAYMENT_MODE = "scanner";
    database = await testDatabase();
    // A dependency-injected watcher prevents external network access in this route-registration test.
    runtime = await createApp({ database, watcher: new MockPaymentWatcher() });
    expect(
      (
        await runtime.app.inject({
          url: "/api/offers",
          headers: { origin: "http://localhost:3000" },
        })
      ).statusCode,
    ).toBe(403);
    for (const url of ["/api/admin/stats", "/api/dev/malicious-config/key"]) {
      expect((await runtime.app.inject(url)).statusCode).toBe(404);
    }
    expect(
      (
        await runtime.app.inject({
          method: "POST",
          url: "/api/dev/pay/00000000-0000-4000-8000-000000000000",
          payload: {},
        })
      ).statusCode,
    ).toBe(404);
  } finally {
    await runtime?.app.close();
    await database?.cleanup();
    Object.assign(config, originalConfig);
    for (const key of envKeys) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  }
});
