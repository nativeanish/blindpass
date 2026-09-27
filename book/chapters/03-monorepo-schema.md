# 3 Monorepo Foundation & Schema Design

> **Part I — Foundations · Build checkpoint 3 of 3**

*In this chapter*
- Define the pnpm workspace and strict TypeScript boundaries
- Build the shared encoding, error, and signed-type vocabulary
- Translate privacy boundaries into PostgreSQL tables
- Verify the schema prevents user-to-token joins

You will now create the packages, the shared vocabulary, and the first database
migration. Work in that order. Types make illegal states visible to the
compiler; the migration then makes concurrent processes obey the same rules.

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

## 3.1 Step 1 — Scaffold one strict TypeScript world

The workspace uses ESM, bundler-style resolution, strict checking, DOM types
for Web Crypto, and Node types for the API and CLI. Package exports point at
TypeScript source so the lab runs directly through `tsx` and Vitest.

```yaml
# File: pnpm-workspace.yaml
packages:
  - apps/*
  - packages/*
  - cli
```

> **▶ Try It Out**
> ```bash
> cat pnpm-workspace.yaml
> ```
> Expected output: The workspace configuration specifying the apps, packages, and cli directories.

```json
// File: tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022", // <1>
    "lib": ["ES2022", "DOM", "DOM.Iterable"], // <4>
    "module": "ESNext",
    "moduleResolution": "Bundler", // <2>
    "strict": true, // <3>
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "noEmit": true,
    "allowImportingTsExtensions": true,
    "types": ["node"],
    "jsx": "react-jsx"
  },
  "include": [
    "packages/**/*.ts",
    "packages/**/*.tsx",
    "apps/api/**/*.ts",
    "apps/demo-service/**/*.ts",
    "cli/**/*.ts",
    "scripts/**/*.ts",
    "tests/**/*.ts",
    "*.ts"
  ],
  "exclude": ["node_modules"]
}
```

> **<1>** ES2022 target ensures modern syntax support like top-level await.
>
> **<2>** Bundler resolution for .ts imports allows seamless integration with our modern build tools.
>
> **<3>** strict: true enforces strong typing across the workspace to prevent runtime errors.
>
> **<4>** DOM lib is included to support Web Crypto API types natively.

> **▶ Try It Out**
> ```bash
> pnpm typecheck
> ```
> Expected output: Zero errors indicating the typescript configuration is working correctly.

Create package manifests after the root compiler passes. Each package exports a
single source entry point during the lab. Keep dependency arrows one-way:
`shared` has no workspace dependency, `privacy-pass` depends on `shared`, and
`server` depends on both. If shared code imports the API, the boundary has
already collapsed.

## 3.2 Step 2 — Build encodings, errors, and signed types

The shared module is the vocabulary of the system. Its base64url encoder keeps
RFC-required padding: replacing characters is correct, stripping `=` would
produce a different spelling and fail the canonical round-trip check. Its
canonical JSON routine sorts keys recursively so an Ed25519 signature does not
depend on property insertion order.

