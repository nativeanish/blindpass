import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ScannerPaymentWatcher } from "../packages/zcash/src/scanner.js";

const settings = z
  .object({
    ZCASH_NETWORK: z.enum(["testnet", "mainnet"]),
    ZCASH_SCANNER_URL: z.url(),
    ZCASH_SCANNER_API_KEY: z.string().min(1),
    ZCASH_WEBHOOK_SECRET: z.string().min(32),
  })
  .safeParse(process.env);

if (!settings.success) {
  const missing = [
    ...new Set(settings.error.issues.map((issue) => issue.path.join("."))),
  ];
  console.error(`Scanner setup incomplete: ${missing.join(", ")}.`);
  process.exitCode = 1;
} else {
  const { data } = settings;
  try {
    const scanner = new ScannerPaymentWatcher({
      url: data.ZCASH_SCANNER_URL,
      apiKey: data.ZCASH_SCANNER_API_KEY,
      webhookSecret: data.ZCASH_WEBHOOK_SECRET,
      network: data.ZCASH_NETWORK,
    });
    // Exercise the actual bridge contract with an unpaid invoice. A successful
    // address response still needs independent wallet and payment verification.
    const invoiceId = `inv_check_${randomUUID()}`;
    await scanner.createInvoice({ invoiceId, amount: "0.01" });
    const payment = await scanner.getInvoice(invoiceId);
    if (payment)
      throw new Error(
        "A new unpaid scanner invoice unexpectedly reports a payment.",
      );
    console.log(
      `Scanner contract check passed for ${data.ZCASH_NETWORK}. No payment was sent.`,
    );
  } catch (error) {
    console.error(
      error instanceof z.ZodError
        ? "Scanner response does not match the required invoice/payment contract."
        : error instanceof Error
          ? error.message
          : "Scanner connection failed.",
    );
    process.exitCode = 1;
  }
}
