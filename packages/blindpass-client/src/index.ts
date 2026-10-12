import { z } from "zod";
import {
  BlindPassError,
  SignedManifestSchema,
  verifySignature,
  fingerprint,
  sha256,
  canonical,
  currentEpoch,
  epochDates,
  type SignedManifest,
  type StoredCredential,
  type Invoice,
  type Offer,
  type SearchResponse,
} from "@blindpass/shared";
import {
  createBlindBatch,
  authorization,
  createRecoverableBatch,
  finalizeRecoverableBatch,
  type RecoverableBatch,
} from "@blindpass/privacy-pass";
import { encryptBackup, decryptBackup } from "./backup.ts";
export interface ClientState {
  credentials: StoredCredential[];
  used: number;
  uncertain?: number;
  pendingIssuance?: Record<
    string,
    { batch: RecoverableBatch; configuration: SignedManifest }
  >;
  lastBackupAt?: string;
  invoices: Invoice[];
  trustedFingerprint?: string;
  configuration?: SignedManifest;
  activity: { kind: string; at: string }[];
}
export const emptyState = (): ClientState => ({
  credentials: [],
  used: 0,
  invoices: [],
  activity: [],
});
export interface CredentialStore {
  load(): Promise<ClientState>;
  save(state: ClientState): Promise<void>;
  exclusive<T>(fn: () => Promise<T>): Promise<T>;
}
export class MemoryStore implements CredentialStore {
  private state = emptyState();
  private queue: Promise<unknown> = Promise.resolve();
  async load() {
    return structuredClone(this.state);
  }
  async save(state: ClientState) {
    this.state = structuredClone(state);
  }
  exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const task = this.queue.then(fn);
    this.queue = task.catch(() => {});
    return task;
  }
}
export type Transport = (url: string, init?: RequestInit) => Promise<Response>;
export interface ClientOptions {
  baseUrl: string;
  store: CredentialStore;
  issuer?: string;
  expectedFingerprint?: string;
  transport?: Transport;
}
export type IssuerPolicyFailure =
  | "INVALID_CONFIGURATION"
  | "INVALID_SIGNATURE"
  | "IDENTITY_MISMATCH"
  | "ISSUER_MISMATCH"
  | "UNSUPPORTED_POLICY"
  | "EPOCH_MISMATCH"
  | "INVALID_DATES"
  | "INVALID_KEY_ID"
  | "CONFIGURATION_CHANGED";
