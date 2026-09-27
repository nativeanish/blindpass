# 12 End-to-End Stress Testing & Formal Verification

> **Part V — Assurance · Build checkpoint 1 of 2**

*In this chapter*
- Model the redemption state machine in TLA+ and verify five safety invariants
- Stress-test 10,000 real VOPRF issue/finalize/redeem cycles against PostgreSQL
- Compose the full HTTP lifecycle from invoice to redemption in integration tests
- Drive the complete purchase-and-search flow through Playwright in a real browser
- Build an attack matrix mapping each threat to its defensive layer

The system is feature-complete. You will now verify it from the smallest
abstract state machine outward: model invariants, reference vectors, concurrent
transactions, HTTP composition, and finally the browser. Add no new production
behavior while a verification layer is failing.

No single test demonstrates unlinkability. The assurance case is layered:
reference vectors check wire compatibility, adversarial unit tests check
cryptographic rejection, PostgreSQL tests check atomicity, a state model checks
all small interleavings, stress tests search for runtime faults, and Playwright
checks the composed product. None replaces an independent security audit.

## 12.1 Step 1 — Model the redemption state machine

A small TLA+ specification separates the state-machine claim from TypeScript
and PostgreSQL syntax. `Reserve(t)` is one atomic action, matching the unique
insert. `Commit(t)` increments a success counter. `Rollback(t)` makes an
uncommitted credit available again.

```tla
(* File: verification/BlindPass.tla *)
---------------------------- MODULE BlindPass ----------------------------
EXTENDS Naturals, TLC

CONSTANT Tokens

ASSUME Tokens /= {}

VARIABLES paid, issued, tokenState, successes \* <1>

vars == <<paid, issued, tokenState, successes>>

Init == \* <2>
  /\ paid = FALSE
  /\ issued = FALSE
  /\ tokenState = [t \in Tokens |-> "fresh"]
  /\ successes = [t \in Tokens |-> 0]

Pay ==
  /\ ~paid
  /\ paid' = TRUE
  /\ UNCHANGED <<issued, tokenState, successes>>

Issue ==
  /\ paid
  /\ ~issued
  /\ issued' = TRUE
  /\ UNCHANGED <<paid, tokenState, successes>>

Reserve(t) == \* <3>
  /\ issued
  /\ tokenState[t] = "fresh"
  /\ tokenState' = [tokenState EXCEPT ![t] = "reserved"]
  /\ UNCHANGED <<paid, issued, successes>>

Commit(t) == \* <4>
  /\ tokenState[t] = "reserved"
  /\ tokenState' = [tokenState EXCEPT ![t] = "spent"]
  /\ successes' = [successes EXCEPT ![t] = @ + 1]
  /\ UNCHANGED <<paid, issued>>

Rollback(t) == \* <5>
  /\ tokenState[t] = "reserved"
  /\ tokenState' = [tokenState EXCEPT ![t] = "fresh"]
  /\ UNCHANGED <<paid, issued, successes>>

Next ==
  \/ Pay
  \/ Issue
  \/ \E t \in Tokens : Reserve(t)
  \/ \E t \in Tokens : Commit(t)
  \/ \E t \in Tokens : Rollback(t)

Spec == Init /\ [][Next]_vars

TypeOK ==
  /\ paid \in BOOLEAN
  /\ issued \in BOOLEAN
  /\ tokenState \in [Tokens -> {"fresh", "reserved", "spent"}]
  /\ successes \in [Tokens -> Nat]

AtMostOneSuccess == \A t \in Tokens : successes[t] <= 1 \* <6>

SuccessIsSpent == \* <7>
  \A t \in Tokens : successes[t] = 1 => tokenState[t] = "spent"

ReservationRequiresIssuance ==
  \A t \in Tokens : tokenState[t] /= "fresh" => issued

IssuanceRequiresPayment == issued => paid

=============================================================================
```

> **<1>** State variables: paid, issued, tokenState, successes
>
> **<2>** Init: all tokens in 'fresh' state
>
> **<3>** Reserve(t): atomic state transition, requires issued
>
> **<4>** Commit(t): reserved -> spent, increment success counter
>
> **<5>** Rollback(t): reserved -> fresh (available again)
>
> **<6>** AtMostOneSuccess invariant
>
> **<7>** SuccessIsSpent invariant