**Listing 3.1: Error handling and byte encoding**
```typescript
// File: packages/shared/src/index.ts
import { z } from "zod";
export const TOKEN_CLASS = "search-v1";
export const TOKEN_TYPE = 1;
export const BATCH_SIZE = 10;
export const ErrorCodes = [
  "PAYMENT_NOT_CONFIRMED",
  "INVOICE_EXPIRED",
  "ISSUANCE_ALREADY_COMPLETED",
  "ISSUER_POLICY_VIOLATION",
  "INVALID_TOKEN",
  "TOKEN_ALREADY_SPENT",
  "TOKEN_EXPIRED",
  "WRONG_TOKEN_CLASS",
  "WRONG_ISSUER_EPOCH",
  "SERVICE_TEMPORARILY_UNAVAILABLE",
  "TOR_NOT_AVAILABLE",
  "INVALID_REQUEST",
  "NOT_FOUND",
  "VAULT_LOCKED",
] as const;
export type ErrorCode = (typeof ErrorCodes)[number];
export class BlindPassError extends Error { // <1>
  constructor(
    public code: ErrorCode,
    public status = 400,
    message?: string,
  ) {
    super(message ?? code.replaceAll("_", " ").toLowerCase());
    this.name = "BlindPassError";
  }
}
export function b64(bytes: Uint8Array): string { // <2>
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_");
}
export function unb64(value: string): Uint8Array {
  return Uint8Array.from(
    atob(value.replaceAll("-", "+").replaceAll("_", "/")),
    (c) => c.charCodeAt(0),
  );
}
export function utf8(s: string): Uint8Array<ArrayBuffer> { // <3>
  return new TextEncoder().encode(s);
}
export function buffer(bytes: Uint8Array): ArrayBuffer { // <4>
  return Uint8Array.from(bytes).buffer;
}
export async function sha256(bytes: Uint8Array | string): Promise<string> { // <5>
  return b64(
    new Uint8Array(
      await crypto.subtle.digest( // <6>
        "SHA-256",
        buffer(typeof bytes === "string" ? utf8(bytes) : bytes),
      ),
    ),
  );
}
```

> **<1>** `BlindPassError` exposes stable public codes without leaking stack traces.
>
> **<2>** `b64` and `unb64` define one application encoding. A parser later demands `b64(unb64(input)) === input`, eliminating aliases.
>
> **<3>** `utf8` securely formats JS strings into contiguous byte arrays.
>
> **<4>** `buffer` isolates the ArrayBuffer from a Uint8Array.
>
> **<5>** `sha256` ensures inputs are digested consistently into a URL-safe format.
>
> **<6>** `crypto.subtle.digest` provides high-performance asynchronous cryptography.

> **▶ Try It Out**
> ```bash
> pnpm typecheck
> ```
> Expected output: Clean compilation of the error and encoding helpers.

> **⚠ PITFALL: Non-canonical Base64URL — if two byte strings parse identically but hash differently in the spent set, an attacker gets a double-spend alias**
>
> Ensure that you always enforce a canonical Base64URL representation. Stripping or altering padding without strict validation can result in aliases that bypass checks.

**Listing 3.2: Canonical JSON and Ed25519 verification**
```typescript
// File: packages/shared/src/index.ts
// Only JSON-compatible data enters application signatures. Lexicographic keys make signatures independent of transport ordering.
export function canonical(value: unknown): string { // <1>
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b, "en")) // <2>
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export function epochDates(epoch: string) { // <3>
  if (!/^\d{4}-\d{2}$/.test(epoch))
    throw new BlindPassError("WRONG_ISSUER_EPOCH");
  const [year, month] = epoch.split("-").map(Number);
  if (month < 1 || month > 12) throw new BlindPassError("WRONG_ISSUER_EPOCH");
  return {
    validFrom: new Date(Date.UTC(year, month - 1, 1)).toISOString(),
    issuanceEndsAt: new Date(Date.UTC(year, month, 1)).toISOString(),
    expiresAt: new Date(Date.UTC(year, month, 8)).toISOString(),
  };
}
export const currentEpoch = () => new Date().toISOString().slice(0, 7);

export async function verifySignature( // <4>
  document: unknown,
  signature: string,
  publicKey: string,
) {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      buffer(unb64(publicKey)),
      { name: "Ed25519" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      "Ed25519",
      key,
      buffer(unb64(signature)),
      buffer(utf8(canonical(document))),
    );
  } catch {
    return false;
  }
}
export const fingerprint = async (publicKey: string) => // <5>
  (await sha256(unb64(publicKey))).replaceAll("=", "");
```

