# 9 The Encrypted Node.js CLI & Secret Storage

> **Part IV — Clients · Build checkpoint 1 of 3**

*In this chapter*
- Build an authenticated AES-256-GCM encrypted file format with scrypt key derivation
- Implement atomic file replacement to prevent vault corruption
- Add inter-process exclusive locking for multi-command safety
- Wire CLI commands to the shared BlindPass SDK

The protocol works with an in-memory store. You will now make it survive process
exit without exposing bearer tokens. Build key acquisition, authenticated file
encryption, atomic replacement, and inter-process exclusion before adding CLI
commands.

A Privacy Pass token is a bearer credential. Encrypting it on disk protects
against casual disclosure and offline file theft; it does not stop malware
running as the user from asking the CLI to decrypt or spend it. The vault must
also serialize commands so two processes cannot choose the same local token.

## 9.1 Step 1 — Build an authenticated file format

Implement `FileVault` from reads to writes to locking:

1. Make `load()` return `emptyState()` only for `ENOENT`; every other file error
   must surface.
2. Parse the versioned envelope, derive 32 bytes with scrypt, set the same AAD,
   install the GCM tag, and authenticate during `final()`.
3. In `save()`, generate a new salt and IV every time, encrypt, create a private
   temporary file, and rename only after the write finishes.
4. Add `exclusive()` around SDK read-modify-write operations using an
   exclusively created lock file and a `finally` cleanup.

The on-disk JSON is an envelope, not plaintext state:

```text
┌─────────┬──────────────┬──────────┬────────────┬────────────────┐
│ version │ 16-byte salt │ 12-byte IV │ 16-byte tag │ ciphertext      │
│ (1B)    │ (scrypt)     │ (GCM)      │ (GCM auth) │ (JSON state)    │
└─────────┴──────────────┴──────────┴────────────┴────────────────┘
```

```typescript
// File: cli/src/vault.ts
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

// ... [Password prompt utilities omitted] ...

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
      const key = scryptSync( // <1>
        await this.secret(),
        Buffer.from(blob.salt, "base64"),
        32,
      );
      const decipher = createDecipheriv(
        "aes-256-gcm",
        key,
        Buffer.from(blob.iv, "base64"),
      );
      decipher.setAAD(Buffer.from("blindpass-vault-v1")); // <3>
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
```

> **<1>** scryptSync(passphrase, salt, 32) derives AES-256 key. scrypt's memory cost raises the price of guessing.
>
> **<3>** AES-GCM with constant AAD 'blindpass-vault-v1'. The constant associated data binds ciphertext to this format even though that label is not secret.

> **▶ Try It Out**
> ```bash
> pnpm blindpass inspect
> ```
> This creates an empty vault to inspect if one doesn't exist, requesting your passphrase.

```typescript
// File: cli/src/vault.ts
  async save(state: ClientState) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 }); 
    const salt = randomBytes(16), // <2>
      iv = randomBytes(12), // <4>
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
      { mode: 0o600, flag: "wx" }, // <5> <6>
    );
    await rename(file, this.path); // <7>
  }
```

> **<2>** Fresh salt defeats precomputed password hashes.
> 
> **<4>** Fresh IV on every save — GCM IV reuse is catastrophic.
> 
> **<5>** Exclusive creation (O_CREAT | O_EXCL) for temp file.
> 
> **<6>** Mode 0600 file permissions.
> 
> **<7>** Atomic rename over database. Prevents a crash halfway through a write from truncating the previous vault.

> **🔒 SECURITY NOTE: Vault Permissions**
>
> Mode 0600 file, 0700 directory — prevents casual multi-user read. Does not protect against malware running as the same user.

```typescript
// File: cli/src/vault.ts
  async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const path = join(this.directory, "vault.lock");
    let lock;
    try {
      lock = await open(path, "wx", 0o600); // <8>
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
      await unlink(path); // <9>
    }
  }
}
```

> **<8>** O_EXCL lock file for inter-process exclusion. A second CLI process fails instead of racing.
> 
> **<9>** finally cleanup removes lock.

> **▶ Try It Out**
> ```bash
> pnpm blindpass balance
> ```
> Expected output: 0 available private credits.

## 9.2 Step 2 — Acquire the passphrase safely

