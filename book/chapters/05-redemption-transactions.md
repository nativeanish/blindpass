# 5 Redemption Middleware & Transactional Double-Spend Prevention

> **Part II — Credentials · Build checkpoint 2 of 3**

*In this chapter*
- Understand why read-then-insert creates a double-spend race
- Build the atomic INSERT ... ON CONFLICT DO NOTHING redemption primitive
- Make protected work transactional with the reservation
- Prove the race boundary with 20 concurrent requests against PostgreSQL

You will build redemption twice mentally: first the broken read-then-insert
version, then the atomic unique-insert version. Only the second version belongs
in the file. The contrast explains why the SQL statement is the synchronization
primitive.

Cryptographic verification answers “did an issuer create this token?” It does
not answer “has somebody already spent it?” Two requests can verify the same
token concurrently. A read-then-write implementation lets both pass:

```text
request A: SELECT -> absent
request B: SELECT -> absent
request A: perform paid work; INSERT
request B: perform paid work; INSERT or fail too late
```

The reservation and the protected work must share one authoritative database
transaction.

## 5.1 Step 1 — Define the verifier boundary

```typescript
// File: packages/blindpass-server/src/index.ts
import type { Sql, TransactionSql } from "postgres";
import { BlindPassError, type Manifest } from "@blindpass/shared";
import {
  TokenIssuer,
  parseAuthorization,
  spentHash,
} from "@blindpass/privacy-pass";

export interface CreditVerifier { // <1>
  manifest: Manifest;
  verify(raw: string, now?: number, tokenClass?: string): Promise<unknown>;
}

export class RedemptionService {
  constructor(
    private sql: Sql,
    private issuers: CreditVerifier[],
  ) {}

  async redeem<T>(
    header: string | undefined,
    work: (transaction: TransactionSql) => Promise<T>,
    tokenClass = "search-v1",
  ): Promise<T> {
    const raw = parseAuthorization(header);
    let matched: CreditVerifier | undefined;
    let lastError: unknown;

    for (const issuer of this.issuers) { // <2>
      try {
        await issuer.verify(raw, Date.now(), tokenClass);
        matched = issuer;
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!matched) throw lastError ?? new BlindPassError("INVALID_TOKEN", 401);

    const tokenHash = await spentHash(raw); // <3>
    const manifest = matched.manifest;

    // A duplicate insert waits for the winning transaction. If work fails, rollback makes the credit usable again.
    return (await this.sql.begin(async (tx) => { // <4>
      const inserted =
        await tx`INSERT INTO redeemed_tokens(token_hash,issuer_epoch,status,expires_at) VALUES(${tokenHash},${manifest.epoch},'reserved',${manifest.expiresAt}) ON CONFLICT DO NOTHING RETURNING token_hash`; // <5>

      if (!inserted.length) // <6>
        throw new BlindPassError("TOKEN_ALREADY_SPENT", 409);

      const result = await work(tx); // <7>

      await tx`UPDATE redeemed_tokens SET status='spent',spent_at=now() WHERE token_hash=${tokenHash} AND issuer_epoch=${manifest.epoch}`; // <8>

      return result;
    })) as T;
  }
}

export { TokenIssuer };

// Framework-neutral middleware factory. The handler executes inside the authoritative reservation transaction.
export function blindpass(options: {
  offer: string;
  cost: 1;
  redemption: RedemptionService;
}) {
  if (options.cost !== 1)
    throw new Error("Only fixed-cost, single-credit resources are supported.");
  return <T>(
    authorization: string | undefined,
    handler: (transaction: TransactionSql) => Promise<T>,
  ) => options.redemption.redeem(authorization, handler, options.offer);
}
```

> **<1>** CreditVerifier interface — verify without access to invoices/payments
>
> **<2>** Try active then grace-period issuers
>
> **<3>** Domain-separated spent hash (blindpass-spent-token-v1)
>
> **<4>** BEGIN transaction
>
> **<5>** INSERT ... ON CONFLICT DO NOTHING RETURNING — the atomic arbiter
>
> **<6>** Zero rows returned = token already spent
>
> **<7>** Execute protected work within same transaction
>
> **<8>** Mark reservation as 'spent' and COMMIT

> **▶ Try It Out**
> ```bash
> pnpm exec tsc --noEmit
> ```
> The code should compile successfully without type errors.

## 5.2 Step 2 — Let the unique constraint choose the winner

Now follow `redeem` line by line. PostgreSQL's unique index serializes contenders. When A has inserted an uncommitted key, B's conflicting insert waits. If A commits, B sees the conflict and returns no row. If A rolls back, B may insert and continue. Application code does not need a process-local mutex and remains correct across API replicas.

