# 3 Monorepo Foundation & Schema Design

The repository mirrors trust boundaries. Shared schemas know nothing about
PostgreSQL. The cryptographic package knows nothing about invoices. The server
package can verify and reserve a token without importing payment code. The API
is the composition root where those pieces meet.

```text
apps/api ───────┬──> @blindpass/server ──> @blindpass/privacy-pass
               ├──> @blindpass/zcash                 │
               └──> @blindpass/shared <──────────────┘

apps/web ──> @blindpass/client ──> @blindpass/privacy-pass
cli ───────> @blindpass/client
```

## 3.1 Establish one strict TypeScript world

The workspace uses ESM, bundler-style resolution, strict checking, DOM types
for Web Crypto, and Node types for the API and CLI. Package exports point at
TypeScript source so the lab runs directly through `tsx` and Vitest.

{{blindpass-include:pnpm-workspace.yaml}}

{{blindpass-include:tsconfig.json}}

Run the first structural gate before adding business logic:

```bash
pnpm typecheck
```

## 3.2 Make encodings and policy types explicit

The shared module is the vocabulary of the system. Its base64url encoder keeps
RFC-required padding: replacing characters is correct, stripping `=` would
produce a different spelling and fail the canonical round-trip check. Its
canonical JSON routine sorts keys recursively so an Ed25519 signature does not
depend on property insertion order.

{{blindpass-include:packages/shared/src/index.ts}}

Walk through the security-critical lines:

1. `BlindPassError` exposes stable public codes without leaking stack traces.
2. `b64` and `unb64` define one application encoding. A parser later demands
   `b64(unb64(input)) === input`, eliminating aliases.
3. `canonical` accepts only JSON-compatible values. `undefined`, cyclic
   objects, dates, and bigints must be normalized before signing.
4. `epochDates` derives shared calendar boundaries. Buyers cannot receive
   invoice-specific expiry values.
5. `.strict()` on manifests rejects hidden tagging fields.
6. Ed25519 keys are imported non-extractably for verification. The public key
   fingerprint is a SHA-256 trust anchor, not a user identifier.

`localeCompare(..., "en")` is deterministic for this restricted ASCII schema,
but it is not a standards-track JSON Canonicalization Scheme. If documents will
cross implementations, adopt RFC 8785 and version the signed format before
deployment.

## 3.3 Design tables around state machines

The migration stores money-side state and redemption-side state without a join
path. Amounts remain decimal strings; JavaScript floating point never touches
currency. A database constraint restricts redemptions to `reserved` or `spent`.

{{blindpass-include:infra/migrations/001_initial.sql}}

The same schema is represented with Drizzle for typed application queries.

{{blindpass-include:apps/api/src/db/schema.ts}}

```mermaid
stateDiagram-v2
  [*] --> WAITING_FOR_PAYMENT
  WAITING_FOR_PAYMENT --> PAYMENT_DETECTED
  PAYMENT_DETECTED --> WAITING_FOR_CONFIRMATION
  WAITING_FOR_CONFIRMATION --> PAYMENT_CONFIRMED
  PAYMENT_CONFIRMED --> CREDITS_READY: one issuance transcript
  WAITING_FOR_PAYMENT --> EXPIRED
  PAYMENT_DETECTED --> PAYMENT_REORGED
  WAITING_FOR_CONFIRMATION --> PAYMENT_REORGED
```

`issuance_authorizations.invoice_id` is intentionally a primary key. One paid
invoice can authorize one batch. The stored response supports idempotent retry
of the exact same blinded request after a lost HTTP response. A different
request hash is refused, preventing repeated issuance from the same payment.

`redeemed_tokens` contains only a domain-separated SHA-256 token hash, epoch,
state, and timestamps. It has no invoice foreign key, client ID, IP address,
query, or raw token. The composite primary key is the concurrency primitive
used in chapter 5.

## 3.4 Bring up the database

```bash
docker compose up -d postgres
pnpm db:migrate
psql "$DATABASE_URL" -c '\\d redeemed_tokens'
pnpm exec vitest run tests/integration.test.ts
```

Point tests at a disposable database. The integration harness creates random
schemas and drops them after each file; it still needs permission to create and
drop schemas. Never run destructive test setup against a production database.

### Checkpoint

At this point the workspace can express signed configuration, invoices,
credentials, and errors without an identity model. The schema can answer “was
this invoice paid?” and “was this token spent?” but has no column that answers
“who did either action?”