The resolver checks an explicitly supplied environment secret, then Linux
Secret Service via `secret-tool`, then an interactive non-echoed passphrase.
When a desktop keyring is available but no entry exists, it generates a random
32-byte value and stores it. The fallback requires at least twelve characters.

> **🔒 SECURITY NOTE: Secrets Leakage**
>
> Environment variables can leak through process inspection, crash reports, and shell history. Inject vault password through a real secret manager.

> **⚠ PITFALL: JavaScript Strings**
>
> JavaScript strings and Buffers cannot be reliably zeroized — runtimes copy and move memory. Keep decrypted state lifetime short.

## 9.3 Step 3 — Wire commands to one SDK

`commander` defines thin commands. Purchase, configuration verification,
issuance, and spending stay in `@blindpass/client`, shared with the browser.

```typescript
// File: cli/src/main.ts
import "dotenv/config";
import { Command } from "commander"; // <1>
import { BlindPassClient, MemoryStore } from "@blindpass/client";
import { FileVault } from "./vault.js";
import { torTransport } from "./tor.js";

const program = new Command()
  .name("blindpass")
  .description("Pay privately. Use privately.")
  .version("0.1.0");

// ... [Setup functions omitted] ...

program
  .command("buy")
  .argument("<offer>", "Offer identifier")
  .option("--no-wait", "Return after creating the invoice") // <2>
  .action(async (offer: string, options: { wait: boolean }) => {
    // ...
  });

program
  .command("issue")
  .argument("<invoice>") // <3>
  .action(async (id: string) => {
    // ...
  });

program
  .command("search")
  .argument("<query>")
  .option(
    "--tor",
    "Require verified Tor via SOCKS5h; never fall back to direct transport",
  )
  .action(async (query: string, options: { tor?: boolean }) => {
    // <4>
    // ...
  });

program.command("inspect").action(async () => {
  const state = await client().options.store.load();
  console.log({ // <5>
    credentials: state.credentials.length,
    used: state.used,
    epoch: state.configuration?.manifest.epoch,
    issuerFingerprint: state.trustedFingerprint,
    storage: "AES-256-GCM; OS keyring or passphrase; 0600",
    credentialValues: "REDACTED",
  });
});
// ...
```

> **<1>** Commander thin command wrappers.
> 
> **<2>** buy --no-wait for async payment.
> 
> **<3>** issue `<invoice-id>` resumes paid invoice.
> 
> **<4>** search removes credential before transport (pessimistic spending).
> 
> **<5>** inspect reports counts only, never token values.

> **▶ Try It Out**
> ```bash
> BLINDPASS_VAULT_PASSWORD='a-long-local-lab-passphrase' pnpm blindpass buy search-10 --no-wait
> pnpm demo:confirm-payment <invoice-id>
> BLINDPASS_VAULT_PASSWORD='a-long-local-lab-passphrase' pnpm blindpass issue <invoice-id>
> BLINDPASS_VAULT_PASSWORD='a-long-local-lab-passphrase' pnpm blindpass balance
> ```
> Expected output: An invoice will be created, paid, and you will see 10 available private credits.

Add commands in dependency order: `offers` needs no vault, `buy` creates and
stores an invoice, `invoices` and `issue` resume it, `balance` reads local
state, and `search` consumes one credential. Keep output at the domain level;
never add a debug option that prints capabilities or raw credentials.

The CLI removes a credential from durable state before sending redemption. If
the response is unambiguously a validation or temporary service failure, it can
restore the token. A connection loss after the server commits is ambiguous, so
automatic replay would reveal a spent credential and cannot guarantee recovery.
The conservative policy may sacrifice a credit rather than hide ambiguity.

## 9.4 Step 4 — Test confidentiality and permissions

The test checks three independent properties: sensitive plaintext is absent,
the file mode is 0600, and a wrong passphrase fails authenticated decryption.
It uses a temporary directory and a test-only environment secret.

```typescript
// File: tests/vault.test.ts
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
```

> **▶ Try It Out**
> ```bash
> pnpm exec vitest run tests/vault.test.ts
> ```
> Expected output: 1 passed test demonstrating confidentiality and correct permissions.

### Build checkpoint

The CLI now treats credentials as valuable bearer assets: encrypted at rest,
authenticated against tampering, saved atomically, and protected from local
multi-process double selection.