> **<1>** `canonical` accepts only JSON-compatible values. `undefined`, cyclic objects, dates, and bigints must be normalized before signing.
>
> **<2>** `localeCompare(..., "en")` ensures keys are sorted lexicographically, making signatures deterministic regardless of property insertion order.
>
> **<3>** `epochDates` derives shared calendar boundaries. Buyers cannot receive invoice-specific expiry values.
>
> **<4>** `verifySignature` imports Ed25519 keys non-extractably and verifies signatures on canonicalized content.
>
> **<5>** The public key fingerprint is a SHA-256 trust anchor, not a user identifier.

> **▶ Try It Out**
> ```bash
> pnpm exec tsx tests/run_canonical.ts
> ```
> Expected output: Demonstrates JSON values are properly sorted and converted.

**Listing 3.3: Domain schemas**
```typescript
// File: packages/shared/src/index.ts
export const ManifestSchema = z // <1>
  .object({
    version: z.literal(1),
    issuer: z.string(),
    activeKeyId: z.string(),
    tokenType: z.literal(1),
    tokenClass: z.string(),
    epoch: z.string(),
    validFrom: z.string(),
    issuanceEndsAt: z.string(),
    expiresAt: z.string(),
    publicKey: z.string(),
    originScope: z.string(),
    batchSize: z.literal(10),
  })
  .strict(); // <2>
export type Manifest = z.infer<typeof ManifestSchema>;
export const SignedManifestSchema = z
  .object({
    manifest: ManifestSchema,
    signature: z.string(),
    signingPublicKey: z.string(),
  })
  .strict();
export type SignedManifest = z.infer<typeof SignedManifestSchema>;
export interface SignedDocument<T> {
  document: T;
  signature: string;
  signingPublicKey: string;
}
export interface InvoiceDocument { // <3>
  invoice_id: string;
  offer_id: string;
  zec_amount: string;
  credit_count: number;
  token_class: string;
  issuer_configuration_hash: string;
  payment_address: string;
  confirmation_policy: number;
  payment_deadline: string;
  issuance_deadline: string;
  refund_policy: string;
}
export type InvoiceStatus = // <4>
  | "WAITING_FOR_PAYMENT"
  | "PAYMENT_DETECTED"
  | "WAITING_FOR_CONFIRMATION"
  | "PAYMENT_CONFIRMED"
  | "ISSUING_PRIVATE_CREDITS"
  | "CREDITS_READY"
  | "EXPIRED"
  | "PAYMENT_REORGED";
export interface Invoice {
  id: string;
  capability?: string;
  offerId: string;
  zecAmount: string;
  creditCount: number;
  tokenClass: string;
  issuerEpoch: string;
  issuerConfigHash: string;
  paymentAddress: string;
  paymentUri: string;
  status: InvoiceStatus;
  expiresAt: string;
  issuanceDeadline: string;
  createdAt: string;
  document: SignedDocument<InvoiceDocument>;
  simulated: boolean;
}
export interface StoredCredential { // <5>
  token: string;
  epoch: string;
  tokenClass: string;
  expiresAt: string;
}
export interface SearchResult {
  id: string;
  title: string;
  url: string;
  description: string;
  category: string;
}
export interface SearchResponse {
  query: string;
  results: SearchResult[];
  creditConsumed: true;
  total: number;
}
export interface Offer {
  id: string;
  name: string;
  zecAmount: string;
  creditCount: number;
  tokenClass: string;
  enabled: boolean;
}
```

> **<1>** `ManifestSchema` formalizes the configuration for token issuers.
>
> **<2>** `.strict()` on manifests rejects hidden tagging fields.
>
> **<3>** `InvoiceDocument` specifies payment terms without tracking user identity.
>
> **<4>** `InvoiceStatus` enforces a strict lifecycle state machine.
>
> **<5>** `StoredCredential` represents a saved token without tracking personal data.

> **▶ Try It Out**
> ```bash
> pnpm typecheck
> ```
> Expected output: Successful compilation, indicating types match the boundaries correctly.

