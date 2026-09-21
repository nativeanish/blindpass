import { beforeAll, afterAll, it, expect } from "vitest";
import { createApp } from "../apps/api/src/app.js";
import { testDatabase } from "./database.js";
import { createBlindBatch } from "../packages/privacy-pass/src/index.js";
import {
  canonical,
  sha256,
  type Invoice,
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
async function invoice() {
  const r = await runtime.app.inject({
    method: "POST",
    url: "/api/invoices",
    payload: { offerId: "search-10" },
  });
  expect(r.statusCode).toBe(201);
  return r.json<Invoice>();
}
async function pay(id: string, confirmations = 3, reorg = false) {
  return runtime.app.inject({
    method: "POST",
    url: `/api/dev/pay/${id}`,
    payload: { confirmations, reorg },
  });
}
it("issues only after confirmed payment; retries the same transcript but refuses another batch", async () => {
  const inv = await invoice();
  const batch = await createBlindBatch(runtime.keys.manifest);
  const payload = {
    capability: inv.capability,
    requests: batch.requests,
    configurationHash: await sha256(canonical(runtime.keys.manifest)),
  };
  const pending = await runtime.app.inject({
    method: "POST",
    url: "/api/issuance",
    payload,
  });
  expect(pending.json().error.code).toBe("PAYMENT_NOT_CONFIRMED");
  await pay(inv.id, 0);
  expect((await runtime.invoiceService.get(inv.capability!)).status).toBe(
    "PAYMENT_DETECTED",
  );
  await pay(inv.id, 1);
  expect((await runtime.invoiceService.get(inv.capability!)).status).toBe(
    "WAITING_FOR_CONFIRMATION",
  );
  await pay(inv.id);
  expect((await runtime.invoiceService.get(inv.capability!)).status).toBe(
    "PAYMENT_CONFIRMED",
  );
  const response = await runtime.app.inject({
    method: "POST",
    url: "/api/issuance",
    payload,
  });
  expect(response.statusCode).toBe(200);
  const tokens = await batch.finalize(response.json().responses);
  expect(tokens).toHaveLength(10);
  for (const token of tokens) await runtime.keys.issuer.verify(token.token);
  const retry = await runtime.app.inject({
    method: "POST",
    url: "/api/issuance",
    payload,
  });
  expect(retry.json()).toEqual(response.json());
  const next = await createBlindBatch(runtime.keys.manifest);
  const duplicate = await runtime.app.inject({
    method: "POST",
    url: "/api/issuance",
    payload: { ...payload, requests: next.requests },
  });
  expect(duplicate.json().error.code).toBe("ISSUANCE_ALREADY_COMPLETED");
  const rows =
    await database.sql`SELECT * FROM issuance_authorizations WHERE invoice_id=${inv.id}`;
  expect(rows[0].issued_count).toBe(10);
  expect(JSON.stringify(rows)).not.toContain(tokens[0].token);
});
it("handles duplicate events, reorgs and expiry", async () => {
  const inv = await invoice();
  await pay(inv.id);
  await pay(inv.id);
  const [count] =
    await database.sql`SELECT count(*)::int AS n FROM invoice_payment_events WHERE invoice_id=${inv.id}`;
  expect(count.n).toBe(1);
  await pay(inv.id, 0, true);
  expect((await runtime.invoiceService.get(inv.capability!)).status).toBe(
    "PAYMENT_REORGED",
  );
  expect(
    await database.sql`SELECT * FROM issuance_authorizations WHERE invoice_id=${inv.id}`,
  ).toHaveLength(0);
  const expired = await invoice();
  await database.sql`UPDATE invoices SET expires_at=now()-interval '1 minute' WHERE id=${expired.id}`;
  await pay(expired.id);
  expect((await runtime.invoiceService.get(expired.capability!)).status).toBe(
    "EXPIRED",
  );
});
it("requires a secret capability and rejects invalid requests without sensitive data", async () => {
  const inv = await invoice();
  expect((await runtime.app.inject(`/api/invoices/${inv.id}`)).statusCode).toBe(
    404,
  );
  const result = await runtime.app.inject({
    method: "POST",
    url: "/api/invoices",
    payload: { offerId: "not-an-offer" },
  });
  expect(result.statusCode).toBe(400);
  expect(result.body).not.toContain("stack");
});
