import { it, expect } from "vitest";
import { config } from "../apps/api/src/config.js";
import { createApp } from "../apps/api/src/app.js";
import { testDatabase } from "./database.js";
import { applyMigrations } from "../scripts/migrate.js";
it("enforces aggregate budgets, protects operations, preserves HTTP errors, and keeps readiness reachable", async () => {
  const original = config.RATE_LIMIT_PER_MINUTE;
  const originalKey = process.env.OPERATOR_API_KEY;
  config.RATE_LIMIT_PER_MINUTE = 2;
  process.env.OPERATOR_API_KEY = "test-operator-token-with-32-characters";
  const database = await testDatabase();
  const runtime = await createApp({ database });
  try {
    expect((await runtime.app.inject("/api/offers")).statusCode).toBe(200);
    expect((await runtime.app.inject("/api/offers")).statusCode).toBe(200);
    const limited = await runtime.app.inject("/api/offers");
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.code).toBe("RATE_LIMITED");
    expect(limited.headers["retry-after"]).toBeDefined();
    expect((await runtime.app.inject("/api/live")).statusCode).toBe(200);
    expect((await runtime.app.inject("/api/health")).statusCode).toBe(200);
    expect((await runtime.app.inject("/api/ops/status")).statusCode).toBe(401);
    const ops = await runtime.app.inject({
      url: "/api/ops/status",
      headers: { authorization: `Bearer ${process.env.OPERATOR_API_KEY}` },
    });
    expect(ops.statusCode).toBe(200);
    expect(ops.json().totals).toEqual({
      invoices: 0,
      payments: 0,
      issued: 0,
      redeemed: 0,
    });
    expect(ops.body).not.toMatch(
      /capability|paymentAddress|privateKey|credentials/,
    );
    const tooLarge = await runtime.app.inject({
      method: "POST",
      url: "/api/invoices",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ large: "a".repeat(40000) }),
    });
    expect(tooLarge.statusCode).toBe(413);
    await applyMigrations(database.sql);
    const migrations = await database.sql`SELECT name FROM schema_migrations`;
    expect(migrations).toHaveLength(2);
  } finally {
    await runtime.app.close();
    await database.cleanup();
    config.RATE_LIMIT_PER_MINUTE = original;
    if (originalKey) process.env.OPERATOR_API_KEY = originalKey;
    else delete process.env.OPERATOR_API_KEY;
  }
});