export class IssuerPolicyError extends BlindPassError {
  constructor(
    public reason: IssuerPolicyFailure,
    message: string,
  ) {
    super("ISSUER_POLICY_VIOLATION", 400, message);
    this.name = "IssuerPolicyError";
  }
}
export async function validateConfiguration(
  config: SignedManifest,
  policy: {
    issuer: string;
    fingerprint?: string;
    previous?: SignedManifest;
    epoch?: string;
  },
) {
  const fail = (reason: IssuerPolicyFailure, message: string): never => {
    throw new IssuerPolicyError(reason, message);
  };
  if (!SignedManifestSchema.safeParse(config).success)
    fail(
      "INVALID_CONFIGURATION",
      "The service returned an invalid issuer configuration. Contact the operator before paying.",
    );
  if (
    !(await verifySignature(
      config.manifest,
      config.signature,
      config.signingPublicKey,
    ))
  )
    fail(
      "INVALID_SIGNATURE",
      "The issuer configuration signature could not be verified. Contact the operator before paying.",
    );
  if (
    policy.fingerprint &&
    (await fingerprint(config.signingPublicKey)) !== policy.fingerprint
  )
    fail(
      "IDENTITY_MISMATCH",
      "The service's signing identity does not match the trusted issuer fingerprint. Keep your wallet data and ask the operator to verify or restore the original signing keys.",
    );
  const m = config.manifest;
  const epoch = policy.epoch ?? currentEpoch();
  const dates = epochDates(epoch);
  if (m.issuer !== policy.issuer || m.originScope !== policy.issuer)
    fail(
      "ISSUER_MISMATCH",
      `Expected issuer "${policy.issuer}", but the service is configured for "${m.issuer}" with scope "${m.originScope}". Open the service at its configured hostname and port. localhost and 127.0.0.1 are different wallet addresses.`,
    );
  if (m.tokenType !== 1 || m.tokenClass !== "search-v1" || m.batchSize !== 10)
    fail(
      "UNSUPPORTED_POLICY",
      "The service changed the shared credit type or batch size. Contact the operator before paying.",
    );
  if (m.epoch !== epoch)
    fail(
      "EPOCH_MISMATCH",
      `The service is using the ${m.epoch} credit period, but this wallet expects ${epoch}. Check your device date and time. If they are correct, ask the operator to check the server clock and monthly key rotation.`,
    );
  if (
    m.expiresAt !== dates.expiresAt ||
    m.validFrom !== dates.validFrom ||
    m.issuanceEndsAt !== dates.issuanceEndsAt
  )
    fail(
      "INVALID_DATES",
      "The service's credit dates differ from the shared monthly policy. Contact the operator before paying.",
    );
  let keyId: string | undefined;
  try {
    keyId = await sha256(
      Uint8Array.from(
        atob(m.publicKey.replaceAll("-", "+").replaceAll("_", "/")),
        (c) => c.charCodeAt(0),
      ),
    );
  } catch {
    // Malformed key encoding is also an issuer-policy failure.
  }
  if (m.activeKeyId !== keyId)
    fail(
      "INVALID_KEY_ID",
      "The issuer's credit key does not match its advertised identifier. Contact the operator before paying.",
    );
  if (
    policy.previous?.manifest.epoch === epoch &&
    canonical(policy.previous.manifest) !== canonical(m)
  )
    fail(
      "CONFIGURATION_CHANGED",
      `The issuer changed its shared configuration for ${epoch} after this wallet trusted it. Keep your wallet data and ask the operator to restore the original keys and policy.`,
    );
  return config;
}
export class BlindPassClient {
  private transport: Transport;
  private base: string;
  constructor(public options: ClientOptions) {
    this.transport =
      options.transport ?? ((url, init) => globalThis.fetch(url, init));
    this.base = options.baseUrl.replace(/\/$/, "");
  }
  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.transport(`${this.base}${path}`, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(30000),
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      redirect: "error",
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    // A proxy can fail after a committed operation. Only structured API errors
    // may be treated as a definite rollback; HTML/invalid JSON remains ambiguous.
    const data = await response.json();
    if (!response.ok) {
      const error = z
        .object({ error: z.object({ code: z.string(), message: z.string() }) })
        .safeParse(data);
      if (error.success)
        throw Object.assign(new Error(error.data.error.message), {
          code: error.data.error.code,
          status: response.status,
        });
      throw new BlindPassError("SERVICE_TEMPORARILY_UNAVAILABLE", 503);
    }
    return data as T;
  }
  offers() {
    return this.request<Offer[]>("/api/offers");
  }
  async configuration() {
    const directory = await this.request<SignedManifest>(
      "/.well-known/private-token-issuer-directory",
    );
    const signed: SignedManifest = {
      manifest: directory.manifest,
      signature: directory.signature,
      signingPublicKey: directory.signingPublicKey,
    };
    return this.options.store.exclusive(async () => {
      const state = await this.options.store.load();
      const issuer =
        this.options.issuer ??
        (typeof location !== "undefined"
          ? location.host
          : new URL(this.base).host);
      await validateConfiguration(signed, {
        issuer,
        fingerprint:
          this.options.expectedFingerprint || state.trustedFingerprint,
        previous: state.configuration,
      });
      state.trustedFingerprint = await fingerprint(signed.signingPublicKey);
      state.configuration = signed;
      await this.options.store.save(state);
      return signed;
    });
  }
  async buy(offerId = "search-10") {
    const config = await this.configuration();
    const invoice = await this.request<Invoice>("/api/invoices", {
      method: "POST",
      body: JSON.stringify({ offerId }),
    });
    const signed = invoice.document;
    const doc = signed.document;
    if (
      signed.signingPublicKey !== config.signingPublicKey ||
      !(await verifySignature(
        doc,
        signed.signature,
        signed.signingPublicKey,
      )) ||
      doc.issuer_configuration_hash !==
        (await sha256(canonical(config.manifest))) ||
      invoice.issuerConfigHash !== doc.issuer_configuration_hash ||
      doc.credit_count !== 10 ||
      invoice.creditCount !== doc.credit_count ||
      doc.token_class !== "search-v1" ||
      invoice.tokenClass !== doc.token_class ||
      doc.zec_amount !== "0.01" ||
      invoice.zecAmount !== doc.zec_amount ||
      doc.payment_address !== invoice.paymentAddress ||
      invoice.paymentUri !==
        `zcash:${doc.payment_address}?amount=${doc.zec_amount}` ||
      doc.invoice_id !== invoice.id ||
      doc.offer_id !== offerId ||
      doc.payment_deadline !== invoice.expiresAt ||
      doc.issuance_deadline !== invoice.issuanceDeadline
    )
      throw new BlindPassError("ISSUER_POLICY_VIOLATION");
    await this.options.store.exclusive(async () => {
      const state = await this.options.store.load();
      state.invoices.unshift(invoice);
      await this.options.store.save(state);
    });
    return invoice;
  }
  async invoice(capability: string) {
    const latest = await this.request<Invoice>(
      `/api/invoices/${encodeURIComponent(capability)}`,
    );
    return this.options.store.exclusive(async () => {
      const state = await this.options.store.load();
      const found = state.invoices.find((i) => i.capability === capability);
      if (found) {
        // Server CREDITS_READY means evaluated, not safely stored on this device.
        const localStatus = found.status;
        Object.assign(found, latest, { capability });
        if (
          latest.status === "CREDITS_READY" &&
          localStatus !== "CREDITS_READY"
        )
          found.status = "ISSUING_PRIVATE_CREDITS";
        await this.options.store.save(state);
      }
      return { ...latest, capability };
    });
  }
  async issue(invoice: Invoice, onProgress?: (stage: string) => void) {
    if (!invoice.capability) throw new BlindPassError("INVALID_REQUEST");
    const existing = (await this.options.store.load()).pendingIssuance?.[
      invoice.id
    ];
    const freshConfiguration = existing
      ? undefined
      : await this.configuration();
    // Serialize the complete issuance across tabs/processes, including commit.
    return this.options.store.exclusive(async () => {
      const state = await this.options.store.load();
      const found = state.invoices.find((i) => i.id === invoice.id);
      if (found?.status === "CREDITS_READY") return invoice.creditCount;
      const pending = state.pendingIssuance?.[invoice.id];
      const configuration = pending?.configuration ?? freshConfiguration;
      if (!configuration) throw new BlindPassError("INVALID_REQUEST");
      await validateConfiguration(configuration, {
        issuer:
          this.options.issuer ??
          (typeof location !== "undefined"
            ? location.host
            : new URL(this.base).host),
        fingerprint:
          this.options.expectedFingerprint || state.trustedFingerprint,
        epoch: invoice.issuerEpoch,
      });
      if (
        invoice.issuerConfigHash !==
        (await sha256(canonical(configuration.manifest)))
      )
        throw new BlindPassError("ISSUER_POLICY_VIOLATION");
      onProgress?.(
        pending
          ? "Resuming your saved private purchase"
          : "Generating 10 blinded requests locally",
      );
      const batch =
        pending?.batch ??
        (await createRecoverableBatch(configuration.manifest));
      state.pendingIssuance ??= {};
      state.pendingIssuance[invoice.id] = { batch, configuration };
      // Persist before contacting the issuer. A crash or lost response can retry
      // precisely these requests without authorizing another batch.
      await this.options.store.save(state);
      onProgress?.("Issuer evaluating blinded requests");
      const response = await this.request<{
        responses: string[];
        configuration: SignedManifest;
      }>("/api/issuance", {
        method: "POST",
        body: JSON.stringify({
          capability: invoice.capability,
          requests: batch.requests,
          configurationHash: invoice.issuerConfigHash,
        }),
      });
      await validateConfiguration(response.configuration, {
        issuer: configuration.manifest.issuer,
        fingerprint: await fingerprint(configuration.signingPublicKey),
        previous: configuration,
        epoch: configuration.manifest.epoch,
      });
      onProgress?.("Verifying proofs and unblinding locally");
      const credentials = await finalizeRecoverableBatch(
        configuration.manifest,
        batch,
        response.responses,
      );
      state.credentials.push(...credentials);
      if (found) found.status = "CREDITS_READY";
      else state.invoices.unshift({ ...invoice, status: "CREDITS_READY" });
      delete state.pendingIssuance[invoice.id];
      state.activity.unshift({
        kind: "Purchase completed · 10 private credits",
        at: new Date().toISOString(),
      });
      state.activity = state.activity.slice(0, 50);
      await this.options.store.save(state);
      onProgress?.("10 private credits ready");
      return credentials.length;
    });
  }
  async exportBackup(passphrase: string) {
    return this.options.store.exclusive(async () => {
      const state = await this.options.store.load();
      const issuer =
        this.options.issuer ??
        (typeof location !== "undefined"
          ? location.host
          : new URL(this.base).host);
      const createdAt = new Date().toISOString();
      state.lastBackupAt = createdAt;
      const content = await encryptBackup(
        { issuer, createdAt, state },
        passphrase,
      );
      await this.options.store.save(state);
      return content;
    });
  }
  async restoreBackup(content: string, passphrase: string) {
    const backup = await decryptBackup(content, passphrase);
    const issuer =
      this.options.issuer ??
      (typeof location !== "undefined"
        ? location.host
        : new URL(this.base).host);
    if (backup.issuer !== issuer)
      throw new Error(
        "This backup belongs to a different issuer. Open the original BlindPass service.",
      );
    if (backup.state.configuration)
      await validateConfiguration(backup.state.configuration, {
        issuer,
        fingerprint:
          this.options.expectedFingerprint || backup.state.trustedFingerprint,
        epoch: backup.state.configuration.manifest.epoch,
      });
    return this.options.store.exclusive(async () => {
      const current = await this.options.store.load();
      if (
        current.credentials.length ||
        current.invoices.length ||
        current.used ||
        current.uncertain ||
        Object.keys(current.pendingIssuance ?? {}).length
      )
        throw new Error(
          "Restore into an empty wallet on a new browser profile or device. Your current wallet has been kept.",
        );
      if (
        current.trustedFingerprint &&
        backup.state.trustedFingerprint !== current.trustedFingerprint
      )
        throw new Error(
          "The backup does not match this wallet’s trusted issuer.",
        );
      await this.options.store.save(backup.state);
      return backup.state.credentials.length;
    });
  }
  async balance() {
    const state = await this.options.store.load();
    return {
      remaining: state.credentials.filter(
        (t) => Date.parse(t.expiresAt) > Date.now(),
      ).length,
      used: state.used,
      uncertain: state.uncertain ?? 0,
      expired: state.credentials.filter(
        (t) => Date.parse(t.expiresAt) <= Date.now(),
      ).length,
    };
  }
  async search(query: string) {
    query = z.string().trim().min(1).max(240).parse(query);
    return this.options.store.exclusive(async () => {
      const state = await this.options.store.load();
      const index = state.credentials.findIndex(
        (t) => Date.parse(t.expiresAt) > Date.now(),
      );
      if (index < 0)
        throw new BlindPassError(
          "INVALID_TOKEN",
          402,
          "No private credits available. Purchase a batch first.",
        );
      const [token] = state.credentials.splice(index, 1);
      // Persist removal before transport: an ambiguous network result must not cause an automatic replay.
      state.uncertain = (state.uncertain ?? 0) + 1;
      await this.options.store.save(state);
      try {
        const result = await this.request<SearchResponse>(
          `/api/search?q=${encodeURIComponent(query)}`,
          { headers: { Authorization: authorization(token) } },
        );
        state.used++;
        state.uncertain = Math.max(0, (state.uncertain ?? 1) - 1);
        state.activity.unshift({
          kind: "Credit redeemed",
          at: new Date().toISOString(),
        });
        state.activity = state.activity.slice(0, 25);
        await this.options.store.save(state);
        return result;
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (
          code === "SERVICE_TEMPORARILY_UNAVAILABLE" ||
          code === "INVALID_REQUEST" ||
          code === "RATE_LIMITED"
        ) {
          state.credentials.unshift(token);
          state.uncertain = Math.max(0, (state.uncertain ?? 1) - 1);
          await this.options.store.save(state);
        } else {
          state.activity.unshift({
            kind: "Search outcome unconfirmed · credit set aside",
            at: new Date().toISOString(),
          });
          await this.options.store.save(state);
        }
        throw error;
      }
    });
  }
  async fetch(path: string) {
    const url = new URL(path, this.base || location.origin);
    if (url.pathname !== "/api/search")
      throw new BlindPassError("INVALID_REQUEST");
    return this.search(url.searchParams.get("q") ?? "");
  }
  async privacyAudit() {
    const configuration = await this.configuration();
    const health = await this.request<{ mode: string; environment: string }>(
      "/api/health",
    );
    const anonymitySet = await this.request<{
      commonClassPurchases: number;
      distinctPeopleKnown: false;
      epoch: string;
    }>("/api/privacy-audit");
    return {
      configuration,
      health,
      anonymitySet,
      balance: await this.balance(),
      network: "DIRECT CONNECTION",
      checks: [
        "Shared issuer key",
        "Shared token class",
        "Shared epoch and calendar expiry",
        "RFC 9578 VOPRF",
        "Invoice ID excluded from token input",
        "No account or API key",
        "Cookies omitted by SDK",
        "Authorization excluded from application logs",
      ],
    };
  }
}
export { authorization, createBlindBatch };
