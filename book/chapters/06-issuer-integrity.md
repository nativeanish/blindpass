# 6 Issuer Integrity & Configuration Anchoring

> **Part II — Credentials · Build checkpoint 3 of 3**

*In this chapter*
- Separate the stable Ed25519 signing identity from rotatable VOPRF epoch keys
- Publish a signed manifest via RFC 9578's well-known directory
- Pin the issuer identity on the client and enforce strict configuration policy
- Test correctly-signed but privacy-hostile issuer configurations

The happy path from chapters 4 and 5 trusts the issuer configuration. This
chapter removes that assumption. You will generate separate signing and VOPRF
keys, publish a common manifest, pin its identity on the client, and test
configurations whose signatures are valid but whose privacy policy is hostile.

Blind issuance hides a token from an issuer that uses a common key and common
challenge. It cannot stop the issuer from handing Alice key A and Bob key B.
Their later tokens reveal which partition issued them. A merchant signature
authenticates the partition; it does not prove that everybody saw the same
configuration.

## 6.1 Step 1 — Separate signing identity from VOPRF epochs

BlindPass maintains a stable Ed25519 signing identity and rotates VOPRF keys by
UTC calendar month. The signing key authenticates manifests and invoice
documents. The VOPRF key issues and privately verifies access tokens. Reusing
one key across these protocols would violate key separation and cannot work
across their different algorithms.

```text
┌──────────────────────────────────────────────────────────┐
│                  Merchant Identity                       │
│  ┌─────────────────┐    ┌────────────────────────────┐  │
│  │ Ed25519 Signing  │    │  VOPRF P-384 Epoch Key     │  │
│  │ (stable, long)   │    │  (monthly rotation)        │  │
│  │ Signs manifests  │    │  Issues/verifies tokens    │  │
│  │ Signs invoices   │    │  Grace period after epoch  │  │
│  └─────────────────┘    └────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

```typescript
// File: apps/api/src/keys.ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generatePublicKey, Oprf } from "@cloudflare/voprf-ts";
import { keyGen, TokenIssuer } from "@blindpass/privacy-pass";
import {
  b64,
  unb64,
  buffer,
  utf8,
  canonical,
  sha256,
  epochDates,
  currentEpoch,
  type Manifest,
  type SignedManifest,
  type SignedDocument,
} from "@blindpass/shared";
import type { Database } from "./db/connection.js";
import { config } from "./config.js";

interface SigningKeys {
  privateKey: string;
  publicKey: string;
}

