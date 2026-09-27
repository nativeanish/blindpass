# 7 Shielded Payment Architecture (Zcash Orchard)

> **Part III — Payments · Build checkpoint 1 of 2**

*In this chapter*
- Define the custody boundary between BlindPass and external Zcash infrastructure
- Build exact decimal-to-BigInt ZEC value conversion
- Implement the PaymentWatcher interface and an honest mock
- Fix denomination and cohort shape as privacy parameters

This chapter builds the payment port before connecting a scanner. Start with exact value conversion, define the watcher interface, and implement a mock that cannot be confused with a real wallet. Chapter 8 will implement the production adapter and invoice transitions.

Privacy Pass hides the relationship between issuance and redemption. It does not hide the payment itself. BlindPass therefore accepts a fixed ZEC amount at a fresh diversified Unified Address whose receiver set includes Orchard and excludes transparent P2PKH/P2SH receivers.

> **📖 DEFINITION: Unified Address (ZIP-316)**
>
> A container for multiple receiver types (Orchard, Sapling, transparent); the encoded string prefix alone does not prove an Orchard receiver.

## 7.1 Step 1 — Draw the custody boundary

ZIP 316 defines Unified Addresses as containers for one or more receiver types. An encoded string that merely begins with a familiar prefix is not proof of an Orchard receiver. Address parsing and receiver inspection belong in established Zcash tooling at the scanner bridge. The TypeScript API demands that the bridge return its validation result and then enforces the required policy.

```text
┌──────────────────┐     ┌────────────────┐     ┌─────────────┐
│ Merchant incoming │────>│ Scanner bridge  │────>│ Invoice API │
│ viewing capability│     │ (derive UA)    │     │             │
└──────────────────┘     └───────┬────────┘     └──────┬──────┘
                                 │                      │
                                 │ scan blocks          │ zcash: URI
                                 ▼                      ▼
                         ┌───────────────┐     ┌──────────────┐
                         │ Zcash network │     │ Customer     │
                         │               │<────│ wallet       │
                         └───────────────┘     └──────────────┘

     ╳ Spending key NEVER enters the API ╳
```

BlindPass does not bundle a wallet, light client, or mainnet address derivation library. `ScannerPaymentWatcher` is an explicit adapter contract for separately deployed, audited Zcash infrastructure. The API needs incoming viewing and address derivation capability through that bridge; it does not need a spending key.

## 7.2 Step 2 — Represent value without floating point

One ZEC equals 100,000,000 zatoshis. Binary floating point cannot exactly represent most decimal fractions, so `Number(amount) * 1e8` eventually accepts or rejects the wrong payment. Parse the decimal syntax and convert with `BigInt`.

> **⚠ PITFALL: Floating-point on zatoshis**
>
> Number(0.01) * 1e8 evaluates to 999999.9999999999 in JavaScript. Parse decimal, convert with BigInt.
> ```javascript
> // WRONG: Number("0.01") * 1e8 → 999999.9999999999
> // RIGHT: BigInt("0") * 100000000n + BigInt("01".padEnd(8, "0")) → 1000000n
> ```

```typescript
// File: packages/zcash/src/index.ts
import { EventEmitter } from "node:events";
import { z } from "zod";

export const PaymentEventSchema = z // <1>
  .object({
    eventId: z.string().min(8).max(200),
    invoiceId: z.string().min(5).max(100),
    txid: z.string().min(8).max(128),
    amount: z.string().regex(/^\d+(\.\d{1,8})?$/),
    blockHeight: z.number().int().nonnegative().nullable().default(null),
    confirmations: z.number().int().nonnegative(),
    reorg: z.boolean().default(false),
  })
  .strict();
export type PaymentEvent = z.infer<typeof PaymentEventSchema>;

export interface PaymentDestination {
  address: string;
  paymentUri: string;
  simulated: boolean;
}

export interface PaymentWatcher { // <2>
  createInvoice(input: {
    invoiceId: string;
    amount: string;
  }): Promise<PaymentDestination>;
  getInvoice(invoiceId: string): Promise<PaymentEvent | null>;
  subscribe(listener: (event: PaymentEvent) => Promise<void>): () => void;
}
```

> **<1>** PaymentEventSchema — Zod strict validation for scanner events.
>
> **<2>** PaymentWatcher interface — no concrete scanner vendor.

> **▶ Try It Out**
> ```bash
> pnpm exec vitest run tests/scanner.test.ts -t "fixed decimal"
> ```
> Expected output is exact arithmetic test passes.

Build the file from pure functions toward effects:

1. Define and export `PaymentEventSchema`; every adapter will validate the same event shape.
2. Define `PaymentDestination` and `PaymentWatcher` without mentioning a concrete scanner vendor.
3. Implement `zatoshis` and `paymentUri` as pure, directly testable functions.

