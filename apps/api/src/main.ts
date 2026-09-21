import "dotenv/config";
import { createApp } from "./app.js";
const { app } = await createApp({ logger: true });
await app.listen({
  port: Number(process.env.API_PORT ?? 3001),
  host: "0.0.0.0",
});
console.log(
  "BlindPass API ready. Payment mode:",
  process.env.ZCASH_PAYMENT_MODE ?? "mock",
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
