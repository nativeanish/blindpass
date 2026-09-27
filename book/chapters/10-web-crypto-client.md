# 10 The Web Client & Hardware-Bound Web Crypto

> **Part IV — Clients · Build checkpoint 2 of 3**

You will implement the same `CredentialStore` interface for the browser, then
attach it to purchase and redemption pages. Keeping the SDK unchanged is the
test that custody and protocol logic are properly separated.

Browsers cannot use the operating-system keyring directly. They can persist a
non-extractable `CryptoKey` in IndexedDB and use it for AES-GCM operations. This
keeps raw key bytes out of application JavaScript, but “non-extractable” is not
the same as hardware-bound: the browser may store the key in software, and any
malicious same-origin script can ask Web Crypto to use it.

## 10.1 Step 1 — Create the IndexedDB primitives

{{blindpass-include:apps/web/lib/vault.ts}}

Build from the storage adapter upward. `openVault` owns schema creation. Small
`get` and `set` helpers open one transaction, settle on request or transaction
events, and close the database. `BrowserVault.key()` creates one
non-extractable AES key. `load` and `save` use it with fresh IVs and identical
AAD. `exclusive` wraps the SDK operation with a named Web Lock. Only after those
pieces work should `browserClient()` cache the SDK instance.

`generateKey(..., false, ...)` sets `extractable` to false. IndexedDB stores the
structured-cloned `CryptoKey` and a separate `{iv, data}` ciphertext record.
Every save uses a new 96-bit IV and constant associated data. Reusing a GCM IV
with the same key can reveal relationships between plaintexts and undermine
authentication, so randomness failure is catastrophic.

Web Locks serializes all read-modify-write SDK operations across tabs. Without
it, two tabs could load the same token and both send it; the server would stop
double spending, but the losing tab would show confusing local state. BlindPass
requires a secure context supporting `navigator.locks`.

The key and ciphertext share one origin. Clearing site data destroys both, so
there is no account recovery. Copying only the ciphertext does not create a
backup. A production recovery feature needs an explicit user-controlled export
protocol and a new threat analysis.

## 10.2 Step 2 — Build purchase as an observable state machine

The purchase page never asks for an email or password. It creates a signed
invoice, displays a payment URI, polls by secret capability, and invokes local
blind finalization after confirmation. The complete component also labels the
development simulation so it cannot be mistaken for a payable address.

{{blindpass-include:apps/web/app/app/buy/page.tsx}}

UI state is not authoritative. PostgreSQL owns invoice state; the page's
`ready` flag only controls presentation after the SDK has verified and saved all
ten credentials. A reload resumes from the invoice capability encrypted in the
vault.

Read the component by event path rather than JSX order. The initial action calls
`buy`; the query polls `invoice(capability)`; development simulation emits
confirmation states; the receive action calls `issue` with a progress callback;
the ready branch links to search. Presentation derives from `latest.status`, so
the page can reload without inventing payment state.

The screen intentionally warns against immediate redemption. Cryptographic
unlinkability does not erase a distinctive `pay -> issue -> redeem` timing
sequence.

## 10.3 Step 3 — Spend from the device

{{blindpass-include:apps/web/app/app/search/page.tsx}}

The page delegates token choice and persistence to the SDK. It invalidates
balance queries after each attempt and says plainly that the service receives
the query. Privacy-preserving authorization is not private information
retrieval.

Keep the submit handler small: set busy state, call the SDK once, record the
typed result or error, then invalidate wallet queries in `finally`. Token
selection, authorization syntax, and ambiguous-result policy do not belong in
React state.

React's rendering boundary introduces a major threat: the merchant serves the
JavaScript that holds credentials. A compromised deployment or injected
same-origin script can call `browserClient().search`, enumerate UI state, or
exfiltrate plaintext after decryption. Strong CSP, dependency review, integrity
controls, reproducible builds, and a separately distributed client reduce this
risk. No IndexedDB encryption scheme can protect against code authorized to use
its key.

## 10.4 Step 4 — Exercise the browser

```bash
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Playwright drives the actual browser, IndexedDB, API, simulated payment state,
real VOPRF issuance, and redemption. Run it against a disposable PostgreSQL
instance. Browser tests should assert visible simulation labels and balance
changes, while cryptographic byte properties remain in Vitest where failures
are easier to diagnose.

### Build checkpoint

The browser client now has encrypted origin-local custody, cross-tab exclusion,
and honest recovery semantics. It improves storage hygiene without claiming a
hardware guarantee the Web Crypto API does not provide.
