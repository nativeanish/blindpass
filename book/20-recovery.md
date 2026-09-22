# 20. Failure recovery and release acceptance

The most difficult production behavior sits between two durable systems. PostgreSQL may commit while the client's response is lost; a scanner may see a payment while its webhook is lost; an issuer may commit while the browser crashes before saving tokens. A robust design names these windows and decides who bears the risk. “Retry” is not a complete policy.

## Make the failure matrix explicit

| Failure point                                     | Server state                  | Client state             | Current reference behavior         | Production work                                           |
| ------------------------------------------------- | ----------------------------- | ------------------------ | ---------------------------------- | --------------------------------------------------------- |
| Payment observed, webhook lost                    | No authorization yet          | Waiting                  | No automatic reconciliation worker | Poll scanner and reapply same handler                     |
| Payment reorg before issuance                     | Authorization revoked         | May be waiting           | Reject issuance                    | Reconcile canonical chain and explain status              |
| Payment reorg after issuance                      | Tokens may exist              | Credits usable           | Aggregate merchant-risk event      | Reserve/confirmation policy and incident process          |
| Issuance committed, response lost in same process | Responses stored              | Blinding state in memory | Same transcript can be retried     | Preserve identical request and response state             |
| Issuance committed, client process crashes        | Responses stored              | Blinding state lost      | Credits can be lost                | Encrypted pending issuance journal or new protocol        |
| Search work fails before commit                   | No spent row                  | Token locally removed    | Definite 503 restores token        | Maintain error/rollback contract                          |
| Search commits, response lost                     | Spent row exists              | Token locally removed    | No automatic replay                | Honest ambiguous-outcome UX or privacy-preserving receipt |
| Epoch secret lost                                 | Database still references key | Tokens exist             | Verification fails                 | Key backup/restore and incident plan                      |

The table is not just an operations checklist. It defines the economic semantics users experience and the privacy constraints that limit recovery. A familiar account system could look up a customer's purchase and issue replacement credits. BlindPass intentionally lacks that join after issuance. Any replacement mechanism must prevent double issuance without learning which final tokens belong to an invoice.

## Design a pending-issuance journal

The current client constructs a blind batch in memory, then sends it. To survive a crash after server commitment, a production client would need to persist enough state to reconstruct _the same_ blinded requests and finalize the stored responses. Depending on library capabilities, that may require serializing nonce, blinding scalar, challenge, key identity, and request bytes in a versioned encrypted record. Do not assume the current library exposes a safe serialization API; inspect it and review any extension. Never store this state unencrypted or upload it to the issuer.

A candidate journal state machine is `prepared → submitted → responses received → finalized and stored → journal deleted`. Write `prepared` durably before transport. On restart, validate the pinned manifest and retry the exact request bytes with the same capability. The server returns stored responses only if the request digest matches. Finalize and save all credentials in one protected vault transaction, then remove the journal. If the journal is lost or corrupted, stop; generating new blind requests would be rejected by the server and could not recover the original credits. Tests should kill the client at every transition and confirm neither duplicate issuance nor silent credit disappearance is reported as success.

The journal itself becomes sensitive: it contains the secrets that make a blind response useful. Its lifetime should be short, its encryption key protected, and its deletion verified through ordinary storage semantics. Browser IndexedDB cannot guarantee secure erasure of old pages or backups; threat claims should reflect that limit.

## Model redemption ambiguity honestly

The server can atomically spend a token with local work, but it cannot atomically deliver the HTTP response to the client. A timeout after sending the request has two possible histories: the server never committed, or it committed and the response was lost. The current SDK conservatively removes the token in both cases and avoids an automatic second-token retry. This may lose a usable credit, but it prevents a double charge from a blind retry.

One production option is an idempotent result retrieval mechanism keyed by the token or a derived opaque handle. That mechanism has privacy consequences: retaining a query/result or lookup handle can create a durable behavioral record, and exposing token-derived handles may allow correlation. Another option is to accept occasional ambiguity and provide transparent user messaging and support. Evaluate the product's value per request, adversary model, storage cost, and privacy claim before choosing. There is no free recovery endpoint in the reference code.

## Incident runbooks

For a **scanner outage**, stop claiming payment confirmation, keep invoices in their current state, restore the scanner, reconcile from a known chain checkpoint, and compare every active invoice before re-enabling issuance. Do not manually mark invoices paid based on an unauthenticated screenshot.

For a **database outage**, reject issuance and redemption with a temporary failure. Never accept a token and execute paid work without authoritative replay storage. After restore, verify spent-token uniqueness, epoch registration, and consistency with backed-up keys before reopening traffic.

For an **issuer-key mismatch**, stop issuance immediately. Compare the deployed key's derived public ID with the database's epoch record and every API node. Restore the intended secret; do not overwrite the epoch record with a newly generated key while outstanding credits exist. If the secret is irretrievably lost, handle outstanding value under a disclosed incident policy.

For a **credential or capability leak**, identify which bearer secret was exposed and where. A capability threatens invoice access and possibly issuance if not completed. A finalized token can be spent by anyone holding it. Rotation of a merchant signing key does not revoke a leaked token. Limit log access, remove exposed copies where possible, and communicate the actual scope without inventing an individual revocation capability.

## A release acceptance record

Write a dated document for each release with four sections: code revision and dependency lockfile; environment and deployed topology; tests and external evidence; unresolved limitations. The test section should include protocol vectors, signed-policy attacks, scanner testnet transactions, duplicate/reorg delivery, concurrent replay, vault crash points, edge-log inspection, backup restore, and key rotation. State which tests were simulated, which used a live testnet, and which require independent review. The current [`docs/verification.md`](../docs/verification.md) is a model for accurate claims, while this chapter defines a broader production gate.

The book ends at a useful boundary: a developer can explain and exercise the reference application and can name the work required to operate a real one. A production deployment is complete only when its scanner, recovery, client distribution, key lifecycle, and operations have been implemented and verified in the actual environment.
