import { beforeAll, afterAll, it, expect } from "vitest";
import { testDatabase } from "./database.js";
import { createApp } from "../apps/api/src/app.js";
import {
  createBlindBatch,
  authorization,
} from "../packages/privacy-pass/src/index.js";
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
it("requires valid, unspent credits and returns real local search results", async () => {
  const missing = await runtime.app.inject("/api/search?q=privacy");
  expect(missing.statusCode).toBe(401);
  expect(missing.headers["www-authenticate"]).toContain("PrivateToken");
  const bad = await runtime.app.inject({
    url: "/api/search?q=privacy",
    headers: { authorization: 'PrivateToken token="BAD"' },
  });
  expect(bad.json().error.code).toBe("INVALID_TOKEN");
  const batch = await createBlindBatch(runtime.keys.manifest, 1);
  const [token] = await batch.finalize(
    await runtime.keys.issuer.evaluate(batch.requests),
  );
  const headers = { authorization: authorization(token) };
  const invalidQuery = await runtime.app.inject({
    url: "/api/search?q=",
    headers,
  });
  expect(invalidQuery.statusCode).toBe(400);
  const results = await Promise.all(
    Array.from({ length: 20 }, () =>
      runtime.app.inject({ url: "/api/search?q=privacy", headers }),
    ),
  );
  const success = results.filter((r) => r.statusCode === 200);
  expect(success).toHaveLength(1);
  expect(success[0].json().results.length).toBeGreaterThan(0);
  expect(success[0].json().creditConsumed).toBe(true);
  expect(
    results.filter((r) => r.json().error?.code === "TOKEN_ALREADY_SPENT"),
  ).toHaveLength(19);
  const columns =
    await database.sql`SELECT column_name FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='redeemed_tokens'`;
  expect(columns.map((c) => c.column_name)).not.toContain("invoice_id");
});
it("releases the reservation when local search fails before returning work", async () => {
  const batch = await createBlindBatch(runtime.keys.manifest, 1);
  const [token] = await batch.finalize(
    await runtime.keys.issuer.evaluate(batch.requests),
  );
  const headers = { authorization: authorization(token) };
  await database.sql`ALTER TABLE search_documents RENAME TO unavailable_search_documents`;
  try {
    const failed = await runtime.app.inject({
      url: "/api/search?q=privacy",
      headers,
    });
    expect(failed.statusCode).toBe(503);
    expect(failed.json().error.code).toBe("SERVICE_TEMPORARILY_UNAVAILABLE");
  } finally {
    await database.sql`ALTER TABLE unavailable_search_documents RENAME TO search_documents`;
  }
  const retry = await runtime.app.inject({
    url: "/api/search?q=privacy",
    headers,
  });
  expect(retry.statusCode).toBe(200);
});
