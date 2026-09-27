# 6 Issuer Integrity & Configuration Anchoring

> **Part II — Credentials · Build checkpoint 3 of 3**

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

{{blindpass-include:apps/api/src/keys.ts}}

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

The private VOPRF token type is “privately verifiable” in a precise sense: the
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

{{blindpass-include:packages/blindpass-client/src/index.ts}}

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

Each method uses `store.exclusive`; correctness must hold for a file lock, Web
Lock, or test queue without changing SDK logic.

Trust on first use is still first-use trust. A malicious merchant can show a
new client a unique signing identity and unique epoch key. Production clients
should ship a fingerprint through an independent channel or consult a
transparency log. Cross-client gossip can detect equivocation; a signature by
itself cannot.

## 6.3 Step 3 — Test a correctly signed malicious issuer

{{blindpass-include:tests/policy.test.ts}}

These cases are more revealing than a bad-signature test. The development API
uses the genuine merchant signing key to sign configurations with a unique
VOPRF key, expiry, class, or key ID. Every signature verifies. Client policy
still rejects every response.

```bash
pnpm exec vitest run tests/policy.test.ts
```

## 6.4 Step 4 — Rotate without cohort collapse

Rotate on a public calendar boundary, publish the next key before use, and keep
the old secret only through its common redemption grace. All clients in an
epoch must receive the same tuple `(key, class, batch size, valid-from,
issuance-end, expiry)`. Rotation frequency trades key-exposure duration against
anonymity-set size and operational complexity. A per-request rotation is a
tracking mechanism.

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
