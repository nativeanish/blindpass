import { describe, expect, it } from "vitest";
import {
  PaymentAppUrl,
  paymentEnvironments,
} from "../apps/api/src/payment-environments.js";

const defaults = {
  ZCASH_PAYMENT_MODE: "mock" as const,
  ZCASH_NETWORK: "testnet" as const,
  ISSUER_ORIGIN: "localhost:3000",
  BLINDPASS_SIMULATION_URL: "",
  BLINDPASS_DEVNET_URL: "",
  BLINDPASS_MAINNET_URL: "",
};

describe("payment environment selection", () => {
  it.each([
    ["mock", "testnet", "simulation"],
    ["mock", "mainnet", "simulation"],
    ["scanner", "testnet", "devnet"],
    ["scanner", "mainnet", "mainnet"],
  ] as const)("reports %s / %s as %s", (mode, network, expected) => {
    const result = paymentEnvironments({
      ...defaults,
      ZCASH_PAYMENT_MODE: mode,
      ZCASH_NETWORK: network,
    });
    expect(result.paymentEnvironment).toBe(expected);
    expect(
      result.paymentEnvironments.filter((option) => option.available),
    ).toEqual([{ id: expected, available: true, url: null }]);
  });

  it("enables configured deployments at their clean app entry points", () => {
    const result = paymentEnvironments({
      ...defaults,
      BLINDPASS_DEVNET_URL: "http://localhost:3100/",
      BLINDPASS_MAINNET_URL: "https://mainnet.example",
    });
    expect(result.paymentEnvironments).toEqual([
      { id: "simulation", available: true, url: null },
      { id: "devnet", available: true, url: "http://localhost:3100/app" },
      { id: "mainnet", available: true, url: "https://mainnet.example/app" },
    ]);
  });

  it("rejects environments sharing an app host and wallet", () => {
    expect(() =>
      paymentEnvironments({
        ...defaults,
        BLINDPASS_DEVNET_URL: "http://localhost:3000",
      }),
    ).toThrow("separate app host or port");
    expect(() =>
      paymentEnvironments({
        ...defaults,
        BLINDPASS_DEVNET_URL: "https://live.example",
        BLINDPASS_MAINNET_URL: "https://live.example/",
      }),
    ).toThrow("separate app host or port");
  });

  it.each([
    "javascript:alert(1)",
    "http://remote.example",
    "https://user:secret@mainnet.example",
    "https://mainnet.example/app/buy",
    "https://mainnet.example?invoice=private",
    "https://mainnet.example#private",
  ])("rejects unsafe or non-origin deployment URL %s", (url) => {
    expect(PaymentAppUrl.safeParse(url).success).toBe(false);
  });
});