Build the module in four passes. Start with `BlindPassError` and byte helpers so
every later package shares one encoding. Add canonical JSON and signature
verification next. Add epoch derivation before the manifest schema so dates are
policy outputs rather than arbitrary strings. Finish with invoice and credential
interfaces. Run `pnpm typecheck` after each pass; this catches accidental Node
`Buffer` dependencies that would break the browser package.

`localeCompare(..., "en")` is deterministic for this restricted ASCII schema,
but it is not a standards-track JSON Canonicalization Scheme. If documents will
cross implementations, adopt RFC 8785 and version the signed format before
deployment.

## 3.3 Step 3 — Translate privacy boundaries into tables

The migration stores money-side state and redemption-side state without a join
path. Amounts remain decimal strings; JavaScript floating point never touches
currency. A database constraint restricts redemptions to `reserved` or `spent`.

> **⚠ PITFALL: Floating-point on currency**
>
> Number(0.01) * 1e8 evaluates to 999999.9999999999. Amounts stay as decimal text in PostgreSQL and convert via BigInt in TypeScript.

```sql
-- File: infra/migrations/001_initial.sql
CREATE TABLE IF NOT EXISTS offers (id text PRIMARY KEY, name text NOT NULL, zec_amount text NOT NULL, credit_count integer NOT NULL CHECK(credit_count > 0), token_class text NOT NULL, enabled boolean NOT NULL DEFAULT true); -- <1>
CREATE TABLE IF NOT EXISTS issuer_epochs (epoch text PRIMARY KEY, issuer_key_id text NOT NULL UNIQUE, public_key text NOT NULL, valid_from timestamptz NOT NULL, valid_until timestamptz NOT NULL, verification_grace_until timestamptz NOT NULL, manifest jsonb NOT NULL); -- <2>
CREATE TABLE IF NOT EXISTS invoices (id text PRIMARY KEY, capability_secret_hash text NOT NULL UNIQUE, offer_id text NOT NULL REFERENCES offers(id), zec_amount text NOT NULL, credit_count integer NOT NULL, token_class text NOT NULL, issuer_epoch text NOT NULL REFERENCES issuer_epochs(epoch), issuer_config_hash text NOT NULL, payment_address text NOT NULL UNIQUE, payment_uri text NOT NULL, status text NOT NULL, payment_txid text, detected_at timestamptz, confirmed_at timestamptz, expires_at timestamptz NOT NULL, issuance_deadline timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), document jsonb NOT NULL); -- <3>
CREATE TABLE IF NOT EXISTS invoice_payment_events (id text PRIMARY KEY, invoice_id text NOT NULL REFERENCES invoices(id), txid text NOT NULL, amount text NOT NULL, block_height integer, confirmations integer NOT NULL, reorg boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS issuance_authorizations (invoice_id text PRIMARY KEY REFERENCES invoices(id), status text NOT NULL, request_hash text, responses jsonb, issued_count integer NOT NULL DEFAULT 0, completed_at timestamptz);
CREATE TABLE IF NOT EXISTS redeemed_tokens (token_hash text NOT NULL, issuer_epoch text NOT NULL, status text NOT NULL CHECK(status IN ('reserved','spent')), reserved_at timestamptz NOT NULL DEFAULT now(), spent_at timestamptz, expires_at timestamptz NOT NULL, PRIMARY KEY(token_hash,issuer_epoch)); -- <4> -- <5>
CREATE TABLE IF NOT EXISTS audit_events (kind text PRIMARY KEY, count integer NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS search_documents (id text PRIMARY KEY, title text NOT NULL, url text NOT NULL, description text NOT NULL, category text NOT NULL, search_vector tsvector GENERATED ALWAYS AS (setweight(to_tsvector('english', title),'A') || setweight(to_tsvector('english', description),'B')) STORED); -- <6>
CREATE INDEX IF NOT EXISTS search_documents_fts ON search_documents USING gin(search_vector);
CREATE INDEX IF NOT EXISTS invoices_created ON invoices(created_at);
INSERT INTO offers(id,name,zec_amount,credit_count,token_class) VALUES('search-10','10 private searches','0.01',10,'search-v1') ON CONFLICT DO NOTHING;
```