```typescript
// File: packages/zcash/src/index.ts
export function zatoshis(amount: string): bigint { // <3>
  if (!/^\d+(\.\d{1,8})?$/.test(amount)) throw new Error("Invalid ZEC amount");
  const [whole, fraction = ""] = amount.split(".");
  return BigInt(whole) * 100000000n + BigInt(fraction.padEnd(8, "0")); // <4>
}

export function paymentUri(address: string, amount: string) { // <5>
  zatoshis(amount);
  return `zcash:${address}?amount=${amount}`;
}
```

> **<3>** zatoshis() — decimal string to BigInt, max 8 fractional digits.
>
> **<4>** BigInt(whole) * 100000000n + BigInt(fraction.padEnd(8, '0')) converts exactly.
>
> **<5>** paymentUri() — zcash: URI with no memo (memo = tracking tag).

> **▶ Try It Out**
> ```bash
> pnpm exec tsx -e 'import { zatoshis } from "./packages/zcash/src/index.ts"; console.log(zatoshis("0.01"), zatoshis("0.00000001"))'
> ```
> Expected output: 1000000n 1n

`zatoshis` accepts at most eight fractional digits, pads on the right, and returns an exact integer. Leading zeros are harmless. Signs, exponent notation, whitespace, and a ninth decimal place are rejected. Production policy should also cap the whole-number length before conversion to bound resource use.

> **⚠ PITFALL: A unique memo fingerprints the purchase**
>
> Keep memo empty; the address is already invoice-specific.

The payment URI carries the offer amount and no memo. A unique memo would work as a tracking tag visible to the merchant scanner. The address is already invoice-specific, so the memo adds no routing value.

4. Implement `MockPaymentWatcher` last, using the same interface and event subscription behavior as production.

```typescript
// File: packages/zcash/src/index.ts
export class MockPaymentWatcher implements PaymentWatcher { // <6>
  private events = new Map<string, PaymentEvent>();
  private emitter = new EventEmitter(); // <7>

  async createInvoice({
    invoiceId,
    amount,
  }: {
    invoiceId: string;
    amount: string;
  }) {
    const address = `SIMULATED-NOT-PAYABLE-${invoiceId}`;
    return {
      address,
      paymentUri: paymentUri(address, amount),
      simulated: true,
    };
  }
  async getInvoice(invoiceId: string) {
    return this.events.get(invoiceId) ?? null;
  }
  subscribe(listener: (event: PaymentEvent) => Promise<void>) {
    this.emitter.on("payment", listener);
    return () => {
      this.emitter.off("payment", listener);
    };
  }
  async emit(event: PaymentEvent) {
    this.events.set(event.invoiceId, event);
    for (const listener of this.emitter.listeners("payment"))
      await (listener as (event: PaymentEvent) => Promise<void>)(event);
  }
}
```

> **<6>** MockPaymentWatcher — SIMULATED-NOT-PAYABLE- prefix, never resembles mainnet.
>
> **<7>** EventEmitter for subscriber pattern.

> **▶ Try It Out**
> ```bash
> pnpm exec tsx -e 'import { MockPaymentWatcher } from "./packages/zcash/src/index.ts"; new MockPaymentWatcher().createInvoice({invoiceId: "test", amount: "0.01"}).then(console.log)'
> ```
> Expected output: Shows the SIMULATED-NOT-PAYABLE address and URI without touching the blockchain.

`MockPaymentWatcher` implements the same interface but returns an unmistakable `SIMULATED-NOT-PAYABLE-...` address. It tests the state machine without claiming chain connectivity. Never make a development address resemble a valid mainnet address.

## 7.3 Step 3 — Fix denomination and cohort shape

> **⚠ PITFALL: A unique price in the last zatoshis encodes a customer identifier**
>
> Use fixed denominations.

The current offer is ten credits for `0.01` ZEC. Fixed price avoids encoding a customer or invoice in the last zatoshis. Fixed batch size avoids telling the redeemer which one-off quantity was bought. This is a privacy parameter, not just pricing UX.

The merchant still observes incoming notes using its viewing capability and may know approximate amount and time. Shielded Zcash removes the public-chain transparent linkage that a transparent address would create; it does not make the merchant forget the payment it receives. A later direct redemption from the same IP can still correlate the buyer.

### Payment threats

An underpayment must not round up. A reused address lets the scanner cluster invoices. A transparent receiver leaks public graph data. A unique amount or memo fingerprints the purchase. A zero-confirmation event can disappear in a reorganization. Chapter 8 treats scanner input as an authenticated, replayable, reversible event stream rather than a final callback.

### Build checkpoint

You now have a payment abstraction with exact units and an honest mock. Real custody stays outside the API, while the scanner contract requires a validated, diversified Unified Address with an Orchard receiver.

Before continuing, make the arithmetic test pass without importing Fastify or PostgreSQL. That independence is the reason the payment package remains easy to audit.
