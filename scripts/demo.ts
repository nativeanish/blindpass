import { spawn } from "node:child_process";
import {
  BlindPassClient,
  MemoryStore,
} from "../packages/blindpass-client/src/index.js";
function command(cmd: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} failed`)),
    );
  });
}
await command("docker", ["compose", "up", "-d", "postgres"]);
const server = spawn("pnpm", ["dev"], { stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    server.kill(signal);
    process.exit(0);
  });
let ready = false;
for (let i = 0; i < 60; i++) {
  try {
    const result = await fetch("http://localhost:3001/api/health");
    if (result.ok) {
      ready = true;
      break;
    }
  } catch {
    /* The API starts after migrations. */
  }
  await new Promise((r) => setTimeout(r, 1000));
}
if (!ready) {
  server.kill();
  throw new Error("API did not become ready.");
}
const clients = await Promise.all(
  ["Alice", "Bob"].map(async (name) => {
    const client = new BlindPassClient({
      baseUrl: "http://localhost:3001",
      issuer: process.env.ISSUER_ORIGIN ?? "localhost:3000",
      store: new MemoryStore(),
    });
    const invoice = await client.buy();
    await client.request(`/api/dev/pay/${invoice.id}`, {
      method: "POST",
      body: "{}",
    });
    await client.issue(invoice);
    console.log(`${name}: 10 real private credits ready (simulated payment)`);
    return client;
  }),
);
for (const client of clients.reverse()) await client.search("privacy");
console.log(
  "\nBlindPass is ready: http://localhost:3000/demo\nTwo independent clients issued and redeemed real credentials.\nThe browser demo creates its own fresh clients. Ctrl+C stops the servers.",
);
server.on("exit", (code) => process.exit(code ?? 0));
