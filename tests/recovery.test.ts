import "../packages/privacy-pass/src/provider.js";
import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { VOPRFClient, Oprf } from "@cloudflare/voprf-ts";
import { TOKEN_TYPES } from "@cloudflare/privacypass-ts";
import {
  createRecoverableBatch,
  finalizeRecoverableBatch,
  createBlindBatch,
} from "../packages/privacy-pass/src/index.js";
import {
  BlindPassClient,
  MemoryStore,
  type Transport,
} from "../packages/blindpass-client/src/index.js";
import { createApp } from "../apps/api/src/app.js";
import { testDatabase } from "./database.js";
import { cryptoFixture } from "./helpers.js";
import { unb64, b64 } from "../packages/shared/src/index.js";
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
const transport: Transport = async (url, init) => {
  const result = await runtime.app.inject({
    method: (init?.method ?? "GET") as "GET" | "POST",
    url: new URL(url).pathname + new URL(url).search,
    headers: init?.headers as Record<string, string>,
    payload: init?.body as string,
  });
  return new Response(result.body, {
    status: result.statusCode,
    headers: { "Content-Type": "application/json" },
  });
};
function client(store = new MemoryStore(), send = transport) {
  return new BlindPassClient({
    baseUrl: "http://localhost:3000",
    issuer: "localhost:3000",
    store,
    transport: send,
  });
}
async function paid(sdk: BlindPassClient) {
  const invoice = await sdk.buy();
  await runtime.app.inject({
    method: "POST",
    url: `/api/dev/pay/${invoice.id}`,
    payload: {},
  });
  return invoice;
}
it("recoverable bytes match the upstream Privacy Pass client using identical nonce and blinder inputs", async () => {
  const { manifest, issuer } = await cryptoFixture();
  const nonce = vi.spyOn(crypto, "getRandomValues");
  const blind = vi
    .spyOn(VOPRFClient.prototype, "randomBlinder")
    .mockResolvedValue(
      Oprf.getGroup(TOKEN_TYPES.VOPRF.suite).desScalar(
        Uint8Array.from({ length: 48 }, (_, i) => (i === 47 ? 1 : 0)),
      ),
    );
  const seedNonces = () => {
    for (let i = 0; i < 10; i++)
      nonce.mockReturnValueOnce(new Uint8Array(32).fill(i + 1));
  };
  try {
    seedNonces();
    const upstream = await createBlindBatch(manifest);
    seedNonces();
    const durable = await createRecoverableBatch(manifest);
    expect(durable.requests).toEqual(upstream.requests);
    const responses = await issuer.evaluate(upstream.requests);
    const expected = await upstream.finalize(responses);
    expect(
      await finalizeRecoverableBatch(
        manifest,
        JSON.parse(JSON.stringify(durable)),
        responses,
      ),
    ).toEqual(expected);
    const corrupt = unb64(responses[0]);
    corrupt[100] ^= 1;
    await expect(
      finalizeRecoverableBatch(manifest, durable, [
        b64(corrupt),
        ...responses.slice(1),
      ]),
    ).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  } finally {
    nonce.mockRestore();
    blind.mockRestore();
  }
});
it("survives issuer commit and a lost response, resumes after client restart, and stores one batch under concurrent retries", async () => {
  const store = new MemoryStore();
  const sdk = client(store, async (url, init) => {
    const result = await transport(url, init);
    if (url.endsWith("/api/issuance"))
      throw new TypeError("connection lost after commit");
    return result;
  });
  const invoice = await paid(sdk);
  await expect(sdk.issue(invoice)).rejects.toThrow("connection lost");
  expect((await store.load()).pendingIssuance?.[invoice.id]).toBeDefined();
  expect((await runtime.invoiceService.get(invoice.capability!)).status).toBe(
    "CREDITS_READY",
  );
  const restarted = client(store);
  await restarted.invoice(invoice.capability!);
  expect((await store.load()).invoices[0].status).toBe(
    "ISSUING_PRIVATE_CREDITS",
  );
  await Promise.all([restarted.issue(invoice), restarted.issue(invoice)]);
  expect((await restarted.balance()).remaining).toBe(10);
  expect(Object.keys((await store.load()).pendingIssuance ?? {})).toHaveLength(
    0,
  );
  expect((await restarted.search("privacy")).creditConsumed).toBe(true);
  expect((await restarted.balance()).remaining).toBe(9);
});
it("keeps durable recovery state if local credit storage fails after successful issuance", async () => {
  const store = new MemoryStore();
  const sdk = client(store);
  const invoice = await paid(sdk);
  const save = store.save.bind(store);
  const failure = vi.spyOn(store, "save").mockImplementation(async (state) => {
    if (state.credentials.length) throw new Error("disk full");
    await save(state);
  });
  await expect(sdk.issue(invoice)).rejects.toThrow("disk full");
  failure.mockRestore();
  expect((await store.load()).pendingIssuance?.[invoice.id]).toBeDefined();
  await client(store).issue(invoice);
  expect((await sdk.balance()).remaining).toBe(10);
});
it("restores encrypted backups and rejects wrong passwords, origins, tampering, and nonempty wallets", async () => {
  const store = new MemoryStore();
  const sdk = client(store);
  const invoice = await paid(sdk);
  await sdk.issue(invoice);
  const password = "a long test passphrase";
  const backup = await sdk.exportBackup(password);
  expect(backup).not.toContain(invoice.capability);
  expect(backup).not.toContain((await store.load()).credentials[0].token);
  const restored = client();
  await restored.restoreBackup(backup, password);
  expect(await restored.balance()).toEqual(await sdk.balance());
  expect((await restored.options.store.load()).lastBackupAt).toBe(
    (await store.load()).lastBackupAt,
  );
  await expect(restored.restoreBackup(backup, password)).rejects.toThrow(
    "empty wallet",
  );
  await expect(
    client().restoreBackup(backup, "wrong passphrase"),
  ).rejects.toThrow("Unable to unlock");
  const wrongOrigin = new BlindPassClient({
    baseUrl: "https://other.example",
    store: new MemoryStore(),
  });
  await expect(wrongOrigin.restoreBackup(backup, password)).rejects.toThrow(
    "different issuer",
  );
  const damaged = JSON.parse(backup);
  damaged.data = damaged.data.replace(
    /^./,
    damaged.data[0] === "A" ? "B" : "A",
  );
  await expect(
    client().restoreBackup(JSON.stringify(damaged), password),
  ).rejects.toThrow("Unable to unlock");
});
it("does not spend a credit for invalid local input or a definite rate limit; quarantines an ambiguous response", async () => {
  const store = new MemoryStore();
  const sdk = client(store);
  await sdk.issue(await paid(sdk));
  await expect(sdk.search(" ")).rejects.toThrow();
  expect((await sdk.balance()).remaining).toBe(10);
  const limited = client(
    store,
    async () =>
      new Response(
        JSON.stringify({ error: { code: "RATE_LIMITED", message: "busy" } }),
        { status: 429 },
      ),
  );
  await expect(limited.search("privacy")).rejects.toThrow("busy");
  expect((await sdk.balance()).remaining).toBe(10);
  const offline = client(store, async () => {
    throw new TypeError("offline");
  });
  await expect(offline.search("privacy")).rejects.toThrow("offline");
  expect(await sdk.balance()).toMatchObject({
    remaining: 9,
    uncertain: 1,
    used: 0,
  });
});

