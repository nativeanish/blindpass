import { EventEmitter } from "node:events";
import { z } from "zod";
export const PaymentEventSchema = z
  .object({
    eventId: z.string().min(8).max(200),
    invoiceId: z.string().min(5).max(100),
    txid: z.string().min(8).max(128),
    amount: z.string().regex(/^\d+(\.\d{1,8})?$/),
    blockHeight: z.number().int().nonnegative().nullable().default(null),
    confirmations: z.number().int().nonnegative(),
    reorg: z.boolean().default(false),
    observedAt: z.string().datetime().optional(),
  })
  .strict();
export type PaymentEvent = z.infer<typeof PaymentEventSchema>;
export interface PaymentDestination {
  address: string;
  paymentUri: string;
  simulated: boolean;
}
export interface PaymentWatcher {
  createInvoice(input: {
    invoiceId: string;
    amount: string;
  }): Promise<PaymentDestination>;
  getInvoice(invoiceId: string): Promise<PaymentEvent | null>;
  subscribe(listener: (event: PaymentEvent) => Promise<void>): () => void;
}
export function zatoshis(amount: string): bigint {
  if (!/^\d+(\.\d{1,8})?$/.test(amount)) throw new Error("Invalid ZEC amount");
  const [whole, fraction = ""] = amount.split(".");
  return BigInt(whole) * 100000000n + BigInt(fraction.padEnd(8, "0"));
}
export function paymentUri(address: string, amount: string) {
  zatoshis(amount);
  return `zcash:${address}?amount=${amount}`;
}
export class MockPaymentWatcher implements PaymentWatcher {
  private events = new Map<string, PaymentEvent>();
  private emitter = new EventEmitter();
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
