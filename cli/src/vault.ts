import {
  mkdir,
  readFile,
  writeFile,
  rename,
  open,
  unlink,
} from "node:fs/promises";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import {
  scryptSync,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { emitKeypressEvents } from "node:readline";
import {
  emptyState,
  type CredentialStore,
  type ClientState,
} from "@blindpass/client";
import { BlindPassError } from "@blindpass/shared";
const exec = promisify(execFile);
async function promptPassword(): Promise<string> {
  if (!process.stdin.isTTY)
    throw new BlindPassError(
      "VAULT_LOCKED",
      400,
      "Set BLINDPASS_VAULT_PASSWORD or configure Linux Secret Service to unlock the encrypted CLI vault.",
    );
  process.stderr.write("Vault passphrase (not echoed): ");
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve, reject) => {
    let password = "";
    const onKey = (str: string, key: { name: string; ctrl?: boolean }) => {
      if (key.name === "return" || (key.ctrl && key.name === "c")) {
        process.stdin.off("keypress", onKey);
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stderr.write("\n");
        if (key.ctrl) reject(new Error("Cancelled"));
        else resolve(password);
      } else if (key.name === "backspace") password = password.slice(0, -1);
      else if (str && !key.ctrl) password += str;
    };
    process.stdin.on("keypress", onKey);
  });
}
async function vaultPassword() {
  if (process.env.BLINDPASS_VAULT_PASSWORD)
    return process.env.BLINDPASS_VAULT_PASSWORD;
  try {
    const { stdout } = await exec(
      "secret-tool",
      ["lookup", "application", "blindpass", "vault", "default"],
      { timeout: 4000 },
    );
    if (stdout.trim()) return stdout.trim();
  } catch {
    /* Headless Linux commonly has no Secret Service session. */
  }
  if (process.env.DBUS_SESSION_BUS_ADDRESS) {
    const password = randomBytes(32).toString("base64url");
    const stored = await new Promise<boolean>((resolve) => {
      const child = spawn(
        "secret-tool",
        [
          "store",
          "--label=BlindPass credential vault",
          "application",
          "blindpass",
          "vault",
          "default",
        ],
        { stdio: ["pipe", "ignore", "ignore"] },
      );
      child.on("error", () => resolve(false));
      child.on("exit", (code) => resolve(code === 0));
      child.stdin.on("error", () => {});
      child.stdin.end(password);
      setTimeout(() => {
        child.kill();
        resolve(false);
      }, 4000).unref();
    });
    if (stored) return password;
  }
  const password = await promptPassword();
  if (password.length < 12)
    throw new BlindPassError(
      "VAULT_LOCKED",
      400,
      "Use a passphrase of at least 12 characters.",
    );
  return password;
}
export class FileVault implements CredentialStore {
  private path: string;
  private password?: string;
  constructor(
    private directory = process.env.BLINDPASS_HOME ??
      join(homedir(), ".blindpass"),
  ) {
    this.path = join(directory, "credentials.db");
  }
  private async secret() {
    return (this.password ??= await vaultPassword());
  }
  async load(): Promise<ClientState> {
    let content: string;
    try {
      content = await readFile(this.path, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return emptyState();
      throw error;
    }
    try {
      const blob = JSON.parse(content) as {
        v: number;
        salt: string;
        iv: string;
        tag: string;
        data: string;
      };
      const key = scryptSync(
        await this.secret(),
        Buffer.from(blob.salt, "base64"),
        32,
      );
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(blob.iv, "base64"),
      );
      decipher.setAAD(Buffer.from("blindpass-vault-v1"));
      decipher.setAuthTag(Buffer.from(blob.tag, "base64"));
      return JSON.parse(
        Buffer.concat([
          decipher.update(Buffer.from(blob.data, "base64")),
          decipher.final(),
        ]).toString("utf8"),
      ) as ClientState;
    } catch {
      throw new BlindPassError(
        "VAULT_LOCKED",
        400,
        "Unable to unlock the credential vault. Check the passphrase or keyring.",
      );
    }
  }
  async save(state: ClientState) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const salt = randomBytes(16),
      iv = randomBytes(12),
      key = scryptSync(await this.secret(), salt, 32);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(Buffer.from("blindpass-vault-v1"));
    const data = Buffer.concat([
      cipher.update(JSON.stringify(state)),
      cipher.final(),
    ]);
    const file = `${this.path}.${randomBytes(8).toString("hex")}.tmp`;
    await writeFile(
      file,
      JSON.stringify({
        v: 1,
        salt: salt.toString("base64"),
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
        data: data.toString("base64"),
      }),
      { mode: 0o600, flag: "wx" },
    );
    await rename(file, this.path);
  }
  async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const path = join(this.directory, "vault.lock");
    let lock;
    try {
      lock = await open(path, "wx", 0o600);
    } catch {
      throw new BlindPassError(
        "VAULT_LOCKED",
        409,
        "Another CLI command holds the vault lock. If it crashed, remove ~/.blindpass/vault.lock after confirming no command is running.",
      );
    }
    try {
      return await fn();
    } finally {
      await lock.close();
      await unlink(path);
    }
  }
}
