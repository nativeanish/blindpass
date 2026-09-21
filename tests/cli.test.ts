import { it, expect } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { createApp } from "../apps/api/src/app.js";
import { testDatabase } from "./database.js";

it("runs the actual CLI through purchase, encrypted storage, issuance, search and audit", async () => {
  const database = await testDatabase();
  const runtime = await createApp({ database });
  const address = await runtime.app.listen({ port: 0, host: "127.0.0.1" });
  const vault = await mkdtemp(join(tmpdir(), "blindpass-cli-test-"));
  const env = {
    ...process.env,
    BLINDPASS_API_URL: address,
    BLINDPASS_HOME: vault,
    BLINDPASS_VAULT_PASSWORD: randomBytes(32).toString("hex"),
    ALL_PROXY: "",
    DOTENV_CONFIG_QUIET: "true",
  };
  const run = async (...args: string[]) =>
    (
      await promisify(execFile)(
        process.execPath,
        ["--import", "tsx", "cli/src/main.ts", ...args],
        { env },
      )
    ).stdout;
  try {
    expect(await run("offers")).toContain("search-10");
    const purchase = await run("buy", "search-10", "--no-wait");
    expect(purchase).toContain("SIMULATED PAYMENT");
    const id = /Invoice: ([A-Za-z0-9_-]+)/.exec(purchase)?.[1];
    expect(id).toBeTruthy();
    await run("demo:pay", id!);
    await run("issue", id!);
    expect(await run("balance")).toContain("remaining: 10");
    expect(await run("search", "privacy")).toContain("PRIVATE CREDIT USED");
    expect(await run("balance")).toContain("remaining: 9");
    expect(await run("invoices")).toContain("CREDITS_READY");
    expect(await run("inspect")).toContain("REDACTED");
    const audit = await run("audit-privacy");
    expect(audit).toContain("SIMULATED PAYMENT");
    expect(audit).toContain("DIRECT CONNECTION");
    expect(audit).toContain("Distinct people: unknown");
  } finally {
    await runtime.app.close();
    await database.cleanup();
  }
}, 60000);
