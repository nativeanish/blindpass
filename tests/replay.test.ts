import { it, expect } from "vitest";
import { testDatabase } from "./database.js";
import { RedemptionService } from "../packages/blindpass-server/src/index.js";
import {
  createBlindBatch,
  authorization,
} from "../packages/privacy-pass/src/index.js";
import { cryptoFixture } from "./helpers.js";
it("allows exactly one of 20 concurrent redemptions and rolls back failed work", async () => {
  const database = await testDatabase();
  const { sql } = database;
  try {
    const f = await cryptoFixture();
    const batch = await createBlindBatch(f.manifest, 2);
    const tokens = await batch.finalize(
      await f.issuer.evaluate(batch.requests),
    );
    const service = new RedemptionService(sql, [f.issuer]);
    let calls = 0;
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        service.redeem(authorization(tokens[0]), async () => {
          calls++;
          return "result";
        }),
      ),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(calls).toBe(1);
    for (const r of results)
      if (r.status === "rejected")
        expect(r.reason.code).toBe("TOKEN_ALREADY_SPENT");
    await expect(
      service.redeem(authorization(tokens[1]), async () => {
        throw new Error("before work");
      }),
    ).rejects.toThrow("before work");
    await expect(
      service.redeem(authorization(tokens[1]), async () => "retry"),
    ).resolves.toBe("retry");
  } finally {
    await database.cleanup();
  }
});
