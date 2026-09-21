import "dotenv/config";
import { z } from "zod";
const Config = z.object({
  BLINDPASS_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  API_PORT: z.coerce.number().default(3001),
  ISSUER_ORIGIN: z.string().default("localhost:3000"),
  ZCASH_PAYMENT_MODE: z.enum(["mock", "scanner"]).default("mock"),
  ZCASH_NETWORK: z.enum(["testnet", "mainnet"]).default("testnet"),
  ZCASH_CONFIRMATIONS: z.coerce.number().int().min(1).default(3),
});
export const config = Config.parse(process.env);
export function assertProductionConfig() {
  if (config.BLINDPASS_ENV === "production") {
    for (const key of [
      "DATABASE_URL",
      "MERCHANT_CONFIG_PRIVATE_KEY",
      "MERCHANT_CONFIG_PUBLIC_KEY",
      "PRIVACYPASS_ISSUER_SECRET",
      "PRIVACYPASS_ISSUER_EPOCH",
      "ZCASH_SCANNER_URL",
      "ZCASH_SCANNER_API_KEY",
      "ZCASH_WEBHOOK_SECRET",
    ])
      if (!process.env[key]) throw new Error(`Production requires ${key}`);
    if (config.ZCASH_PAYMENT_MODE === "mock")
      throw new Error("Production cannot simulate payments.");
    if (
      !process.env.ISSUER_ORIGIN ||
      config.ISSUER_ORIGIN.includes("localhost")
    )
      throw new Error("Set the production issuer hostname.");
    if (
      config.ZCASH_NETWORK === "mainnet" &&
      process.env.BLINDPASS_ALLOW_MAINNET !== "true"
    )
      throw new Error(
        "Mainnet requires deliberate BLINDPASS_ALLOW_MAINNET=true configuration.",
      );
  }
}