> **▶ Try It Out**
> ```bash
> cat verification/BlindPass.tla
> ```
> Expected output: The complete TLA+ specification for the abstract state machine.

```cfg
\* File: verification/BlindPass.cfg
SPECIFICATION Spec

CONSTANT Tokens = {t1, t2, t3}

INVARIANTS
  TypeOK
  AtMostOneSuccess
  SuccessIsSpent
  ReservationRequiresIssuance
  IssuanceRequiresPayment
```

> **▶ Try It Out**
> ```bash
> cat verification/BlindPass.cfg
> ```
> Expected output: The TLC configuration file contents.

Build the model the way you built the implementation. `Init` gives every token
the `fresh` state. `Reserve(t)` is enabled only after issuance and changes one
map entry atomically. `Commit(t)` moves that entry to `spent` and increments a
ghost success counter used only for verification. `Rollback(t)` returns a
reservation to `fresh`. The invariants then state the properties rather than
the mechanism: at most one success, success implies spent, and redemption state
requires paid issuance.

TLC enumerates all reachable interleavings for three tokens and checks that no
token obtains more than one committed success, a success is spent, reservation
requires issuance, and issuance requires payment.

> **📖 DEFINITION: Bounded model checking (TLC)**
>
> Bounded model checking explores every possible state combination and execution sequence of an abstract specification up to a finite boundary (such as three tokens) to prove that safety properties hold unconditionally within those bounds.

> **🔒 SECURITY NOTE: The TLA+ model is bounded verification of an abstract state machine, not a formal proof of PostgreSQL, the TypeScript driver, or VOPRF security**
>
> The model guarantees that if our database queries map to these transitions atomically, the state machine itself is secure. It does not replace code-level security tests.

