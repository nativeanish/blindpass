# 13. Build the workspace and domain model from zero

A privacy system becomes difficult to review when payment, cryptography, HTTP, and UI decisions all live in one service. Start with the domain model and package boundaries. The BlindPass monorepo is one example of that separation, not a mandatory framework choice.

## Recreate the boundaries before features

The root [`package.json`](../package.json) and [`pnpm-workspace.yaml`](../pnpm-workspace.yaml) define a TypeScript workspace. The dependency direction is the important part:

```text
shared ← privacy-pass ← client ← CLI / browser
                 ↑
                 server ← API ← demo search
zcash watcher ──────────┘
```

`shared` owns schemas, canonical encoding, and application types. `privacy-pass` wraps the protocol library. `client` owns policy verification and local state transitions. `server` owns token verification and transactional spend. `zcash` translates payment observations into the application's event type. The API composes them. A UI should call the client; it should not implement blinding, payment amount comparisons, or token verification again.

If you start in a new repository, create these boundaries as directories and wire TypeScript package names before adding logic. Keep protocol dependencies pinned and record why a version was selected. Do not copy the current lockfile blindly into a different runtime. The construction milestone is that each package can expose a small public interface while internals remain private. For example, the payment watcher exposes `createInvoice`, `getInvoice`, and `subscribe`; it does not expose an incoming viewing key to the API.

## Turn prose requirements into invariants

Before writing SQL, define the constants of the first product: one offer, fixed `0.01` ZEC price, ten credits, class `search-v1`, one credit per search, one UTC monthly key. These choices are not incidental. A unique price, class, expiry, or key per buyer becomes a matching signal. Fixed values produce a common cohort.

Model three kinds of authority separately:

| Authority           | Created by                   | Presented to              | Must never appear in          |
| ------------------- | ---------------------------- | ------------------------- | ----------------------------- |
| Invoice capability  | Merchant RNG                 | Invoice read and issuance | Search request or spent table |
| Payment observation | Scanner                      | Invoice state machine     | Token challenge               |
| Final credential    | Client protocol finalization | Protected API             | Issuance authorization row    |

The invoice ID is a locator, not authority. The signing identity authenticates documents, not payment. The VOPRF issuer key validates credentials, not invoice ownership. Naming these roles prevents one secret from quietly serving two purposes.

## Define a strict application contract

[`packages/shared/src/index.ts`](../packages/shared/src/index.ts) uses Zod schemas for the signed manifest and structured error codes. Its `InvoiceDocument` fixes the terms the client must inspect. The API uses strict body schemas so an unknown field cannot become a shadow authorization path. Keep `InvoiceStatus` a finite set even if you store text in SQL; a later production migration might enforce those states with a database check or enum and verify all transition paths.

Canonical signing deserves attention. JSON key order is not guaranteed by an arbitrary transport representation. The repository recursively sorts object keys before signing or hashing documents. Both signer and verifier must use the same canonical function. It accepts JSON-compatible values only; values such as `undefined`, `NaN`, dates as objects, or locale-dependent numeric formatting should never be introduced into signed contracts. A production protocol should specify its canonicalization format precisely and test cross-language vectors if clients will be implemented in other languages.

Use integer units for money. [`zatoshis`](../packages/zcash/src/index.ts) accepts at most eight decimal places and converts whole and fractional parts to `bigint`. For example, `0.01` ZEC becomes `1,000,000` zatoshis. A naive `Number(amount) * 1e8` creates precision and rounding hazards in comparison logic. Reject malformed strings before conversion; do not rely on a scanner to normalize them.

## Bootstrap the development environment

`pnpm dev` runs migrations and then launches Fastify and Next.js. The API seeds the local RFC search corpus on startup. PostgreSQL is the only required service for the CLI lab. The default Docker Compose file supplies development infrastructure and mock payments; it is not a production manifest. Keep `.secrets/` and the CLI vault out of Git. A newly initialized epoch key and an existing database must agree; [`loadKeys`](../apps/api/src/keys.ts) refuses to replace a registered epoch public key. This guard is useful only if you back up key material and database state together.

When creating a scratch implementation, write a one-page architecture decision record for every irreversible early choice: token class and cost, epoch length, payment confirmation threshold, capability location, recovery policy, and log retention. Each should state the threat it addresses, the user-visible tradeoff, and the test that will verify it. The code can change; an unstated assumption is much harder to discover.

## Acceptance exercise

Create an empty database with the BlindPass migration, then inspect its tables. Draw arrows only for actual foreign keys. If your diagram shows an arrow from `redeemed_tokens` to `invoices`, you have added a linkage the design intentionally excludes. Trace a `search-v1` credit from shared type to client storage to authorization header without introducing a customer ID. This is the smallest useful design review before implementing the cryptography.
