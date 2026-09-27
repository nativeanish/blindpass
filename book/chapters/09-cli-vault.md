# 9 The Encrypted Node.js CLI & Secret Storage

A Privacy Pass token is a bearer credential. Encrypting it on disk protects
against casual disclosure and offline file theft; it does not stop malware
running as the user from asking the CLI to decrypt or spend it. The vault must
also serialize commands so two processes cannot choose the same local token.

## 9.1 Build an authenticated file format

{{blindpass-include:cli/src/vault.ts}}

The on-disk JSON is an envelope, not plaintext state:

```text
version | random 16-byte salt | random 12-byte IV | GCM tag | ciphertext
```

`scryptSync(passphrase, salt, 32)` derives an AES-256 key. A fresh salt defeats
precomputed password hashes; scrypt's memory cost raises the price of guessing.
AES-GCM encrypts and authenticates the state. The constant associated data
`blindpass-vault-v1` binds ciphertext to this format even though that label is
not secret.

Every save creates a fresh IV and salt, writes a mode-0600 temporary file with
exclusive creation, then atomically renames it over the database. The directory
is mode 0700. Atomic rename prevents a crash halfway through a write from
truncating the previous vault. A production extension should `fsync` the file
and directory when crash durability is more important than latency.

`exclusive` creates `vault.lock` with `O_EXCL`. A second CLI process fails
instead of racing. The user may remove a stale lock only after verifying that no
command remains active. Host crashes can leave the lock; PID-bearing locks with
careful liveness checks can improve recovery without silently breaking mutual
exclusion.

## 9.2 Get the passphrase without inventing a plaintext key file

The resolver checks an explicitly supplied environment secret, then Linux
Secret Service via `secret-tool`, then an interactive non-echoed passphrase.
When a desktop keyring is available but no entry exists, it generates a random
32-byte value and stores it. The fallback requires at least twelve characters.

Environment variables can leak through process inspection, crash reports, and
shell configuration; inject them through a real secret manager in unattended
deployments. JavaScript strings and Buffers cannot be reliably zeroized because
runtimes copy and move memory. Keep decrypted state lifetime short and avoid
printing it. The `inspect` command reports counts and labels, never token values.

## 9.3 Wire commands to one SDK

{{blindpass-include:cli/src/main.ts}}

`commander` defines thin commands. Purchase, configuration verification,
issuance, and spending stay in `@blindpass/client`, shared with the browser.
`buy --no-wait` supports an asynchronous payment; `issue <invoice>` resumes a
paid invoice held in the encrypted vault.

The CLI removes a credential from durable state before sending redemption. If
the response is unambiguously a validation or temporary service failure, it can
restore the token. A connection loss after the server commits is ambiguous, so
automatic replay would reveal a spent credential and cannot guarantee recovery.
The conservative policy may sacrifice a credit rather than hide ambiguity.

## 9.4 Test confidentiality and permissions

{{blindpass-include:tests/vault.test.ts}}

The test checks three independent properties: sensitive plaintext is absent,
the file mode is 0600, and a wrong passphrase fails authenticated decryption.
It uses a temporary directory and a test-only environment secret.

```bash
pnpm exec vitest run tests/vault.test.ts tests/cli.test.ts
BLINDPASS_VAULT_PASSWORD='a-long-local-lab-passphrase' pnpm blindpass offers
```

For an end-to-end local purchase:

```bash
BLINDPASS_VAULT_PASSWORD='a-long-local-lab-passphrase' pnpm blindpass buy search-10 --no-wait
pnpm demo:confirm-payment <invoice-id>
BLINDPASS_VAULT_PASSWORD='a-long-local-lab-passphrase' pnpm blindpass issue <invoice-id>
BLINDPASS_VAULT_PASSWORD='a-long-local-lab-passphrase' pnpm blindpass balance
```

### Checkpoint

The CLI now treats credentials as valuable bearer assets: encrypted at rest,
authenticated against tampering, saved atomically, and protected from local
multi-process double selection.