async function developmentSecret<T>(
  name: string,
  create: () => Promise<T>,
): Promise<T> {
  const dir = resolve(process.env.BLINDPASS_SECRETS_DIR ?? ".secrets");
  await mkdir(dir, { recursive: true, mode: 0o700 }); // <1>
  const file = resolve(dir, name);
  try {
    return JSON.parse(await readFile(file, "utf8")) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const value = await create();
  try {
    await writeFile(file, JSON.stringify(value), { mode: 0o600, flag: "wx" });
    return value;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      return JSON.parse(await readFile(file, "utf8")) as T;
    throw error;
  }
}

export async function loadKeys(database: Database) {
  const signing: SigningKeys =
    process.env.MERCHANT_CONFIG_PRIVATE_KEY &&
    process.env.MERCHANT_CONFIG_PUBLIC_KEY
      ? {
          privateKey: process.env.MERCHANT_CONFIG_PRIVATE_KEY,
          publicKey: process.env.MERCHANT_CONFIG_PUBLIC_KEY,
        }
      : await developmentSecret("merchant-signing.json", async () => {
          const pair = await crypto.subtle.generateKey("Ed25519", true, [
            "sign",
            "verify",
          ]);
          return {
            privateKey: b64(
              new Uint8Array(
                await crypto.subtle.exportKey("pkcs8", pair.privateKey),
              ),
            ),
            publicKey: b64(
              new Uint8Array(
                await crypto.subtle.exportKey("raw", pair.publicKey),
              ),
            ),
          };
        });

  const signingKey = await crypto.subtle.importKey(
    "pkcs8",
    buffer(unb64(signing.privateKey)),
    "Ed25519",
    false,
    ["sign"],
  );

  async function sign<T>(document: T): Promise<SignedDocument<T>> { // <2>
    return {
      document,
      signature: b64(
        new Uint8Array(
          await crypto.subtle.sign(
            "Ed25519",
            signingKey,
            buffer(utf8(canonical(document))),
          ),
        ),
      ),
      signingPublicKey: signing.publicKey,
    };
  }

  const epoch = currentEpoch();
  if (
    process.env.PRIVACYPASS_ISSUER_SECRET &&
    process.env.PRIVACYPASS_ISSUER_EPOCH !== epoch
  )
    throw new Error(
      "Explicit issuer key must name the current PRIVACYPASS_ISSUER_EPOCH.",
    );

  const privateKey = process.env.PRIVACYPASS_ISSUER_SECRET
    ? unb64(process.env.PRIVACYPASS_ISSUER_SECRET)
    : unb64(
        (
          await developmentSecret(`issuer-${epoch}.json`, async () => ({
            privateKey: b64((await keyGen()).privateKey),
          }))
        ).privateKey,
      );

  const publicKey = generatePublicKey(Oprf.Suite.P384_SHA384, privateKey); // <3>

  const manifest: Manifest = {
    version: 1,
    issuer: config.ISSUER_ORIGIN,
    activeKeyId: await sha256(publicKey), // <4>
    tokenType: 1,
    tokenClass: "search-v1",
    epoch,
    ...epochDates(epoch),
    publicKey: b64(publicKey),
    originScope: config.ISSUER_ORIGIN,
    batchSize: 10,
  };

  const signed = await sign(manifest);
  const signedManifest: SignedManifest = {
    manifest,
    signature: signed.signature,
    signingPublicKey: signing.publicKey,
  };

  const existing =
    await database.sql`SELECT issuer_key_id FROM issuer_epochs WHERE epoch=${epoch}`;
  if (existing.length && existing[0].issuer_key_id !== manifest.activeKeyId)
    throw new Error( // <5>
      "Refusing to replace an existing common epoch key. Restore the epoch secret.",
    );

  await database.sql`INSERT INTO issuer_epochs(epoch,issuer_key_id,public_key,valid_from,valid_until,verification_grace_until,manifest) VALUES(${epoch},${manifest.activeKeyId},${manifest.publicKey},${manifest.validFrom},${manifest.issuanceEndsAt},${manifest.expiresAt},${JSON.stringify(signedManifest)}::jsonb) ON CONFLICT DO NOTHING`;

  const issuer = new TokenIssuer(manifest, privateKey);
  const issuers = [issuer];

  const previous =
    await database.sql`SELECT epoch,manifest FROM issuer_epochs WHERE epoch<>${epoch} AND verification_grace_until>now()`; // <6>
  const previousSecrets = JSON.parse(
    process.env.PRIVACYPASS_PREVIOUS_KEYS ?? "{}",
  ) as Record<string, string>;

  for (const row of previous) {
    let secret = previousSecrets[row.epoch];
    if (!secret && config.BLINDPASS_ENV !== "production") {
      try {
        secret = (
          JSON.parse(
            await readFile(
              resolve(
                process.env.BLINDPASS_SECRETS_DIR ?? ".secrets",
                `issuer-${row.epoch}.json`,
              ),
              "utf8",
            ),
          ) as { privateKey: string }
        ).privateKey;
      } catch {
        continue;
      }
    }
    if (secret)
      issuers.push(
        new TokenIssuer(
          (row.manifest as SignedManifest).manifest,
          unb64(secret),
        ),
      );
  }

  return {
    issuer,
    issuers,
    manifest,
    signedManifest,
    sign,
    signingPublicKey: signing.publicKey,
  };
}

export type Keys = Awaited<ReturnType<typeof loadKeys>>;
```

> **<1>** Load or create Ed25519 signing identity with private file modes
>
> **<2>** Sign closure over non-extractable private key
>
> **<3>** Derive VOPRF public key from private scalar using P-384 suite
>
> **<4>** Key ID = SHA-256(SerializeElement(pkI)) per RFC 9578
>
> **<5>** Existing epoch row must never be replaced by different key
>
> **<6>** Previous secrets loaded only through grace period

> **▶ Try It Out**
> ```bash
> pnpm run build
> ```
> The TypeScript compiler validates our newly added type and functional requirements.

The loader enforces several operational invariants:

- Development keys are created with exclusive file creation and private modes.
- Production can inject explicit keys; an explicit VOPRF key must name the
  current epoch.
- The public VOPRF key is derived from the private scalar using the P-384 suite.
- The key ID is `SHA-256(SerializeElement(pkI))`, as RFC 9578 specifies.
- An existing epoch row may never be replaced by a different key. Losing the
  secret is an outage, not permission to partition the cohort.
- Previous secrets remain loaded only through their verification grace period.

Build `loadKeys` in lifecycle order. Load or import the long-lived Ed25519 key;
create a `sign` closure around the non-extractable private key; resolve the
current epoch; load or generate its VOPRF scalar; derive the public key and key
ID; assemble and sign the manifest; compare it with any existing epoch row; then
load still-valid previous issuers. This order ensures no route can observe a
half-initialized key set.

The private VOPRF token type is "privately verifiable" in a precise sense: the
origin needs the issuer secret to verify tokens. Keep issuance and redemption
within one trust domain or use a dedicated verification service with strict key
access. Do not distribute that secret to arbitrary origins.

## 6.2 Step 2 — Publish and pin a directory

RFC 9578 defines `/.well-known/private-token-issuer-directory`, including an
issuer request URI and token keys. BlindPass adds a signed manifest containing
the common class, epoch, boundaries, origin scope, batch size, and active key
ID. The client verifies Ed25519, checks every policy field, pins the signing-key
fingerprint, and rejects a different manifest for an already cached epoch.

The complete client module contains configuration validation, invoice document
verification, issuance, custody coordination, and redemption. Keeping these
checks in the SDK prevents the CLI and browser from drifting apart.

```typescript
// File: packages/blindpass-client/src/index.ts
// Listing 6.2: validateConfiguration function
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
  if (!SignedManifestSchema.safeParse(config).success) fail(); // <1>
  if (
    !(await verifySignature( // <2>
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
  const epoch = policy.epoch ?? currentEpoch(); // <4>
  const dates = epochDates(epoch);
  if (
    m.issuer !== policy.issuer || // <3>
    m.originScope !== policy.issuer ||
    m.tokenType !== 1 ||
    m.tokenClass !== "search-v1" ||
    m.batchSize !== 10 ||
    m.epoch !== epoch ||
    m.expiresAt !== dates.expiresAt ||
    m.validFrom !== dates.validFrom ||
    m.issuanceEndsAt !== dates.issuanceEndsAt ||
    m.activeKeyId !== // <5>
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
    canonical(policy.previous.manifest) !== canonical(m) // <6>
  )
    fail();
  return config;
}
```

> **<1>** `.strict()` rejects unrecognized manifest fields
>
> **<2>** Signature verification precedes policy checks
>
> **<3>** Issuer and origin must match expected host
>
> **<4>** Locally derived epoch boundaries prevent server manipulation
>
> **<5>** Active key ID must hash the advertised public key
>
> **<6>** Cached epoch configuration must be byte-equivalent

> **▶ Try It Out**
> ```bash
> pnpm exec vitest run tests/client.test.ts
> ```
> This verifies the configuration validator on valid policies.

Study `validateConfiguration` as a deny-by-default predicate. `.strict()`
rejects unrecognized manifest fields. Signature verification precedes policy
checks. Issuer and origin must equal the expected host. Type, class, batch size,
epoch, and all dates are locally derived constants. The active key ID must hash
the advertised public key. A cached configuration for the same epoch must be
byte-equivalent after canonicalization.

Then follow the SDK from trust establishment to spending:

1. `configuration()` fetches the directory without cookies, validates it under
   the expected hostname and fingerprint, then saves the pin and manifest.
2. `buy()` verifies the signed invoice and cross-checks every duplicated field.
3. `issue()` revalidates configuration before and after the network call,
   finalizes proofs locally, and saves tokens only after the whole batch passes.
4. `search()` removes one token before transport and restores it only for
   failures known not to have committed work.

```typescript
// File: packages/blindpass-client/src/index.ts
// Listing 6.3: BlindPassClient buy and issue methods
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
```

> **▶ Try It Out**
> ```bash
> pnpm exec vitest run packages/blindpass-client
> ```
> Ensures the issuance process properly evaluates proofs.

```typescript
// File: packages/blindpass-client/src/index.ts
// Listing 6.4: BlindPassClient search method with pessimistic spending
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
```

> **▶ Try It Out**
> ```bash
> # A test command here for pessimistic spending
> pnpm run test:spending
> ```
> Verifies that failures return the token correctly.

Each method uses `store.exclusive`; correctness must hold for a file lock, Web
Lock, or test queue without changing SDK logic.

> **🔒 SECURITY NOTE: Trust on first use**
>
> Trust on first use is still first-use trust — a malicious merchant can show a new client a unique signing identity and unique epoch key. Production clients should ship a fingerprint through an independent channel or consult a transparency log. Cross-client gossip can detect equivocation; a signature by itself cannot.

## 6.3 Step 3 — Test a correctly signed malicious issuer

> **⚠ PITFALL: Partitioning by configuration**
>
> A buyer-specific key, class, count, or expiry becomes a partition tag — the simplest malicious-issuer attack. Avoid configuring different keys for different subsets of your users.

```typescript
// File: tests/policy.test.ts
import { beforeAll, afterAll, it, expect } from "vitest";
import { testDatabase } from "./database.js";
import { createApp } from "../apps/api/src/app.js";
import { validateConfiguration } from "../packages/blindpass-client/src/index.js";
import {
  fingerprint,
  verifySignature,
  type SignedManifest,
} from "../packages/shared/src/index.js";

let database: Awaited<ReturnType<typeof testDatabase>>;
let runtime: Awaited<ReturnType<typeof createApp>>;

beforeAll(async () => {
  database = await testDatabase();
  runtime = await createApp({ database });
});

afterAll(async () => {
  await runtime?.app.close();
  await database?.cleanup();
});

it.each(["key", "expiry", "class", "key-id"])(
  "rejects malicious merchant-signed %s configuration", // <1>
  async (kind) => {
    const response = await runtime.app.inject(
      `/api/dev/malicious-config/${kind}`,
    );
    expect(response.statusCode).toBe(200);
    const config = response.json<SignedManifest>();

    expect(
      await verifySignature( // <2>
        config.manifest,
        config.signature,
        config.signingPublicKey,
      ),
    ).toBe(true);

    await expect(
      validateConfiguration(config, { // <3>
        issuer: runtime.keys.manifest.issuer,
        fingerprint: await fingerprint(runtime.keys.signingPublicKey),
        previous: runtime.keys.signedManifest,
      }),
    ).rejects.toMatchObject({ code: "ISSUER_POLICY_VIOLATION" });
  },
);

it("accepts common policy and rejects a wrong pinned merchant identity", async () => {
  const config = runtime.keys.signedManifest;

  await expect(
    validateConfiguration(config, {
      issuer: config.manifest.issuer,
      previous: config,
    }),
  ).resolves.toEqual(config);

  await expect(
    validateConfiguration(config, {
      issuer: config.manifest.issuer,
      fingerprint: "wrong", // <4>
    }),
  ).rejects.toMatchObject({ code: "ISSUER_POLICY_VIOLATION" });
});
```

> **<1>** Test all partitioned tag types: unique VOPRF key, expiry, class, or key ID.
>
> **<2>** Every signature verifies since it uses genuine merchant signing key.
>
> **<3>** Client policy rejects it regardless of valid signature.
>
> **<4>** Reject if fingerprint doesn't match pinned merchant identity.

> **▶ Try It Out**
> ```bash
> pnpm exec vitest run tests/policy.test.ts
> ```
> This suite tests both valid signatures with invalid claims and valid policies with incorrect signatures.

These cases are more revealing than a bad-signature test. The development API
uses the genuine merchant signing key to sign configurations with a unique
VOPRF key, expiry, class, or key ID. Every signature verifies. Client policy
still rejects every response.

## 6.4 Step 4 — Rotate without cohort collapse

Rotate on a public calendar boundary, publish the next key before use, and keep
the old secret only through its common redemption grace. All clients in an
epoch must receive the same tuple `(key, class, batch size, valid-from,
issuance-end, expiry)`. Rotation frequency trades key-exposure duration against
anonymity-set size and operational complexity. A per-request rotation is a
tracking mechanism.

> **🔒 SECURITY NOTE: Trust anchor redundancy**
>
> Ed25519 signing key leak — clients need a new trust anchor through an independent channel; a signature alone cannot prove cross-client consistency. Prepare offline backup rotation procedures ahead of time.

Monitor configuration hashes by epoch from independent vantage points. Alert
on more than one key or manifest hash for the same issuer and epoch. Back up the
stable Ed25519 identity and every still-verifiable VOPRF secret separately,
encrypted and access controlled.

### Part II checkpoint

The client now treats issuer configuration as a policy commitment, not merely
signed server data. This closes the simplest malicious-issuer partition attacks
while leaving global consistency as an explicit transparency problem.

At this point you can issue and redeem real tokens without accounts. Part III
adds payment authorization; it must not alter token inputs or redemption rows.
