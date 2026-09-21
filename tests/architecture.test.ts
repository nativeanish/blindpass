import { readFile } from "node:fs/promises";
import { it, expect } from "vitest";
it("never joins invoice data in redemption and stores no raw token or identity fields", async () => {
  const schema = await readFile(
    new URL("../infra/migrations/001_initial.sql", import.meta.url),
    "utf8",
  );
  const table = schema.match(
    /CREATE TABLE IF NOT EXISTS redeemed_tokens \((.*?)\);/s,
  )?.[1];
  expect(table).toBeDefined();
  for (const forbidden of [
    "invoice_id",
    "user_id",
    "client_id",
    "query",
    "address",
    "raw_token",
  ])
    expect(table).not.toContain(forbidden);
  const source = await readFile(
    new URL("../packages/blindpass-server/src/index.ts", import.meta.url),
    "utf8",
  );
  expect(source).not.toMatch(/(?:FROM|JOIN|UPDATE)\s+invoices/i);
  expect(source).not.toContain("issuance_authorizations");
});
