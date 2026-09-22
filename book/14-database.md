# 14. Design the database for privacy and concurrency

The database does more than persist state. It enforces two economic facts under concurrent requests: one paid invoice authorizes one batch, and one credential completes one protected operation. It also determines which facts an operator can join later. Those are architecture decisions encoded as constraints.

## Split purchase and redemption records

The migration creates `offers`, `issuer_epochs`, `invoices`, `invoice_payment_events`, `issuance_authorizations`, `redeemed_tokens`, `audit_events`, and `search_documents`. The first five support payment and issuance. `redeemed_tokens` supports replay defense. `search_documents` supports the sample resource. The redemption table has a primary key on `(token_hash, issuer_epoch)` and no invoice ID, token value, client identifier, IP, or query. The server's redemption package imports no invoice schema. This is both a data-model and module-boundary control.

The absence of a column should not be mistaken for erasure of all information. `invoices.created_at`, `issuance_authorizations.completed_at`, and `redeemed_tokens.spent_at` are visible to a database operator. Fine-grained timestamps can aid correlation, especially with a small user pool. Production retention, access controls, and any timestamp coarsening policy deserve their own privacy review. Coarsening cannot be done casually if operational dispute handling or replay analysis needs exact times.

## Follow the invoice transaction

[`InvoiceService.payment`](../apps/api/src/invoices.ts) starts a transaction and selects the invoice `FOR UPDATE`. This serializes conflicting observations for that invoice. It compares amount in zatoshis, inserts the event ID, and returns immediately if that ID already exists. Only a new event can advance state. At confirmation threshold it inserts the authorization with `ON CONFLICT(invoice_id) DO NOTHING`.

Why both the row lock and unique authorization key? The lock provides a consistent state transition when confirmations and reorgs arrive near each other. The unique key guarantees the final cardinality even if a future code path forgets the lock. Constraints are durable invariants; application checks improve error messages and business logic but should not be the only defense.

The implementation currently processes events in arrival order, not by a fully specified chain-height reconciliation state machine. A production scanner should make observations monotonic where appropriate, explicitly mark reorgs, and periodically reconcile canonical chain state. Review out-of-order delivery and replacement events; do not assume a webhook queue preserves blockchain truth.

## Follow the issuance transaction

[`IssuanceService.issue`](../apps/api/src/issuance.ts) hashes the capability and canonical request array before opening its transaction. It then locks both invoice and authorization. It compares configuration hashes, checks the deadline and paid state, evaluates exactly ten blinded requests, stores the request hash and response array, and sets `completed`. A later request with the same digest receives the same stored responses. A different digest is rejected.

The request digest is an idempotency key for a cryptographic transcript. It is not a token identifier. Never replace it with a final-token digest or save final tokens on the invoice. The transaction holds locks while VOPRF evaluation runs; this is simple and correct for the reference workload, but production capacity planning should measure lock duration, CPU cost, and database connection occupancy under adversarial issuance load. If evaluation moves outside the lock, design a durable reservation and compare-and-swap protocol first; otherwise two workers may evaluate or commit different batches.

## Follow the redemption transaction

[`RedemptionService.redeem`](../packages/blindpass-server/src/index.ts) verifies the token before opening the transaction, then attempts a unique insert of its spent hash. PostgreSQL's unique index coordinates all workers sharing that database. The protected search receives the transaction object, so either the reservation and search succeed together or both roll back. The `status='reserved'` row is an in-transaction state; successful completion updates it to `spent`. A conflicting transaction cannot treat a provisional reservation as spendable until PostgreSQL resolves the first transaction.

Consider three concurrent timelines:

| First transaction                  | Second identical token | Result                                         |
| ---------------------------------- | ---------------------- | ---------------------------------------------- |
| Inserts and commits                | Waits, then conflicts  | Exactly one operation succeeds                 |
| Inserts, search throws, rolls back | Waits, then inserts    | Second may succeed                             |
| Inserts and commits, response lost | Waits, then conflicts  | Server spent once; client outcome is ambiguous |

The last row is why server atomicity does not by itself solve client recovery. A token is a bearer credential, and the response channel is not transactional with PostgreSQL.

## Migrations and release safety

The included migration is idempotent SQL for the reference build. A mature deployment needs versioned migration tooling, forward/backward compatibility windows, backup and restore rehearsal, and a rollback plan for application deployments. Schema changes involving spent-token uniqueness are high risk: dropping or weakening the key could permit replay; changing hash canonicalization could make old spent rows invisible. Preserve the token hashing domain and encoding rules across versions, or provide an explicit migration with security review.

For multi-region service, decide where authoritative spend state lives. Independent regional databases would each accept the same token unless there is a globally serialized spend decision. Latency and availability pressure do not remove this requirement. A single write authority may be the appropriate first production topology. If you later distribute it, prove the new consistency model under partitions, failover, and duplicate delivery.

## Acceptance exercise

Read [`tests/replay.test.ts`](../tests/replay.test.ts) and explain why twenty simultaneous redemptions result in one callback execution. Then remove the unique key in a disposable scratch database and predict the failure. Finally, diagram the transaction boundary if the protected resource becomes an external service. Identify which side effect cannot be rolled back and what durable job protocol would be required.
