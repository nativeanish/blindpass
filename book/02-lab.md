# 2. Run the reference application

This lab demonstrates the entire protocol without moving money. Payment events are simulated; token generation, issuer proofs, finalization, verification, and PostgreSQL replay protection are real. Keep those two facts separate when interpreting the output.

## Prerequisites and start

Use Node.js 22 or newer, pnpm 9.10 or newer, and Docker Compose. From the repository root:

```bash
pnpm install
docker compose up -d postgres
pnpm dev
```

The launcher migrates the database, starts the API on port 3001 and the web server on port 3000, and seeds a local search corpus. If port 5432 is occupied, set matching `POSTGRES_PORT` and `DATABASE_URL` values as described in [`.env.example`](../.env.example). Development secrets are generated in the ignored `.secrets/` directory. Preserve them while you have outstanding credentials: replacing an epoch key makes those credentials unverifiable.

In a second terminal, inspect the public offer:

```bash
pnpm blindpass offers
pnpm blindpass buy search-10 --no-wait
```

The buy command prints an invoice ID and a payment URI marked **SIMULATED PAYMENT — DO NOT SEND ZEC**. The invoice capability is saved in the encrypted CLI vault and is not printed. In another terminal, simulate three confirmations using the printed invoice ID:

```bash
pnpm blindpass demo:pay <invoice-id>
pnpm blindpass issue <invoice-id>
pnpm blindpass balance
pnpm blindpass search "privacy pass"
pnpm blindpass balance
```

The expected balance moves from ten to nine. The search result includes `creditConsumed: true` at the API level. `pnpm blindpass inspect` shows aggregate vault information without printing credential values. `pnpm blindpass audit-privacy` states which claims were checked and which network properties were not measured.

The CLI normally unlocks its vault through Linux Secret Service or an interactive passphrase. For an isolated lab you can set `BLINDPASS_HOME` to a dedicated directory and supply `BLINDPASS_VAULT_PASSWORD` from your local secret manager. Do not paste a real passphrase into a shell history or commit one to a file.

## Watch the state transition

The payment side moves through `WAITING_FOR_PAYMENT`, `PAYMENT_DETECTED`, `WAITING_FOR_CONFIRMATION`, and `PAYMENT_CONFIRMED`. Only a confirmed invoice can issue. Issuance then records one completed authorization and changes the invoice to `CREDITS_READY`. Redemption does not change the invoice; it writes a spent-token hash in a separate table.

Try an insufficient confirmation count with a fresh invoice:

```bash
pnpm blindpass buy search-10 --no-wait
pnpm blindpass demo:pay <new-invoice-id> --confirmations 1
pnpm blindpass issue <new-invoice-id>
```

The last command should report `PAYMENT_NOT_CONFIRMED`. Do not repeatedly issue a paid invoice to “get another batch.” The server binds one authorization to one invoice and accepts only an identical request transcript as an issuance retry. A new transcript receives `ISSUANCE_ALREADY_COMPLETED`.

## Read the calls, not just the screen

Trace the commands in [`cli/src/main.ts`](../cli/src/main.ts). `buy` first fetches and checks the signed manifest, then validates a signed invoice. `issue` creates ten blind requests locally and verifies proofs before saving tokens. `search` removes one local token before sending it. The API exposes the corresponding routes in [`apps/api/src/app.ts`](../apps/api/src/app.ts). The sample browser landing page is useful for product framing, but this chapter's reproducible exercise depends only on the CLI and API.

**Checkpoint.** Explain why the simulated payment can be replaced by a scanner without changing the credential cryptography. The payment watcher produces an authorization event; the blind issuance package does not need to know whether that event came from a mock or a Zcash scanner.
