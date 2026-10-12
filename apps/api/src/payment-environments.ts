import { z } from "zod";
import {
  PAYMENT_ENVIRONMENTS,
  type PaymentEnvironment,
  type PaymentEnvironmentOption,
} from "@blindpass/shared";

// Public app origins only. Credentials and invoice/query data must never be
// carried into another environment, and remote wallets require HTTPS.
export const PaymentAppUrl = z.string().refine((value) => {
  if (!value) return true;
  try {
    const url = new URL(value);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return (
      (url.protocol === "https:" || (local && url.protocol === "http:")) &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}, "Use an HTTPS app origin (or HTTP localhost), without a path, credentials, query, or fragment.");

export function paymentEnvironments(settings: {
  ZCASH_PAYMENT_MODE: "mock" | "scanner";
  ZCASH_NETWORK: "testnet" | "mainnet";
  ISSUER_ORIGIN: string;
  BLINDPASS_SIMULATION_URL: string;
  BLINDPASS_DEVNET_URL: string;
  BLINDPASS_MAINNET_URL: string;
}): {
  paymentEnvironment: PaymentEnvironment;
  paymentEnvironments: PaymentEnvironmentOption[];
} {
  const current =
    settings.ZCASH_PAYMENT_MODE === "mock"
      ? "simulation"
      : settings.ZCASH_NETWORK === "testnet"
        ? "devnet"
        : "mainnet";
  const urls = {
    simulation: settings.BLINDPASS_SIMULATION_URL,
    devnet: settings.BLINDPASS_DEVNET_URL,
    mainnet: settings.BLINDPASS_MAINNET_URL,
  };
  const hosts = new Set([settings.ISSUER_ORIGIN.toLowerCase()]);
  const options = PAYMENT_ENVIRONMENTS.map((id) => {
    if (id === current) return { id, available: true, url: null };
    const value = PaymentAppUrl.parse(urls[id]);
    if (!value) return { id, available: false, url: null };
    const url = new URL(value);
    if (hosts.has(url.host))
      throw new Error(
        "Each payment environment requires a separate app host or port.",
      );
    hosts.add(url.host);
    return { id, available: true, url: new URL("/app", url).href };
  });
  return { paymentEnvironment: current, paymentEnvironments: options };
}
