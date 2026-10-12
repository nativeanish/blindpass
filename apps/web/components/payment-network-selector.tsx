"use client";
import { useId } from "react";
import {
  PAYMENT_ENVIRONMENTS,
  PAYMENT_ENVIRONMENT_LABELS,
  type PaymentEnvironment,
} from "@blindpass/shared";
import { useService } from "../lib/service";

const descriptions: Record<PaymentEnvironment, string> = {
  simulation: "Simulated payments · No real funds",
  devnet: "Zcash testnet · Test funds only",
  mainnet: "Zcash mainnet · Real ZEC payments",
};

export function PaymentNetworkSelector() {
  const id = useId();
  const { data: service, isError } = useService();
  return (
    <div className="payment-network">
      <label htmlFor={id}>Zcash network</label>
      <select
        id={id}
        aria-describedby={`${id}-description`}
        value={service?.paymentEnvironment ?? ""}
        disabled={!service || isError}
        onChange={(event) => {
          const selected = service?.paymentEnvironments.find(
            (option) => option.id === event.target.value,
          );
          if (
            !selected?.available ||
            !selected.url ||
            selected.id === service?.paymentEnvironment
          )
            return;
          // Navigate to a separate app origin so wallets, trust pins, queries,
          // and in-progress purchases stay with their original environment.
          window.location.assign(selected.url);
        }}
      >
        {!service && (
          <option value="">
            {isError ? "Network unavailable" : "Checking network…"}
          </option>
        )}
        {PAYMENT_ENVIRONMENTS.map((network) => {
          const available = service?.paymentEnvironments.some(
            (option) => option.id === network && option.available,
          );
          return (
            <option key={network} value={network} disabled={!available}>
              {PAYMENT_ENVIRONMENT_LABELS[network]}
              {service && !available ? " · Not configured" : ""}
            </option>
          );
        })}
      </select>
      <span id={`${id}-description`} className="payment-network-description">
        {isError
          ? "Unable to check payment networks"
          : service
            ? descriptions[service.paymentEnvironment]
            : "Checking available payment networks"}
      </span>
    </div>
  );
}
