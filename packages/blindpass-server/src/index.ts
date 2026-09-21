import type { Sql, TransactionSql } from "postgres";
import { BlindPassError, type Manifest } from "@blindpass/shared";
import {
  TokenIssuer,
  parseAuthorization,
  spentHash,
} from "@blindpass/privacy-pass";
export interface CreditVerifier {
  manifest: Manifest;
  verify(raw: string, now?: number, tokenClass?: string): Promise<unknown>;
}
export class RedemptionService {
  constructor(
    private sql: Sql,
    private issuers: CreditVerifier[],
  ) {}
  async redeem<T>(
    header: string | undefined,
    work: (transaction: TransactionSql) => Promise<T>,
    tokenClass = "search-v1",
  ): Promise<T> {
    const raw = parseAuthorization(header);
    let matched: CreditVerifier | undefined;
    let lastError: unknown;
    for (const issuer of this.issuers) {
      try {
        await issuer.verify(raw, Date.now(), tokenClass);
        matched = issuer;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!matched) throw lastError ?? new BlindPassError("INVALID_TOKEN", 401);
    const tokenHash = await spentHash(raw);
    const manifest = matched.manifest;
    // A duplicate insert waits for the winning transaction. If work fails, rollback makes the credit usable again.
    return (await this.sql.begin(async (tx) => {
      const inserted =
        await tx`INSERT INTO redeemed_tokens(token_hash,issuer_epoch,status,expires_at) VALUES(${tokenHash},${manifest.epoch},'reserved',${manifest.expiresAt}) ON CONFLICT DO NOTHING RETURNING token_hash`;
      if (!inserted.length)
        throw new BlindPassError("TOKEN_ALREADY_SPENT", 409);
      const result = await work(tx);
      await tx`UPDATE redeemed_tokens SET status='spent',spent_at=now() WHERE token_hash=${tokenHash} AND issuer_epoch=${manifest.epoch}`;
      return result;
    })) as T;
  }
}
export { TokenIssuer };
// Framework-neutral middleware factory. The handler executes inside the authoritative reservation transaction.
export function blindpass(options: {
  offer: string;
  cost: 1;
  redemption: RedemptionService;
}) {
  if (options.cost !== 1)
    throw new Error("Only fixed-cost, single-credit resources are supported.");
  return <T>(
    authorization: string | undefined,
    handler: (transaction: TransactionSql) => Promise<T>,
  ) => options.redemption.redeem(authorization, handler, options.offer);
}
