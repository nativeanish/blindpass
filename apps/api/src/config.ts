import "dotenv/config";
import { z } from "zod";
import { PaymentAppUrl } from "./payment-environments.js";
const Config = z.object({
  BLINDPASS_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(600),
  PURCHASE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(30),
  RECONCILIATION_INTERVAL_MS: z.coerce.number().int().min(1000).default(30000),
  SUPPORT_URL: z.string().default(""),
  ISSUER_ORIGIN: z.string().default("localhost:3000"),
  ZCASH_PAYMENT_MODE: z.enum(["mock", "scanner"]).default("mock"),
  ZCASH_NETWORK: z.enum(["testnet", "mainnet"]).default("testnet"),
  ZCASH_CONFIRMATIONS: z.coerce.number().int().min(1).default(3),
  BLINDPASS_SIMULATION_URL: PaymentAppUrl.default(""),
  BLINDPASS_DEVNET_URL: PaymentAppUrl.default(""),
  BLINDPASS_MAINNET_URL: PaymentAppUrl.default(""),
});
export const config = Config.parse(process.env);
export function assertProductionConfig() {
  if (config.BLINDPASS_ENV === "production") {
    for (const key of [
      "DATABASE_URL",
      "MERCHANT_CONFIG_PRIVATE_KEY",
      "MERCHANT_CONFIG_PUBLIC_KEY",
      "ZCASH_SCANNER_URL",
      "ZCASH_SCANNER_API_KEY",
      "ZCASH_WEBHOOK_SECRET",
      "SUPPORT_URL",
      "OPERATOR_API_KEY",
    ])
      if (!process.env[key]) throw new Error(`Production requires ${key}`);
    if (
      !process.env.PRIVACYPASS_ISSUER_KEYS &&
      !(
        process.env.PRIVACYPASS_ISSUER_SECRET &&
        process.env.PRIVACYPASS_ISSUER_EPOCH
      )
    )
      throw new Error(
        "Production requires PRIVACYPASS_ISSUER_KEYS or an explicit issuer secret and epoch.",
      );
    if (config.ZCASH_PAYMENT_MODE === "mock")
      throw new Error("Production cannot simulate payments.");
    if (
      !process.env.ISSUER_ORIGIN ||
      !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(
        config.ISSUER_ORIGIN,
      ) ||
      config.ISSUER_ORIGIN.endsWith(".localhost")
    )
      throw new Error("Set the production issuer hostname.");
    if ((process.env.ZCASH_WEBHOOK_SECRET ?? "").length < 32)
      throw new Error("ZCASH_WEBHOOK_SECRET requires at least 32 characters.");
    if ((process.env.OPERATOR_API_KEY ?? "").length < 32)
      throw new Error("OPERATOR_API_KEY requires at least 32 characters.");
    const support = new URL(process.env.SUPPORT_URL!);
    if (!["https:", "mailto:"].includes(support.protocol))
      throw new Error("SUPPORT_URL must be HTTPS or mailto.");
    if (
      config.ZCASH_NETWORK === "mainnet" &&
      process.env.BLINDPASS_ALLOW_MAINNET !== "true"
    )
      throw new Error(
        "Mainnet requires deliberate BLINDPASS_ALLOW_MAINNET=true configuration.",
      );
  }
}
