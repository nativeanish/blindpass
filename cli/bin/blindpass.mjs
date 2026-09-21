#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const child = spawn(
  process.execPath,
  [
    "--import",
    require.resolve("tsx"),
    fileURLToPath(new URL("../src/main.ts", import.meta.url)),
    ...process.argv.slice(2),
  ],
  { stdio: "inherit" },
);
child.on("exit", (code) => process.exit(code ?? 1));
child.on("error", () => {
  console.error("Unable to start BlindPass. Run pnpm install first.");
  process.exitCode = 1;
});
