import { spawn } from "node:child_process";
import { migrate } from "./migrate.js";
await migrate();
const children = [
  spawn("pnpm", ["dev:api"], { stdio: "inherit" }),
  spawn("pnpm", ["dev:web"], { stdio: "inherit" }),
];
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    children.forEach((c) => c.kill(signal));
    process.exit(0);
  });
for (const child of children)
  child.on("exit", (code) => {
    children.forEach((c) => c.kill());
    process.exit(code ?? 1);
  });
