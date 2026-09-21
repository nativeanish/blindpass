import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { availableParallelism } from "node:os";
import {
  createBlindBatch,
  authorization,
} from "../packages/privacy-pass/src/index.js";
import { cryptoFixture } from "./helpers.js";
import { testDatabase } from "./database.js";
import { RedemptionService } from "../packages/blindpass-server/src/index.js";
if (process.env.STRESS_WORKER) {
  const f = await cryptoFixture();
  const database = await testDatabase();
  const { sql } = database;
  const service = new RedemptionService(sql, [f.issuer]);
  const total = Number(process.env.STRESS_TOKENS);
  try {
    for (let issued = 0; issued < total; issued += 10) {
      const count = Math.min(10, total - issued);
      const batch = await createBlindBatch(f.manifest, count);
      const tokens = await batch.finalize(
        await f.issuer.evaluate(batch.requests),
      );
      for (const token of tokens)
        await service.redeem(authorization(token), async () => true);
      process.send?.(count);
    }
  } finally {
    await database.cleanup();
  }
} else {
  const total = Number(process.env.STRESS_TOKENS ?? 10000);
  const start = Date.now();
  const workers = Math.min(16, availableParallelism());
  let completed = 0;
  let next = 1000;
  await Promise.all(
    Array.from(
      { length: workers },
      (_, i) =>
        new Promise<void>((resolve, reject) => {
          const count =
            Math.floor(total / workers) + (i < total % workers ? 1 : 0);
          const child = fork(fileURLToPath(import.meta.url), [], {
            execArgv: ["--import", "tsx"],
            env: {
              ...process.env,
              STRESS_WORKER: "1",
              STRESS_TOKENS: String(count),
            },
            stdio: ["ignore", "ignore", "inherit", "ipc"],
          });
          child.on("message", (n: number) => {
            completed += n;
            if (completed >= next) {
              console.log(
                `${completed}/${total} real issue + PostgreSQL redemption cycles passed`,
              );
              next += 1000;
            }
          });
          child.on("error", reject);
          child.on("exit", (code) =>
            code === 0
              ? resolve()
              : reject(new Error(`Crypto stress worker failed: ${code}`)),
          );
        }),
    ),
  );
  if (completed !== total) throw new Error("Incomplete stress test");
  console.log(
    `PASS: ${total} RFC 9578 issue/redeem cycles in ${((Date.now() - start) / 1000).toFixed(1)}s`,
  );
}
