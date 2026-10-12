import { it, expect, vi } from "vitest";
import { createApp } from "../apps/api/src/app.js";
import {
  keyGen,
  createBlindBatch,
  authorization,
} from "../packages/privacy-pass/src/index.js";
import {
  currentEpoch,
  b64,
  canonical,
  sha256,
} from "../packages/shared/src/index.js";
import { testDatabase } from "./database.js";
it("rotates provisioned keys, retains existing credits, and recovers a committed old-epoch transcript", async () => {
  const original = process.env.PRIVACYPASS_ISSUER_KEYS;
  const now = new Date();
  const before = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 55),
  );
  const after = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 1),
  );
  const database = await testDatabase();
  let runtime: Awaited<ReturnType<typeof createApp>> | undefined;
  try {
    process.env.PRIVACYPASS_ISSUER_KEYS = JSON.stringify({
      [before.toISOString().slice(0, 7)]: b64((await keyGen()).privateKey),
      [after.toISOString().slice(0, 7)]: b64((await keyGen()).privateKey),
    });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(before);
    runtime = await createApp({ database });
    const old = runtime.keys.manifest;
    const invoice = await runtime.invoiceService.create("search-10");
    await runtime.invoiceService.payment({
      eventId: "month-boundary-payment",
      invoiceId: invoice.id,
      txid: "month-boundary-transaction",
      amount: "0.01",
      blockHeight: 1,
      confirmations: 3,
      reorg: false,
    });
    const batch = await createBlindBatch(old);
    const hash = await sha256(canonical(old));
    const first = await runtime.issuance.issue(
      invoice.capability!,
      batch.requests,
      hash,
    );
    vi.setSystemTime(after);
    expect((await runtime.app.inject("/api/health")).statusCode).toBe(503);
    await runtime.rotateEpoch();
    expect(runtime.keys.manifest.epoch).toBe(currentEpoch());
    expect(runtime.keys.manifest.epoch).not.toBe(old.epoch);
    expect((await runtime.app.inject("/api/health")).statusCode).toBe(200);
    const retry = await runtime.issuance.issue(
      invoice.capability!,
      batch.requests,
      hash,
    );
    expect(retry).toEqual(first);
    const [credit] = await batch.finalize(retry.responses);
    expect(
      await runtime.redemption.redeem(
        authorization(credit),
        async () => "old credit accepted",
      ),
    ).toBe("old credit accepted");
  } finally {
    vi.useRealTimers();
    await runtime?.app.close();
    await database.cleanup();
    if (original === undefined) delete process.env.PRIVACYPASS_ISSUER_KEYS;
    else process.env.PRIVACYPASS_ISSUER_KEYS = original;
  }
});