it("recovers pending issuance from an encrypted backup in an empty wallet", async () => {
  const original = client(new MemoryStore(), async (url, init) => {
    const response = await transport(url, init);
    if (url.endsWith("/api/issuance")) throw new TypeError("lost response");
    return response;
  });
  const invoice = await paid(original);
  await expect(original.issue(invoice)).rejects.toThrow("lost response");
  const backup = await original.exportBackup(
    "pending purchase backup passphrase",
  );
  const restored = client();
  await restored.restoreBackup(backup, "pending purchase backup passphrase");
  await restored.issue((await restored.options.store.load()).invoices[0]);
  expect((await restored.balance()).remaining).toBe(10);
});

it("an empty deployment fingerprint cannot bypass a wallet's existing issuer pin", async () => {
  const store = new MemoryStore();
  const state = await store.load();
  state.trustedFingerprint = "previously-trusted-other-issuer";
  await store.save(state);
  const sdk = new BlindPassClient({
    baseUrl: "http://localhost:3000",
    issuer: "localhost:3000",
    expectedFingerprint: "",
    store,
    transport,
  });
  await expect(sdk.configuration()).rejects.toMatchObject({
    code: "ISSUER_POLICY_VIOLATION",
  });
  expect((await store.load()).trustedFingerprint).toBe(
    state.trustedFingerprint,
  );
});
