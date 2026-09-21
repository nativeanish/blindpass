import { it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { ScannerPaymentWatcher } from "../packages/zcash/src/scanner.js";
import { paymentUri, zatoshis } from "../packages/zcash/src/index.js";
const secret = "published-test-webhook-secret-at-least-32-characters";
const fixture = {
  eventId: "fixture-event-1",
  invoiceId: "inv_fixture",
  txid: "fixture-tx-id",
  amount: "0.01",
  blockHeight: 123,
  confirmations: 3,
  reorg: false,
};
it("authenticates exact webhook bytes and rejects bad signatures and stale timestamps", async () => {
  const watcher = new ScannerPaymentWatcher({
    url: "http://localhost:9999",
    apiKey: "test-only",
    webhookSecret: secret,
    network: "testnet",
  });
  let calls = 0;
  watcher.subscribe(async () => {
    calls++;
  });
  const raw = JSON.stringify(fixture);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${raw}`)
    .digest("hex");
  await expect(watcher.webhook(raw, timestamp, signature)).resolves.toEqual({
    accepted: true,
  });
  expect(calls).toBe(1);
  await expect(
    watcher.webhook(raw + " ", timestamp, signature),
  ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  await expect(
    watcher.webhook(raw, "1000000000", signature),
  ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
});
it("requires scanner validation, Orchard, a matching network, and diversified addresses", async () => {
  const transport = (async () =>
    new Response(
      JSON.stringify({
        invoiceId: "inv_fixture",
        address: "test-fixture-address-not-for-payment".repeat(4),
        network: "testnet",
        receiverTypes: ["p2pkh"],
        diversified: true,
        validated: true,
      }),
    )) as typeof fetch;
  const watcher = new ScannerPaymentWatcher(
    {
      url: "http://localhost:9999",
      apiKey: "test-only",
      webhookSecret: secret,
      network: "testnet",
    },
    transport,
  );
  await expect(
    watcher.createInvoice({ invoiceId: "inv_fixture", amount: "0.01" }),
  ).rejects.toMatchObject({ code: "ISSUER_POLICY_VIOLATION" });
});
it("uses fixed decimal amounts with no memo or amount identifiers", () => {
  expect(zatoshis("0.01")).toBe(1000000n);
  expect(zatoshis("0.00000001")).toBe(1n);
  expect(() => zatoshis("0.000000001")).toThrow();
  expect(paymentUri("fixture", "0.01")).toBe("zcash:fixture?amount=0.01");
});
