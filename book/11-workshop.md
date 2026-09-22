# 11. Build it in deliberate slices

The easiest way to learn BlindPass is to rebuild its boundaries in an isolated branch or scratch application while using this repository as a reference. This workshop gives an implementation order and an acceptance gate for each slice. It is not an instruction to replace the existing, working code with simplified snippets. Keep the protocol library and published vectors intact throughout.

## Slice 1: define the contract before endpoints

Begin with the shared types in [`packages/shared/src/index.ts`](../packages/shared/src/index.ts): offer, manifest, signed invoice, invoice state, stored credential, search response, and structured error codes. Decide which values are public, which are bearer secrets, and which are application policy. Write down these invariants:

```text
One offer = one fixed amount, class, and credit count.
One invoice = one random capability and one payment destination.
One confirmed invoice = at most one completed issuance batch.
One finalized credential = at most one successful resource use.
Redemption never requires an invoice lookup.
```

Add strict request schemas before business logic. The API uses Zod `.strict()` objects to reject extra fields; that reduces accidental acceptance of client-supplied payment facts or unknown token metadata. Do not accept a payment confirmation flag from a public caller. The development endpoint that emits mock payment events is gated outside production.

**Gate:** malformed and extra-field requests fail with a stable `INVALID_REQUEST` response; production startup refuses mock payment mode.

## Slice 2: create the ledger and state machine

Apply [`infra/migrations/001_initial.sql`](../infra/migrations/001_initial.sql) to a disposable PostgreSQL database. Confirm there is no user table and no invoice reference on `redeemed_tokens`. Build invoice creation using a cryptographically random capability and store only its hash. Keep the payment amount as a decimal string and convert it to integer zatoshis at comparison time.

Implement payment event handling inside a transaction: lock the invoice, insert a stable event ID, reject underpayment, update confirmation state, and insert one authorization at the threshold. Model reorg and expiry explicitly. Use the database's unique keys as business invariants, not only as query indexes.

**Gate:** deliver the same event twice and observe one effect; deliver a reorg before issuance and observe no authorization; deliver a late payment and observe no new credits. Use [`tests/integration.test.ts`](../tests/integration.test.ts) as a behavior reference.

## Slice 3: establish common issuer policy

Generate a stable Ed25519 signing identity and an epoch VOPRF key through the library. Sign a manifest whose class, batch size, issuer, origin, and dates are common to all buyers in the epoch. Refuse to replace a registered epoch key when the database already knows a different one. The code in [`apps/api/src/keys.ts`](../apps/api/src/keys.ts) demonstrates this guard. Preserve previous epoch secrets through verification grace.

On the client, verify the signature, enforce an independently trusted fingerprint where available, recompute the key ID, and compare the manifest to a cached accepted copy. Sign invoice terms and compare each signed field to the response shown to the payer.

**Gate:** a malformed signature fails; a _validly signed_ manifest with a unique class, key, or expiry also fails client policy. That second case is the one a signature-only test misses.

## Slice 4: issue without revealing token inputs

Use [`createBlindBatch`](../packages/privacy-pass/src/index.ts) to create ten independent requests. The client's secret nonces and blinding state stay local. Send only the blinded request bytes, capability, and configuration hash. The server locks the invoice and authorization, checks the paid state, evaluates the batch, saves the request digest and responses, and commits exactly once. After receipt, the client verifies all proofs and saves all ten finalized tokens atomically from its perspective.

Do not add invoice IDs to the token challenge. The challenge contains only common class and epoch context. Avoid homegrown P-384 or DLEQ code; use the pinned protocol implementation and test it against an independent vector.

**Gate:** one paid invoice yields ten verifiable tokens; replaying the same blind transcript yields identical responses; a fresh transcript after completion fails. Corrupting one proof stores zero tokens. Document the process-crash loss window before claiming recovery.

## Slice 5: redeem transactionally

Add a protected resource whose work can run in the same database transaction as the spent-token reservation. The repository's search function is a suitable model: it receives `Sql | TransactionSql` and returns a result without an external side effect. Parse the RFC 9577 header, require canonical token bytes, verify class and epoch, compute a domain-separated spent hash, insert it into a uniquely keyed table, run the query, and mark the row spent before commit.

Conceptually, the transaction is:

```sql
BEGIN;
INSERT INTO redeemed_tokens(token_hash, issuer_epoch, status, expires_at)
VALUES ($1, $2, 'reserved', $3)
ON CONFLICT DO NOTHING;
-- Require exactly one inserted row, then perform reversible work.
UPDATE redeemed_tokens SET status = 'spent', spent_at = now()
WHERE token_hash = $1 AND issuer_epoch = $2;
COMMIT;
```

The example is a teaching sketch; the real implementation uses parameterized SQL in [`RedemptionService`](../packages/blindpass-server/src/index.ts), checks the returned inserted row, and rolls back automatically when work throws. Never infer success from the `INSERT` statement alone when `ON CONFLICT DO NOTHING` can insert zero rows.

**Gate:** concurrent submission of one token yields one successful search; malformed token bytes fail; a thrown local search leaves the token usable. Verify that `redeemed_tokens` still contains no invoice or query data.

## Slice 6: add durable client behavior

Implement `CredentialStore.exclusive` before building a rich UI. Without serialized mutations, two browser tabs or CLI processes can read the same token and both try to spend it, or one save can overwrite another. Persist token removal before sending a redemption request. Restore only when the server explicitly says no credit was spent. Show ambiguous transport outcomes rather than silently consuming another token.

Use authenticated encryption for at-rest state and protect the encryption key. In a browser, a non-extractable Web Crypto key plus IndexedDB limits casual export but leaves same-origin script and device compromise in scope. In the CLI, use restricted file modes, atomic rename, and a process lock. Avoid printing capabilities or token values in routine diagnostics.

**Gate:** simultaneous local searches serialize; a known pre-commit service failure restores the credit; an ambiguous response does not trigger an automatic second-token retry. Restart the client during issuance and record the current loss behavior as an explicit failed recovery scenario.

## Slice 7: connect the real payment rail only after the core passes

Replace the mock watcher with the scanner bridge from Chapter 4. Validate address derivation independently, authenticate webhook _raw bytes_, and run reconciliation for missed delivery. Start on testnet. Test one real payment, duplicate delivery, underpayment, timeout, reorg, and restart. Keep scanner viewing capability separate from wallet spending authority.

**Gate:** no testnet credit appears before sufficient confirmed payment; no duplicate or reordered event can mint a second batch; the deployed scanner and API agree on every invoice state after reconciliation. Only then evaluate mainnet economics and operations.

This order has a practical advantage: each slice isolates one kind of authority. When a test fails, you can identify whether the defect belongs to payment observation, issuance authorization, cryptographic evaluation, client custody, or redemption. That makes a complex privacy product reviewable by ordinary engineering teams.
