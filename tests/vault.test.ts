import { it, expect } from "vitest";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FileVault } from "../cli/src/vault.js";
import { emptyState } from "../packages/blindpass-client/src/index.js";
it("encrypts credentials, authenticates the vault and uses private file permissions", async () => {
  process.env.BLINDPASS_VAULT_PASSWORD =
    "test-passphrase-not-a-deployment-secret";
  const dir = await mkdtemp(join(tmpdir(), "blindpass-vault-test-"));
  const vault = new FileVault(dir);
  const state = emptyState();
  state.credentials.push({
    token: "test-sensitive-credential",
    epoch: "2026-09",
    tokenClass: "search-v1",
    expiresAt: "2026-10-08T00:00:00.000Z",
  });
  await vault.exclusive(() => vault.save(state));
  const file = await readFile(join(dir, "credentials.db"), "utf8");
  expect(file).not.toContain("test-sensitive");
  expect((await stat(join(dir, "credentials.db"))).mode & 0o777).toBe(0o600);
  expect((await vault.load()).credentials).toEqual(state.credentials);
  process.env.BLINDPASS_VAULT_PASSWORD = "wrong-test-passphrase";
  await expect(new FileVault(dir).load()).rejects.toMatchObject({
    code: "VAULT_LOCKED",
  });
  delete process.env.BLINDPASS_VAULT_PASSWORD;
});