Download a stable `tla2tools.jar` from the official
[TLA+ releases](https://github.com/tlaplus/tlaplus/releases), then run:

> **▶ Try It Out**
> ```bash
> export TLA2TOOLS_JAR=/absolute/path/to/tla2tools.jar
> java -jar "$TLA2TOOLS_JAR" -config verification/BlindPass.cfg verification/BlindPass.tla
> ```
> Expected output: TLC completes with 0 errors and validates all invariants across all states.

This is bounded model checking of an abstract state machine, not a formal proof
of PostgreSQL, the TypeScript driver, or VOPRF security. Its value is exhaustive
interleaving exploration within the model. If the implementation stops making
reservation atomic, the model no longer describes it.

## 12.2 Step 2 — Stress real cryptography and PostgreSQL

```typescript
// File: tests/stress.ts
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import { availableParallelism } from "node:os";
import {
  createBlindBatch,
  authorization,
} from "../packages/privacy-pass/src/index.js";
import { cryptoFixture } from "./helpers.js";
import { testDatabase } from "./database.js"; // <2>
import { RedemptionService } from "../packages/blindpass-server/src/index.js";

if (process.env.STRESS_WORKER) {
  const f = await cryptoFixture();
  const database = await testDatabase();
  const { sql } = database;
  const service = new RedemptionService(sql, [f.issuer]);
  const total = Number(process.env.STRESS_TOKENS);
  try {
    for (let issued = 0; issued < total; issued += 10) { // <1>
      const count = Math.min(10, total - issued);
      const batch = await createBlindBatch(f.manifest, count);
      const tokens = await batch.finalize(
        await f.issuer.evaluate(batch.requests),
      );
      for (const token of tokens)
        await service.redeem(authorization(token), async () => true);
      process.send?.(count);
    }
  } finally {
    await database.cleanup();
  }
} else {
  const total = Number(process.env.STRESS_TOKENS ?? 10000); // <3>
  const start = Date.now();
  const workers = Math.min(16, availableParallelism());
  let completed = 0;
  let next = 1000;
  await Promise.all(
    Array.from(
      { length: workers },
      (_, i) =>
        new Promise<void>((resolve, reject) => {
          const count =
            Math.floor(total / workers) + (i < total % workers ? 1 : 0);
          const child = fork(fileURLToPath(import.meta.url), [], {
            execArgv: ["--import", "tsx"],
            env: {
              ...process.env,
              STRESS_WORKER: "1",
              STRESS_TOKENS: String(count),
            },
            stdio: ["ignore", "ignore", "inherit", "ipc"],
          });
          child.on("message", (n: number) => {
            completed += n;
            if (completed >= next) {
              console.log(
                `${completed}/${total} real issue + PostgreSQL redemption cycles passed`,
              );
              next += 1000;
            }
          });
          child.on("error", reject);
          child.on("exit", (code) =>
            code === 0
              ? resolve()
              : reject(new Error(`Crypto stress worker failed: ${code}`)), // <4>
          );
        }),
    ),
  );
  if (completed !== total) throw new Error("Incomplete stress test");
  console.log(
    `PASS: ${total} RFC 9578 issue/redeem cycles in ${((Date.now() - start) / 1000).toFixed(1)}s`,
  );
}
```

> **<1>** Workers create genuine blind requests and issuer proofs
>
> **<2>** Each worker gets isolated PostgreSQL schema
>
> **<3>** 10,000 cycles as reliability gate
>
> **<4>** First worker error preserved with phase context

> **▶ Try It Out**
> ```bash
> pnpm test:stress
> ```
> Expected output: "PASS: 10000 RFC 9578 issue/redeem cycles in Xs"

Workers create genuine blind requests, issuer proofs, finalized tokens, and
PostgreSQL reservations. Each worker gets an isolated schema so token hashes
cannot collide across fixtures. Ten thousand cycles are a reliability gate,
not a statistical proof of cryptographic security.

> **⚠ PITFALL: A stress failure should retain the first worker error and its phase — do not hide it behind aggregate throughput output**
>
> In high-concurrency tests, catching the first failure trace is critical for diagnosing intermittent Postgres locks or networking hiccups. Swallowing worker errors into a generic `Stress test failed` error discards essential evidence.

Start with `STRESS_TOKENS=100` while changing code. Raise it only after focused
tests pass. Use the smaller value during development. The default gate is intentionally
expensive and should run on known hardware in release verification.

> **▶ Try It Out**
> ```bash
> STRESS_TOKENS=100 pnpm test:stress
> ```
> Expected output: Completes the stress test rapidly for local development iteration.

## 12.3 Step 3 — Compose the HTTP lifecycle

```typescript
// File: tests/integration.test.ts
import { beforeAll, afterAll, it, expect } from "vitest";
import { createApp } from "../apps/api/src/app.js";
import { testDatabase } from "./database.js";
import { createBlindBatch } from "../packages/privacy-pass/src/index.js";
import {
  canonical,
  sha256,
  type Invoice,
} from "../packages/shared/src/index.js";
let database: Awaited<ReturnType<typeof testDatabase>>;
let runtime: Awaited<ReturnType<typeof createApp>>;
beforeAll(async () => {
  database = await testDatabase();
  runtime = await createApp({ database });
});
afterAll(async () => {
  await runtime?.app.close();
  await database?.cleanup();
});
async function invoice() {
  const r = await runtime.app.inject({
    method: "POST",
    url: "/api/invoices",
    payload: { offerId: "search-10" },
  });
  expect(r.statusCode).toBe(201);
  return r.json<Invoice>();
}
async function pay(id: string, confirmations = 3, reorg = false) {
  return runtime.app.inject({
    method: "POST",
    url: `/api/dev/pay/${id}`,
    payload: { confirmations, reorg },
  });
}
it("issues only after confirmed payment; retries the same transcript but refuses another batch", async () => {
  const inv = await invoice();
  const batch = await createBlindBatch(runtime.keys.manifest);
  const payload = {
    capability: inv.capability,
    requests: batch.requests,
    configurationHash: await sha256(canonical(runtime.keys.manifest)),
  };
  const pending = await runtime.app.inject({ // <1>
    method: "POST",
    url: "/api/issuance",
    payload,
  });
  expect(pending.json().error.code).toBe("PAYMENT_NOT_CONFIRMED");
  await pay(inv.id, 0); // <2>
  expect((await runtime.invoiceService.get(inv.capability!)).status).toBe(
    "PAYMENT_DETECTED",
  );
  await pay(inv.id, 1);
  expect((await runtime.invoiceService.get(inv.capability!)).status).toBe(
    "WAITING_FOR_CONFIRMATION",
  );
  await pay(inv.id);
  expect((await runtime.invoiceService.get(inv.capability!)).status).toBe(
    "PAYMENT_CONFIRMED",
  );
  const response = await runtime.app.inject({ // <3>
    method: "POST",
    url: "/api/issuance",
    payload,
  });
  expect(response.statusCode).toBe(200);
  const tokens = await batch.finalize(response.json().responses);
  expect(tokens).toHaveLength(10);
  for (const token of tokens) await runtime.keys.issuer.verify(token.token);
  const retry = await runtime.app.inject({ // <4>
    method: "POST",
    url: "/api/issuance",
    payload,
  });
  expect(retry.json()).toEqual(response.json());
  const next = await createBlindBatch(runtime.keys.manifest);
  const duplicate = await runtime.app.inject({ // <5>
    method: "POST",
    url: "/api/issuance",
    payload: { ...payload, requests: next.requests },
  });
  expect(duplicate.json().error.code).toBe("ISSUANCE_ALREADY_COMPLETED");
  const rows =
    await database.sql`SELECT * FROM issuance_authorizations WHERE invoice_id=${inv.id}`;
  expect(rows[0].issued_count).toBe(10);
  expect(JSON.stringify(rows)).not.toContain(tokens[0].token);
});
it("handles duplicate events, reorgs and expiry", async () => {
  const inv = await invoice();
  await pay(inv.id);
  await pay(inv.id);
  const [count] =
    await database.sql`SELECT count(*)::int AS n FROM invoice_payment_events WHERE invoice_id=${inv.id}`;
  expect(count.n).toBe(1);
  await pay(inv.id, 0, true);
  expect((await runtime.invoiceService.get(inv.capability!)).status).toBe(
    "PAYMENT_REORGED",
  );
  expect(
    await database.sql`SELECT * FROM issuance_authorizations WHERE invoice_id=${inv.id}`,
  ).toHaveLength(0);
  const expired = await invoice();
  await database.sql`UPDATE invoices SET expires_at=now()-interval '1 minute' WHERE id=${expired.id}`;
  await pay(expired.id);
  expect((await runtime.invoiceService.get(expired.capability!)).status).toBe(
    "EXPIRED",
  );
});
it("requires a secret capability and rejects invalid requests without sensitive data", async () => {
  const inv = await invoice();
  expect((await runtime.app.inject(`/api/invoices/${inv.id}`)).statusCode).toBe(
    404,
  );
  const result = await runtime.app.inject({
    method: "POST",
    url: "/api/invoices",
    payload: { offerId: "not-an-offer" },
  });
  expect(result.statusCode).toBe(400);
  expect(result.body).not.toContain("stack");
});
```

> **<1>** Create invoice, prove unpaid issuance fails
>
> **<2>** Emit confirmation events, advance state
>
> **<3>** Issue batch, finalize, verify
>
> **<4>** Identical transcript retry = idempotent
>
> **<5>** Different batch rejected

> **▶ Try It Out**
> ```bash
> pnpm test
> ```
> Expected output: The Vitest runner outputs successful completion of integration test suites.

The first integration test crosses invoice, payment, authorization, issuance,
proof finalization, and retry behavior. It proves that an unpaid invoice cannot
issue, confirmation states advance, the identical transcript is idempotent,
and a second batch is refused. The remaining cases cover duplicate scanner
events, reorg revocation, expiry, and capability secrecy.

Follow the first test as a construction script: create an invoice, prove unpaid
issuance fails, emit zero/one/three-confirmation events, issue one batch,
finalize it, retry the identical body, attempt a different batch, and inspect
the authorization row. Every assertion advances exactly one state transition.

The browser suite then drives real UI and IndexedDB:

```typescript
// File: tests/e2e/app.spec.ts
import { test, expect } from "@playwright/test";
test("buys a simulated invoice, receives real credits, searches and updates the local wallet", async ({ // <1>
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/app/buy");
  await page.getByRole("button", { name: "Get 10 private credits" }).click();
  await expect(
    page.getByText("SIMULATED PAYMENT EVENT", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Simulate payment confirmation" })
    .click();
  await page.getByRole("button", { name: "Receive private credits" }).click();
  await expect(
    page.getByText("10 PRIVATE CREDITS READY", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Make your first private search" })
    .click();
  await page.getByLabel("Search query").fill("privacy");
  await page.getByRole("button", { name: "Search privately" }).click();
  await expect(
    page.getByText(/PRIVATE CREDIT USED · 9 REMAINING/),
  ).toBeVisible();
  await expect(page.locator(".search-result").first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("9 CREDITS", { exact: true })).toBeVisible();
  await page.goto("/app");
  await expect(page.locator(".stat-card.primary .stat-value")).toContainText(
    "9",
  );
  await page.screenshot({ path: "test-results/dashboard.png", fullPage: true });
  expect(errors).toEqual([]);
});
test("runs real two-client issuance, shuffled redemption and all attacks", async ({
  page,
}) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: "Run complete demo" }).click();
  await expect(
    page.getByText(
      "Demo complete. Real credentials verified. Replay, forgery and malicious configuration rejected.",
    ),
  ).toBeVisible({ timeout: 60000 });
  await expect(
    page.locator(".attack-result").filter({ hasText: "TOKEN_ALREADY_SPENT" }),
  ).toBeVisible();
  await expect(
    page.locator(".attack-result").filter({ hasText: "INVALID_TOKEN" }),
  ).toBeVisible();
  await expect(
    page
      .locator(".attack-result")
      .filter({ hasText: "ISSUER_POLICY_VIOLATION" }),
  ).toBeVisible();
  await expect(page.locator(".demo-matrix")).toContainText("50%");
  await page.getByRole("button", { name: "Run privacy audit" }).click();
  await expect(
    page.getByText("DIRECT NETWORK CONNECTION", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Stronger privacy assumptions" })
    .click();
  await expect(
    page.getByText("REDUCED SIDE-CHANNEL LINKABILITY", { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "test-results/live-demo.png", fullPage: true });
});
test("landing, docs, merchant view, presentation and mobile layout render cleanly", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Pay privately. Use privately." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/landing-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/landing-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/demo/privacy");
  await expect(
    page.getByRole("heading", { name: "Break the link. Know the limits." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.goto("/docs");
  await expect(
    page.getByRole("heading", {
      name: "Access is a proof. It doesn’t need a profile.",
    }),
  ).toBeVisible();
  await page.goto("/admin");
  await expect(
    page.getByText("Payments dataset", { exact: true }),
  ).toBeVisible();
  await page.goto("/presentation");
  await expect(
    page.getByRole("heading", { name: "Private payment ≠ private usage." }),
  ).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("heading", {
      name: "One session. Every request connected.",
    }),
  ).toBeVisible();
});
```

> **<1>** Drive the complete purchase-and-search flow through Playwright in a real browser

> **▶ Try It Out**
> ```bash
> pnpm build
> pnpm test:e2e
> ```
> Expected output: Playwright runs browser automation and passes successfully.

## 12.4 Step 4 — Audit Alice and Bob honestly

The demo creates separate in-memory stores for Alice and Bob, buys identical
offers, issues under the same epoch configuration, shuffles redemptions, and
asks an observer using only issuance and redemption transcripts to match each
token to a buyer. With two symmetric candidates, transcript-only assignment is
no better than chance under the VOPRF assumptions.

That demonstration does not “cryptographically prove zero linkability” in the
absolute. The proof is a reduction in RFC 9497's security model; the demo checks
that this composition does not add an obvious identifier. Network timing,
query choice, a compromised client, or a partitioned first-use configuration
can reveal the answer. Label the UI's 50% result as a two-candidate model, not a
measured real-world anonymity probability.

## 12.5 Step 5 — Build an attack matrix

| Attack                    | Expected observation       | Defense under test                |
| ------------------------- | -------------------------- | --------------------------------- |
| Flip token bit            | `INVALID_TOKEN`            | VOPRF authenticator               |
| Corrupt issuance proof    | finalization rejects batch | DLEQ verification                 |
| Replay one token 20 times | one success                | unique insert transaction         |
| Throw during paid work    | later retry succeeds       | transaction rollback              |
| Sign buyer-specific key   | policy violation           | pin + common manifest             |
| Append token bytes        | parser rejects             | exact length + canonical encoding |
| Modify webhook whitespace | HMAC rejects               | exact raw-body MAC                |
| Downgrade `socks5h`       | Tor unavailable            | remote-DNS policy                 |

Every row should name the layer that owns the invariant. A browser test cannot
diagnose point serialization, and a crypto unit test cannot expose a proxy log.

### Build checkpoint

You now have executable evidence from algebraic vectors to a model-checked
state machine and full browser flow, with the limits of each form stated
explicitly.