> **<1>** `offers` table stores the available items to purchase.
>
> **<2>** `issuer_epochs` tracks the active periods for keys and tokens.
>
> **<3>** `invoices` stores payment states with a `capability_secret_hash` for retry control.
>
> **<4>** `redeemed_tokens` contains NO foreign key back to invoices to preserve privacy.
>
> **<5>** Composite primary key (`token_hash`, `issuer_epoch`) serves as the concurrency arbiter.
>
> **<6>** `search_documents` uses a `tsvector` for fast full-text querying.

> **▶ Try It Out**
> ```bash
> pnpm db:migrate
> ```
> Expected output: Tables are created in the database without errors.

The same schema is represented with Drizzle for typed application queries.

```typescript
// File: apps/api/src/db/schema.ts
import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  primaryKey,
  boolean,
} from "drizzle-orm/pg-core";

export const offers = pgTable("offers", { // <1>
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  zecAmount: text("zec_amount").notNull(),
  creditCount: integer("credit_count").notNull(),
  tokenClass: text("token_class").notNull(),
  enabled: boolean("enabled").notNull().default(true),
});

export const issuerEpochs = pgTable("issuer_epochs", { // <2>
  epoch: text("epoch").primaryKey(),
  issuerKeyId: text("issuer_key_id").notNull(),
  publicKey: text("public_key").notNull(),
  validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
  validUntil: timestamp("valid_until", { withTimezone: true }).notNull(),
  verificationGraceUntil: timestamp("verification_grace_until", {
    withTimezone: true,
  }).notNull(),
  manifest: jsonb("manifest").notNull(),
});

export const invoices = pgTable("invoices", { // <3>
  id: text("id").primaryKey(),
  capabilitySecretHash: text("capability_secret_hash").notNull().unique(),
  offerId: text("offer_id")
    .notNull()
    .references(() => offers.id),
  zecAmount: text("zec_amount").notNull(),
  creditCount: integer("credit_count").notNull(),
  tokenClass: text("token_class").notNull(),
  issuerEpoch: text("issuer_epoch")
    .notNull()
    .references(() => issuerEpochs.epoch),
  issuerConfigHash: text("issuer_config_hash").notNull(),
  paymentAddress: text("payment_address").notNull().unique(),
  paymentUri: text("payment_uri").notNull(),
  status: text("status").notNull(),
  paymentTxid: text("payment_txid"),
  detectedAt: timestamp("detected_at", { withTimezone: true }),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  issuanceDeadline: timestamp("issuance_deadline", {
    withTimezone: true,
  }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  document: jsonb("document").notNull(),
});

export const paymentEvents = pgTable("invoice_payment_events", {
  id: text("id").primaryKey(),
  invoiceId: text("invoice_id")
    .notNull()
    .references(() => invoices.id),
  txid: text("txid").notNull(),
  amount: text("amount").notNull(),
  blockHeight: integer("block_height"),
  confirmations: integer("confirmations").notNull(),
  reorg: boolean("reorg").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const issuanceAuthorizations = pgTable("issuance_authorizations", {
  invoiceId: text("invoice_id")
    .primaryKey()
    .references(() => invoices.id),
  status: text("status").notNull(),
  requestHash: text("request_hash"),
  responses: jsonb("responses"),
  issuedCount: integer("issued_count").notNull().default(0),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

// Intentionally no invoice reference, client ID, query, IP, or raw credential.
export const redeemedTokens = pgTable( // <4> // <5>
  "redeemed_tokens",
  {
    tokenHash: text("token_hash").notNull(),
    issuerEpoch: text("issuer_epoch").notNull(),
    status: text("status").notNull(),
    reservedAt: timestamp("reserved_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    spentAt: timestamp("spent_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.tokenHash, t.issuerEpoch] })],
);

export const auditEvents = pgTable("audit_events", {
  kind: text("kind").primaryKey(),
  count: integer("count").notNull().default(0),
});
```

