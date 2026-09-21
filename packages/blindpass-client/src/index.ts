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
import { createBlindBatch, authorization } from "@blindpass/privacy-pass";
export interface ClientState {
  credentials: StoredCredential[];
  used: number;
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
export async function validateConfiguration(
  config: SignedManifest,
  policy: {
    issuer: string;
    fingerprint?: string;
    previous?: SignedManifest;
    epoch?: string;
  },
) {
  const fail = () => {
    throw new BlindPassError(
      "ISSUER_POLICY_VIOLATION",
      400,
      "Issuer configuration differs from the shared, trusted policy.",
    );
  };
  if (!SignedManifestSchema.safeParse(config).success) fail();
  if (
    !(await verifySignature(
      config.manifest,
      config.signature,
      config.signingPublicKey,
    ))
  )
    fail();
  if (
    policy.fingerprint &&
    (await fingerprint(config.signingPublicKey)) !== policy.fingerprint
  )
    fail();
  const m = config.manifest;
  const epoch = policy.epoch ?? currentEpoch();
  const dates = epochDates(epoch);
  if (
    m.issuer !== policy.issuer ||
    m.originScope !== policy.issuer ||
    m.tokenType !== 1 ||
    m.tokenClass !== "search-v1" ||
    m.batchSize !== 10 ||
    m.epoch !== epoch ||
    m.expiresAt !== dates.expiresAt ||
    m.validFrom !== dates.validFrom ||
    m.issuanceEndsAt !== dates.issuanceEndsAt ||
    m.activeKeyId !==
      (await sha256(
        Uint8Array.from(
          atob(m.publicKey.replaceAll("-", "+").replaceAll("_", "/")),
          (c) => c.charCodeAt(0),
        ),
      ))
  )
    fail();
  if (
    policy.previous?.manifest.epoch === epoch &&
    canonical(policy.previous.manifest) !== canonical(m)
  )
    fail();
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
      credentials: "omit",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      redirect: "error",
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
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
          this.options.expectedFingerprint ?? state.trustedFingerprint,
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
    return this.request<Invoice>(
      `/api/invoices/${encodeURIComponent(capability)}`,
    );
  }
  async issue(invoice: Invoice, onProgress?: (stage: string) => void) {
    if (!invoice.capability) throw new BlindPassError("INVALID_REQUEST");
    const configuration = await this.configuration();
    if (
      invoice.issuerConfigHash !==
      (await sha256(canonical(configuration.manifest)))
    )
      throw new BlindPassError("ISSUER_POLICY_VIOLATION");
    onProgress?.("Generating 10 blinded requests locally");
    const batch = await createBlindBatch(configuration.manifest);
    onProgress?.("Issuer evaluating blinded requests");
    const body = JSON.stringify({
      capability: invoice.capability,
      requests: batch.requests,
      configurationHash: invoice.issuerConfigHash,
    });
    // Retain the same in-memory blinding state and transcript for one transport retry.
    const send = () =>
      this.request<{ responses: string[]; configuration: SignedManifest }>(
        "/api/issuance",
        { method: "POST", body },
      );
    let response: Awaited<ReturnType<typeof send>>;
    try {
      response = await send();
    } catch (error) {
      if (error instanceof TypeError) response = await send();
      else throw error;
    }
    await validateConfiguration(response.configuration, {
      issuer: configuration.manifest.issuer,
      fingerprint: await fingerprint(configuration.signingPublicKey),
      previous: configuration,
    });
    onProgress?.("Verifying proofs and unblinding locally");
    const credentials = await batch.finalize(response.responses);
    await this.options.store.exclusive(async () => {
      const state = await this.options.store.load();
      state.credentials.push(...credentials);
      const found = state.invoices.find((i) => i.id === invoice.id);
      if (found) found.status = "CREDITS_READY";
      state.activity.unshift({
        kind: "Purchase completed · 10 private credits",
        at: new Date().toISOString(),
      });
      await this.options.store.save(state);
    });
    onProgress?.("10 private credits ready");
    return credentials.length;
  }
  async balance() {
    const state = await this.options.store.load();
    return {
      remaining: state.credentials.filter(
        (t) => Date.parse(t.expiresAt) > Date.now(),
      ).length,
      used: state.used,
      expired: state.credentials.filter(
        (t) => Date.parse(t.expiresAt) <= Date.now(),
      ).length,
    };
  }
  async search(query: string) {
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
      await this.options.store.save(state);
      try {
        const result = await this.request<SearchResponse>(
          `/api/search?q=${encodeURIComponent(query)}`,
          { headers: { Authorization: authorization(token) } },
        );
        state.used++;
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
          code === "INVALID_REQUEST"
        ) {
          state.credentials.unshift(token);
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
