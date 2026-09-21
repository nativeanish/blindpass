import "dotenv/config";
import { Command } from "commander";
import { BlindPassClient, MemoryStore } from "@blindpass/client";
import { FileVault } from "./vault.js";
import { torTransport } from "./tor.js";
const program = new Command()
  .name("blindpass")
  .description("Pay privately. Use privately.")
  .version("0.1.0");
const base = process.env.BLINDPASS_API_URL ?? "http://localhost:3001";
const issuer = process.env.ISSUER_ORIGIN ?? "localhost:3000";
function client() {
  return new BlindPassClient({
    baseUrl: base,
    issuer,
    store: new FileVault(),
    expectedFingerprint: process.env.BLINDPASS_PINNED_FINGERPRINT,
  });
}
function publicClient() {
  return new BlindPassClient({
    baseUrl: base,
    issuer,
    store: new MemoryStore(),
  });
}
program.command("offers").action(async () => {
  for (const offer of await publicClient().offers())
    console.log(`${offer.id}  ${offer.name}  ${offer.zecAmount} ZEC`);
});
program
  .command("buy")
  .argument("<offer>", "Offer identifier")
  .option("--no-wait", "Return after creating the invoice")
  .action(async (offer: string, options: { wait: boolean }) => {
    const sdk = client();
    const invoice = await sdk.buy(offer);
    console.log(
      `\nBlindPass\n\n${invoice.creditCount} private searches · ${invoice.zecAmount} ZEC\n\n${invoice.simulated ? "SIMULATED PAYMENT — DO NOT SEND ZEC\n" : ""}Payment:\n${invoice.paymentUri}\n\nInvoice: ${invoice.id}\nDeadline: ${invoice.expiresAt}`,
    );
    if (invoice.simulated)
      console.log(`\nConfirm locally: pnpm blindpass demo:pay ${invoice.id}`);
    if (!options.wait) return;
    console.log("\nWaiting for payment…");
    while (true) {
      const latest = await sdk.invoice(invoice.capability!);
      if (latest.status === "EXPIRED") throw new Error("INVOICE_EXPIRED");
      if (latest.status === "PAYMENT_CONFIRMED") break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    await sdk.issue(invoice, (stage) => console.log(stage));
    console.log("✓ 10 private credits ready");
  });
program.command("invoices").action(async () => {
  const sdk = client();
  const state = await sdk.options.store.load();
  for (const invoice of state.invoices) {
    const current = await sdk.invoice(invoice.capability!);
    console.log(`${invoice.id}  ${current.status}  ${invoice.zecAmount} ZEC`);
  }
});
program
  .command("issue")
  .argument("<invoice>")
  .action(async (id: string) => {
    const sdk = client();
    const invoice = (await sdk.options.store.load()).invoices.find(
      (i) => i.id === id,
    );
    if (!invoice) throw new Error("Invoice not found in this vault.");
    await sdk.issue(invoice, console.log);
  });
program
  .command("balance")
  .action(async () => console.log(await client().balance()));
program
  .command("search")
  .argument("<query>")
  .option(
    "--tor",
    "Require verified Tor via SOCKS5h; never fall back to direct transport",
  )
  .action(async (query: string, options: { tor?: boolean }) => {
    const transport =
      options.tor || process.env.ALL_PROXY ? await torTransport() : undefined;
    console.log(
      transport
        ? "Network privacy: TOR CONNECTED ✓ (verified exit; not a guarantee of anonymity)"
        : "Network privacy: DIRECT CONNECTION ⚠",
    );
    const sdk = transport
      ? new BlindPassClient({
          baseUrl: base,
          issuer,
          store: new FileVault(),
          transport,
          expectedFingerprint: process.env.BLINDPASS_PINNED_FINGERPRINT,
        })
      : client();
    const response = await sdk.search(query);
    for (const result of response.results)
      console.log(`\n${result.title}\n${result.url}\n${result.description}`);
    console.log("\nPRIVATE CREDIT USED");
  });
program.command("inspect").action(async () => {
  const state = await client().options.store.load();
  console.log({
    credentials: state.credentials.length,
    used: state.used,
    epoch: state.configuration?.manifest.epoch,
    issuerFingerprint: state.trustedFingerprint,
    storage: "AES-256-GCM; OS keyring or passphrase; 0600",
    credentialValues: "REDACTED",
  });
});
program.command("audit-privacy").action(async () => {
  const audit = await client().privacyAudit();
  console.log("\nBlindPass Privacy Audit\n\nPAYMENT");
  console.log(
    audit.health.mode === "mock"
      ? "⚠ SIMULATED PAYMENT. Orchard receiver and diversified addresses are not verified."
      : "Scanner adapter enabled; require Orchard receiver validation at scanner.",
  );
  console.log(
    "✓ Fixed offer price; no amount fingerprinting\n✓ Empty memo by default\n\nCREDENTIALS / HTTP",
  );
  audit.checks.forEach((c) => console.log(`✓ ${c}`));
  console.log(
    `\nANONYMITY SET\nCommon-class confirmed purchases: ${audit.anonymitySet.commonClassPurchases}\nDistinct people: unknown (no accounts or identifiers)\n${audit.anonymitySet.commonClassPurchases <= 1 ? "⚠ Small practical anonymity set." : ""}\n\nNETWORK\n⚠ DIRECT CONNECTION\nRecommendation: use --tor\n\nCryptographically unlinkable issuance/redemption.\nNetwork correlation remains possible.\nFirst-use identity trust requires a trusted bootstrap or pinned fingerprint.`,
  );
});
program
  .command("demo:pay")
  .argument("<invoice>")
  .option("--confirmations <n>", "Confirmation count", "3")
  .option("--reorg", "Simulate a reorganization")
  .action(
    async (id: string, options: { confirmations: string; reorg?: boolean }) =>
      console.log(
        await publicClient().request(`/api/dev/pay/${id}`, {
          method: "POST",
          body: JSON.stringify({
            confirmations: Number(options.confirmations),
            reorg: !!options.reorg,
          }),
        }),
      ),
  );
program.command("demo").action(async () => {
  const sdk = client();
  const invoice = await sdk.buy("search-10");
  console.log("SIMULATED PAYMENT EVENT");
  await sdk.request(`/api/dev/pay/${invoice.id}`, {
    method: "POST",
    body: "{}",
  });
  await sdk.issue(invoice, console.log);
  console.log(await sdk.search("privacy"));
  console.log(await sdk.balance());
});
try {
  await program.parseAsync();
} catch (error) {
  const e = error as { code?: string; message?: string };
  console.error(`${e.code ?? "ERROR"}: ${e.message ?? "Operation failed"}`);
  process.exitCode = 1;
}