> **<1>** `offers` mirrors the SQL definition closely for typed queries.
>
> **<2>** `issuerEpochs` ensures date handling stays precise within TS.
>
> **<3>** `invoices` contains foreign keys linking back to `offers` and `issuerEpochs`.
>
> **<4>** `redeemedTokens` verifies that there is no foreign key mapping it back to `invoices`.
>
> **<5>** `redeemedTokens` enforces the composite primary key.

> **▶ Try It Out**
> ```bash
> pnpm typecheck
> ```
> Expected output: Drizzle schema compiles accurately without type issues.

```text
                         ┌─────────────────────┐
                         │ WAITING_FOR_PAYMENT  │
                         └──────┬──────────┬────┘
                                │          │
                      payment   │          │ deadline
                      detected  │          │ passed
                                ▼          ▼
                    ┌───────────────┐  ┌─────────┐
                    │PAYMENT_DETECTED│  │ EXPIRED │
                    └──────┬────────┘  └─────────┘
                           │
                  confirms │ reorg
                    ┌──────┼──────────────┐
                    ▼      │              ▼
     ┌──────────────────┐  │  ┌──────────────────┐
     │WAIT_CONFIRMATION │  │  │ PAYMENT_REORGED  │
     └────────┬─────────┘  │  └──────────────────┘
              │ >= policy  │
              ▼            │
     ┌──────────────────┐  │
     │PAYMENT_CONFIRMED │──┘
     └────────┬─────────┘
              │ issuance
              ▼
     ┌──────────────────┐
     │  CREDITS_READY   │
     └──────────────────┘
```

`issuance_authorizations.invoice_id` is intentionally a primary key. One paid
invoice can authorize one batch. The stored response supports idempotent retry
of the exact same blinded request after a lost HTTP response. A different
request hash is refused, preventing repeated issuance from the same payment.

> **📖 DEFINITION: Domain-separated hash**
>
> A domain-separated hash prepends a context string or structural identifier before hashing, ensuring that the same underlying data results in a different hash if used in a different protocol or context. This prevents cross-protocol attacks.

`redeemed_tokens` contains only a domain-separated SHA-256 token hash, epoch,
state, and timestamps. It has no invoice foreign key, client ID, IP address,
query, or raw token. The composite primary key is the concurrency primitive
used in chapter 5.

Write the migration from independent aggregates toward the sensitive boundary:

1. Create offers and issuer epochs.
2. Create invoices and payment events, which may reference one another.
3. Create one issuance authorization per invoice for retry control.
4. Create `redeemed_tokens` last and deliberately omit an invoice reference.
5. Add the composite primary key that chapter 5 will use as an atomic arbiter.

Then mirror those names in Drizzle. The SQL migration remains the deployment
authority; the Drizzle module provides typed queries and must not invent extra
columns.

## 3.4 Step 4 — Migrate and inspect the result

```bash
docker compose up -d postgres
pnpm db:migrate
psql "$DATABASE_URL" -c '\d redeemed_tokens'
pnpm exec vitest run tests/integration.test.ts
```

Point tests at a disposable database. The integration harness creates random
schemas and drops them after each file; it still needs permission to create and
drop schemas. Never run destructive test setup against a production database.

### Build checkpoint

At this point the workspace can express signed configuration, invoices,
credentials, and errors without an identity model. The schema can answer “was
this invoice paid?” and “was this token spent?” but has no column that answers
“who did either action?”

Commit or otherwise save this green state. Part II assumes strict types, a
running PostgreSQL instance, and the schema exactly as printed here.
