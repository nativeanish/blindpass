# 16. Implement the HTTP and SDK boundary

The API is the composition root. It initializes the database, loads keys, selects the mock or scanner watcher, constructs invoice/issuance/redemption services, and registers routes. The SDK is the client-side policy engine. Reading them together reveals which data crosses each trust boundary.

## Keep route handlers thin

[`createApp`](../apps/api/src/app.ts) parses strict input and delegates. `POST /api/invoices` accepts only `search-10`; the server determines amount and destination. `GET /api/invoices/:capability` looks up a secret capability. `POST /api/issuance` accepts ten blind requests, capability, and configuration hash. `GET /api/search` validates a nonempty query up to 240 characters, then passes the authorization header to `RedemptionService` and the query to the local search function. This arrangement keeps HTTP concerns separate from transactional rules.

Error responses carry stable codes such as `PAYMENT_NOT_CONFIRMED`, `ISSUANCE_ALREADY_COMPLETED`, `INVALID_TOKEN`, `TOKEN_ALREADY_SPENT`, and `SERVICE_TEMPORARILY_UNAVAILABLE`. Clients can make state decisions from these codes rather than parsing English messages. The error handler deliberately avoids stack traces and routine request details. A 401 response includes a `WWW-Authenticate` challenge. A production API should document which errors definitely leave a token unspent and maintain that contract across versions.

The API sets `Cache-Control: no-store` and `Referrer-Policy: no-referrer`, checks browser origins, limits body size, and disables default request logging. These are useful application controls, but a reverse proxy can still log paths, headers, and queries. The capability in a URL path is particularly sensitive. If you change the API shape, consider a POST with a capability header or body, document the tradeoff, and update all clients and caches consistently.

## Treat the SDK as a state machine

The client sequence is not “fetch, then show a screen.” It is:

```text
validate merchant policy → buy signed invoice → observe payment state
→ create and submit blind batch → verify returned policy and proofs
→ persist credentials → reserve one locally → send redemption
→ mark used or restore only on a definite non-spend response
```

[`BlindPassClient.configuration`](../packages/blindpass-client/src/index.ts) verifies the signed manifest and persists a fingerprint and accepted configuration. `buy` validates the signed invoice against that manifest and the fixed product policy. `issue` retains the same in-memory batch for a transport retry. `search` selects an unexpired credential, saves its removal, and sends one authorization header. These methods are responsible for security decisions; a UI component should display their outcomes, not duplicate them.

The `CredentialStore.exclusive` method serializes local changes. The in-memory implementation uses a promise queue; the browser uses Web Locks; the CLI uses a filesystem lock. This is not a convenience abstraction. Without it, two tabs can each load a balance of one and both attempt to spend the same token, while later saves overwrite one another. The server would still reject replay, but the client experience and local accounting could be corrupted.

## Trace an example request

Suppose a user searches for `privacy pass`. The SDK selects one unexpired token and writes the vault with that token absent. It URL-encodes the query and sends `Authorization: PrivateToken token="..."` without cookies, redirects, cache, or referrer. The API validates the query _before_ redemption, so an empty query does not consume a token. The verifier checks token authenticity and context; the database reserves its hash; search runs inside the transaction and returns ranked local documents. After commit, the SDK records one used credit. If a 503 indicates the local search failed before commit, it restores the token. If the TCP connection simply disappears after the request, the client cannot know whether the server committed and conservatively does not restore it.

This example illustrates why the placement of validation matters. If query validation happened after the spend committed, a client typo could burn a credit. If the SDK restored after _every_ error, an ambiguous response could cause an automatic replay attempt. If the API logged the full URL, the query would become a durable behavioral record despite the database schema's privacy separation.

## Service integration contract

The server package exports a framework-neutral `blindpass` helper with `offer`, `cost: 1`, and a `RedemptionService`. The protected callback receives the transaction handle. That means a new fixed-cost local resource can reuse the verifier if its work is transactionally reversible. A production integration must assess four conditions: exactly one credit per successful operation; no external irreversible side effect inside the callback; bounded work time while a database transaction remains open; and no token or query leakage in logs. If any condition fails, design a new reservation/outbox protocol instead of stretching this helper.

## Acceptance exercise

Trace `POST /api/issuance` from Zod parsing through row locks, VOPRF evaluation, response serialization, proof verification, and vault save. At each arrow, write the exact secret or metadata crossing it. Repeat for `GET /api/search`. If your tracing includes an invoice capability on the search request or a finalized token on the issuance request, you have accidentally crossed the privacy boundary.
