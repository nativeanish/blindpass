import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { BlindPassError } from "@blindpass/shared";
import {
  PaymentEventSchema,
  paymentUri,
  type PaymentEvent,
  type PaymentWatcher,
} from "./index.js";
const Destination = z
  .object({
    invoiceId: z.string(),
    address: z.string().min(80).max(600),
    network: z.enum(["testnet", "mainnet"]),
    receiverTypes: z.array(z.string()),
    diversified: z.literal(true),
    validated: z.literal(true),
  })
  .strict();
// This is BlindPass's documented scanner bridge contract, not a fabricated CipherPay API.
export class ScannerPaymentWatcher implements PaymentWatcher {
  private listeners = new Set<(event: PaymentEvent) => Promise<void>>();
  constructor(
    private config: {
      url: string;
      apiKey: string;
      webhookSecret: string;
      network: "testnet" | "mainnet";
    },
    private transport: typeof fetch = fetch,
  ) {
    const url = new URL(config.url);
    if (
      url.protocol !== "https:" &&
      !["localhost", "127.0.0.1", "scanner"].includes(url.hostname)
    )
      throw new Error(
        "Scanner bridge must use HTTPS outside a trusted local network.",
      );
    if (config.webhookSecret.length < 32)
      throw new Error(
        "Scanner webhook secret requires at least 32 characters.",
      );
  }
  private async request(path: string, init: RequestInit = {}) {
    const response = await this.transport(new URL(path, this.config.url), {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
    });
    if (!response.ok)
      throw new BlindPassError(
        "SERVICE_TEMPORARILY_UNAVAILABLE",
        503,
        "Payment scanner is unavailable.",
      );
    return response.json() as Promise<unknown>;
  }
  async createInvoice(input: { invoiceId: string; amount: string }) {
    const raw = await this.request("/v1/invoices", {
      method: "POST",
      body: JSON.stringify({
        ...input,
        network: this.config.network,
        receiver: "orchard",
        memo: "",
      }),
    });
    const destination = Destination.parse(raw);
    if (
      destination.invoiceId !== input.invoiceId ||
      destination.network !== this.config.network ||
      !destination.receiverTypes.includes("orchard") ||
      destination.receiverTypes.some((r) => r === "p2pkh" || r === "p2sh")
    )
      throw new BlindPassError(
        "ISSUER_POLICY_VIOLATION",
        502,
        "Scanner must return a validated shielded Unified Address with an Orchard receiver.",
      );
    return {
      address: destination.address,
      paymentUri: paymentUri(destination.address, input.amount),
      simulated: false,
    };
  }
  async getInvoice(invoiceId: string) {
    const raw = await this.request(
      `/v1/invoices/${encodeURIComponent(invoiceId)}/payment`,
    );
    if (raw === null) return null;
    const event = PaymentEventSchema.parse(raw);
    if (event.invoiceId !== invoiceId)
      throw new BlindPassError("INVALID_REQUEST");
    return event;
  }
  subscribe(listener: (event: PaymentEvent) => Promise<void>) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  async webhook(
    raw: string,
    timestamp: string | undefined,
    signature: string | undefined,
  ) {
    if (
      !timestamp ||
      !/^\d{10}$/.test(timestamp) ||
      Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 ||
      !signature ||
      !/^[a-f0-9]{64}$/.test(signature)
    )
      throw new BlindPassError(
        "INVALID_REQUEST",
        401,
        "Invalid scanner webhook authentication.",
      );
    const expected = createHmac("sha256", this.config.webhookSecret)
      .update(`${timestamp}.${raw}`)
      .digest();
    if (!timingSafeEqual(expected, Buffer.from(signature, "hex")))
      throw new BlindPassError(
        "INVALID_REQUEST",
        401,
        "Invalid scanner webhook authentication.",
      );
    const event = PaymentEventSchema.parse(JSON.parse(raw));
    for (const listener of this.listeners) await listener(event);
    return { accepted: true };
  }
}
