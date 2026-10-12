import {
  BlindPassError,
  sha256,
  canonical,
  type SignedManifest,
} from "@blindpass/shared";
import type { Database } from "./db/connection.js";
import type { Keys } from "./keys.js";
export class IssuanceService {
  constructor(
    private database: Database,
    private keys: Keys,
  ) {}
  async issue(
    capability: string,
    requests: string[],
    configurationHash: string,
  ) {
    if (requests.length !== 10 || new Set(requests).size !== 10)
      throw new BlindPassError(
        "INVALID_REQUEST",
        400,
        "Exactly 10 distinct blinded requests are required.",
      );
    const keys = { ...this.keys };
    const hash = await sha256(capability);
    const requestHash = await sha256(canonical(requests));
    return this.database.sql.begin(async (tx) => {
      const [invoice] =
        await tx`SELECT * FROM invoices WHERE capability_secret_hash=${hash} FOR UPDATE`;
      if (!invoice) throw new BlindPassError("NOT_FOUND", 404);
      if (configurationHash !== invoice.issuer_config_hash)
        throw new BlindPassError("ISSUER_POLICY_VIOLATION");
      const [auth] =
        await tx`SELECT * FROM issuance_authorizations WHERE invoice_id=${invoice.id} FOR UPDATE`;
      if (auth?.status === "completed") {
        if (auth.request_hash !== requestHash)
          throw new BlindPassError("ISSUANCE_ALREADY_COMPLETED", 409);
        const [epoch] =
          await tx`SELECT manifest FROM issuer_epochs WHERE epoch=${invoice.issuer_epoch} AND verification_grace_until>now()`;
        if (!epoch) throw new BlindPassError("TOKEN_EXPIRED", 410);
        return {
          responses: auth.responses as string[],
          configuration: epoch.manifest as SignedManifest,
        };
      }
      if (new Date(invoice.issuance_deadline).getTime() <= Date.now())
        throw new BlindPassError("INVOICE_EXPIRED", 410);
      if (
        invoice.status !== "PAYMENT_CONFIRMED" ||
        auth?.status !== "authorized"
      )
        throw new BlindPassError("PAYMENT_NOT_CONFIRMED", 402);
      if (configurationHash !== (await sha256(canonical(keys.manifest))))
        throw new BlindPassError("ISSUER_POLICY_VIOLATION");
      const result = await keys.issuer.evaluate(requests);
      await tx`UPDATE issuance_authorizations SET status='completed',request_hash=${requestHash},responses=${JSON.stringify(result)}::jsonb,issued_count=10,completed_at=now() WHERE invoice_id=${invoice.id}`;
      await tx`UPDATE invoices SET status='CREDITS_READY' WHERE id=${invoice.id}`;
      return { responses: result, configuration: keys.signedManifest };
    });
  }
}