```text
Request A                PostgreSQL             Request B
   │                     unique index                │
   │── INSERT hash ─────────>│                       │
   │<── row returned ────────│                       │
   │                         │<── INSERT same hash ──│
   │                         │    (waits for A)      │
   │── work + COMMIT ───────>│                       │
   │                         │── conflict, 0 rows ──>│
   │                         │                       │
   │                         │    TOKEN_ALREADY_SPENT │
```

> **⚠ PITFALL: PostgreSQL READ COMMITTED allows SELECT→INSERT race.**
>
> Only INSERT ... ON CONFLICT DO NOTHING serializes contenders through the unique index. Splitting it into a `SELECT` and `INSERT`, even inside the default `READ COMMITTED` isolation level, restores the race. The returned row is the proof that this transaction won.

The `blindpass` factory fixes cost at one. Supporting arbitrary costs would need
an atomic selection and reservation of multiple independent tokens or a
different credential construction; silently looping would create partial-spend
failure modes.

## 5.3 Step 3 — Make the protected effect transactional

Reservation alone is insufficient if the paid side effect happens in another
database or an irreversible external service. BlindPass search executes with
the transaction handle, so a thrown error rolls back both result work and the
reservation.

```text
  ┌───────┐    INSERT     ┌──────────┐   UPDATE    ┌───────┐
  │ fresh │──────────────>│ reserved │────────────>│ spent │
  └───────┘               └────┬─────┘             └───────┘
                               │ ROLLBACK
                               ▼
                          ┌───────┐
                          │ fresh │  (available again)
                          └───────┘
```

For email, object storage, or third-party APIs, use a transactional
outbox and define when the credit becomes spent. Exactly-once external effects
do not emerge from a SQL transaction by wishful thinking.

Long work holds a connection and a unique-index wait queue. Keep protected
database work short, set statement and transaction timeouts in production, and
cap concurrent requests.

> **💡 TIP: A crashed connection rolls back its reservation automatically.**
>
> Stale reserved rows indicate a code bug, not normal crash recovery. If you see stale reservations, it means a code path committed without the final update, not that a process crashed.

## 5.4 Step 4 — Prove the race at the boundary

```typescript
// File: tests/replay.test.ts
import { it, expect } from "vitest";
import { testDatabase } from "./database.js";
import { RedemptionService } from "../packages/blindpass-server/src/index.js";
import {
  createBlindBatch,
  authorization,
} from "../packages/privacy-pass/src/index.js";
import { cryptoFixture } from "./helpers.js";

it("allows exactly one of 20 concurrent redemptions and rolls back failed work", async () => {
  const database = await testDatabase();
  const { sql } = database;
  try {
    const f = await cryptoFixture();
    const batch = await createBlindBatch(f.manifest, 2);
    const tokens = await batch.finalize(
      await f.issuer.evaluate(batch.requests),
    );
    const service = new RedemptionService(sql, [f.issuer]);
    
    let calls = 0;
    const results = await Promise.allSettled( // <1>
      Array.from({ length: 20 }, () =>
        service.redeem(authorization(tokens[0]), async () => {
          calls++;
          return "result";
        }),
      ),
    );
    
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1); // <2>
    expect(calls).toBe(1);
    for (const r of results)
      if (r.status === "rejected")
        expect((r.reason as any).code).toBe("TOKEN_ALREADY_SPENT");
        
    await expect( // <3>
      service.redeem(authorization(tokens[1]), async () => {
        throw new Error("before work");
      }),
    ).rejects.toThrow("before work");
    
    await expect( // <4>
      service.redeem(authorization(tokens[1]), async () => "retry"),
    ).resolves.toBe("retry");
  } finally {
    await database.cleanup();
  }
});
```

> **<1>** Send 20 concurrent promises using the exact same valid credential token.
>
> **<2>** The assertion requires one fulfilled result and one entry into the protected handler. The other nineteen must receive the stable conflict error `TOKEN_ALREADY_SPENT`.
>
> **<3>** For the second token, the handler throws an error, causing a transaction rollback.
>
> **<4>** A subsequent attempt with the exact same second token succeeds, proving that reservation rollback follows work rollback.

> **▶ Try It Out**
> ```bash
> docker compose up -d postgres
> pnpm exec vitest run tests/replay.test.ts
> ```
> Output should show 1 test passed, demonstrating that the database perfectly enforced the mutual exclusion.

### Boundary attacks

> **🔒 SECURITY NOTE: Noncanonical encoding attack**
>
> Parse-and-reserialize equality blocks it before hashing. If two byte strings parse identically but hash differently, an attacker gets a double-spend alias.

A database outage returns a service error and cannot authorize work. A token
from a valid issuer but another class fails before insertion. A replay after
epoch rotation still reaches the correct grace-period verifier and the same
epoch-scoped primary key.

### Build checkpoint

The database is now part of the authorization proof. No API replica can spend a
token until PostgreSQL grants it the unique reservation, and no reservation
survives failed transactional work.
