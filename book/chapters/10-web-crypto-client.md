# 10 The Web Client & Hardware-Bound Web Crypto

> **Part IV — Clients · Build checkpoint 2 of 3**

*In this chapter*
- Implement the CredentialStore interface for the browser using IndexedDB and Web Crypto
- Generate a non-extractable AES-256-GCM key for origin-local encryption
- Coordinate cross-tab access with Web Locks
- Build the purchase and search pages as observable state machines

You will implement the same `CredentialStore` interface for the browser, then
attach it to purchase and redemption pages. Keeping the SDK unchanged is the
test that custody and protocol logic are properly separated.

Browsers cannot use the operating-system keyring directly. They can persist a
non-extractable `CryptoKey` in IndexedDB and use it for AES-GCM operations. This
keeps raw key bytes out of application JavaScript, but “non-extractable” is not
the same as hardware-bound: the browser may store the key in software, and any
malicious same-origin script can ask Web Crypto to use it.

```text
┌─────────────────────────────────────────────────────┐
│                  Browser Origin                      │
│  ┌─────────────┐   ┌───────────────┐   ┌───────────┐  │
│  │  Web Crypto  │   │   IndexedDB    │   │ Web Locks │  │
│  │ CryptoKey   │   │  {iv, data}   │   │ cross-tab │  │
│  │ (non-ext)   │──>│  (encrypted)  │   │ exclusion │  │
│  └─────────────┘   └───────────────┘   └───────────┘  │
└─────────────────────────────────────────────────────┘
  Clearing site data destroys key + ciphertext. No recovery.
```

## 10.1 Step 1 — Create the IndexedDB primitives

Build from the storage adapter upward. `openVault` owns schema creation. Small
`get` and `set` helpers open one transaction, settle on request or transaction
events, and close the database. `BrowserVault.key()` creates one
non-extractable AES key. `load` and `save` use it with fresh IVs and identical
AAD. `exclusive` wraps the SDK operation with a named Web Lock. Only after those
pieces work should `browserClient()` cache the SDK instance.

```typescript
// File: apps/web/lib/vault.ts
import {
  BlindPassClient,
  emptyState,
  type ClientState,
  type CredentialStore,
} from "@blindpass/client";
import { buffer } from "@blindpass/shared";

function openVault(): Promise<IDBDatabase> {
  // <1>
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("blindpass-vault", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("private");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function get<T>(key: string): Promise<T | undefined> {
  const db = await openVault();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("private", "readonly");
    const request = tx.objectStore("private").get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

async function set(key: string, value: unknown) {
  const db = await openVault();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("private", "readwrite");
    tx.objectStore("private").put(value, key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => reject(tx.error);
  });
}

interface Ciphertext {
  iv: Uint8Array;
  data: ArrayBuffer;
}

export class BrowserVault implements CredentialStore {
  private async key() {
    let key = await get<CryptoKey>("key");
    if (!key) {
      key = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        false,
        // <2>
        ["encrypt", "decrypt"],
      );
      await set("key", key);
    }
    return key;
  }

  async load() {
    const record = await get<Ciphertext>("state");
    if (!record) return emptyState();
    const bytes = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: buffer(record.iv),
        additionalData: new TextEncoder().encode("blindpass-browser-v1"),
      },
      await this.key(),
      record.data,
    );
    return JSON.parse(new TextDecoder().decode(bytes)) as ClientState;
  }

  async save(state: ClientState) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt(
      // <3>
      {
        name: "AES-GCM",
        iv,
        additionalData: new TextEncoder().encode("blindpass-browser-v1"),
      },
      await this.key(),
      new TextEncoder().encode(JSON.stringify(state)),
    );
    await set("state", { iv, data });
  }

  async exclusive<T>(fn: () => Promise<T>) {
    if (!navigator.locks)
      throw new Error(
        "A secure browser with Web Locks is required. Open localhost or use HTTPS.",
      );
    return navigator.locks.request("blindpass-vault", fn);
    // <4>
  }
}

let sdk: BlindPassClient | undefined;
export function browserClient() {
  return (sdk ??= new BlindPassClient({
    baseUrl: "",
    store: new BrowserVault(),
    issuer: window.location.host,
    expectedFingerprint: process.env.NEXT_PUBLIC_BLINDPASS_FINGERPRINT,
  }));
}
```

> **<1>** openVault creates/opens IndexedDB 'blindpass-vault'. This acts as the persistent store for the client.
>
> **<2>** generateKey(AES-GCM, 256, false) — non-extractable. Setting this to false ensures the raw key material cannot be exported to JavaScript.
>
> **<3>** encrypt with fresh 96-bit IV and constant AAD. Reusing a GCM IV is catastrophic for security.
>
> **<4>** BrowserVault.exclusive uses navigator.locks. This coordinates cross-tab access to prevent race conditions during read-modify-write cycles.

> **▶ Try It Out**
> ```bash
> pnpm run lint
> ```
> This command verifies the syntax of your newly added Vault store.

> **🔒 SECURITY NOTE: GCM IV Reuse**
>
> GCM IV reuse with the same key can reveal relationships between plaintexts. Every save must use a fresh random IV.

> **⚠ PITFALL: Account Recovery**
>
> Clearing site data destroys both key and ciphertext. There is no account-based recovery. Copying only the ciphertext does not create a backup.

## 10.2 Step 2 — Build purchase as an observable state machine

The purchase page never asks for an email or password. It creates a signed
invoice, displays a payment URI, polls by secret capability, and invokes local
blind finalization after confirmation. The complete component also labels the
development simulation so it cannot be mistaken for a payable address.

```typescript
// File: apps/web/app/app/buy/page.tsx
"use client";
import { useState } from "react";
// ... imports omitted for brevity
import { browserClient } from "../../../lib/vault";

export default function Buy() {
  const [invoice, setInvoice] = useState<Invoice>();
  // <1>
  const [ready, setReady] = useState(false);
  const { data: latest } = useQuery({
    queryKey: ["invoice", invoice?.id],
    enabled: !!invoice && !ready,
    queryFn: () => browserClient().invoice(invoice!.capability!), // <3>
    refetchInterval: 1500,
  });

  // ... state machine logic omitted
  
  return (
    // ... UI skeleton omitted
    <div className="qr-layout">
      <div className="qr-box">
        <QRCodeSVG
          value={invoice.paymentUri} // <2>
          size={154}
        />
      </div>
    </div>
    
    // ...
    {invoice.simulated && (
      <div className="notice">
        <strong className="accent">
          SIMULATED PAYMENT EVENT // <5>
        </strong>
        <span>This is a non-payable sample URI.</span>
      </div>
    )}
    // ...

    {step === 3 && (
      <button
        onClick={() =>
          action(async () => {
            await browserClient().issue(invoice, setStage); // <4>
            setReady(true);
          })
        }
      >
        Receive private credits
      </button>
    )}
  );
}
```

> **<1>** No email, no password, no account creation. The component tracks an invoice object directly.
>
> **<2>** Signed invoice with payment URI. The QR code encodes a ZIP-321 payment request.
>
> **<3>** Poll by secret capability. The client polls the invoice using a secure capability, keeping the invoice private from onlookers.
>
> **<4>** Local blind finalization after confirmation. The client runs local cryptographic operations to unblind and verify credentials.
>
> **<5>** Development simulation label. Clearly marks the UI when running in simulation mode.

> **▶ Try It Out**
> ```bash
> pnpm dev
> ```
> Visit the local purchase page and verify the UI state transitions.

UI state is not authoritative. PostgreSQL owns invoice state; the page's
`ready` flag only controls presentation after the SDK has verified and saved all
ten credentials. A reload resumes from the invoice capability encrypted in the
vault.

The screen intentionally warns against immediate redemption. Cryptographic
unlinkability does not erase a distinctive `pay -> issue -> redeem` timing
sequence.

## 10.3 Step 3 — Spend from the device

The page delegates token choice and persistence to the SDK. It invalidates
balance queries after each attempt and says plainly that the service receives
the query. Privacy-preserving authorization is not private information
retrieval.

```typescript
// File: apps/web/app/app/search/page.tsx
"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, ArrowUpRight, Check, Globe, ScanLine } from "lucide-react";
import { Badge, ErrorNotice, EmptyState } from "@blindpass/ui";
import type { SearchResponse } from "@blindpass/shared";
import { browserClient } from "../../../lib/vault";
import { SearchForm } from "../../../components/search-form";

export default function SearchPage() {
  const [initial, setInitial] = useState("");
  const [result, setResult] = useState<SearchResponse>();
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const { data: balance } = useQuery({
    queryKey: ["balance"],
    queryFn: () => browserClient().balance(),
  });

  useEffect(() => {
    setInitial(new URLSearchParams(location.search).get("q") ?? "");
  }, []);

  async function search(query: string) {
    setBusy(true);
    setError(undefined);
    try {
      setResult(await browserClient().search(query));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
      await qc.invalidateQueries({ queryKey: ["balance"] });
      await qc.invalidateQueries({ queryKey: ["wallet"] });
    }
  }

  return (
    <div id="main-content">
      <div className="page-heading">
        <div>
          <h1>Curiosity, without the attachment.</h1>
          <p>
            Search privacy, security and internet standards. Each query uses one
            private credit.
          </p>
        </div>
        <Badge tone="green">
          <ScanLine size={11} />
          {balance?.remaining ?? "—"} CREDITS
        </Badge>
      </div>
      <div className="search-page-form">
        <SearchForm
          key={initial}
          initial={initial}
          busy={busy}
          onSearch={search}
        />
      </div>
      <ErrorNotice error={error} />
      {busy && (
        <div role="status">
          <div className="loading-line" />
          <p>Verifying a private credit and searching the local index…</p>
        </div>
      )}
      {result ? (
        <>
          <div className="results-top">
            <span>
              {result.total} results for{" "}
              <span className="accent">“{result.query}”</span>
            </span>
            <Badge tone="green">
              <Check size={11} />
              PRIVATE CREDIT USED · {balance?.remaining ?? "…"} REMAINING
            </Badge>
          </div>
          <div className="search-results">
            {result.results.length ? (
              result.results.map((r) => (
                <a
                  key={r.id}
                  className="search-result"
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  <div className="result-title">
                    <span>{r.title}</span>
                    <ArrowUpRight size={17} className="muted" />
                  </div>
                  <div className="result-url">
                    <Globe size={12} />
                    {new URL(r.url).hostname}
                    <span> / </span>
                    {r.id}
                    <Badge>{r.category}</Badge>
                  </div>
                  <p>{r.description}</p>
                </a>
              ))
            ) : (
              <EmptyState
                icon={<Search size={26} />}
                heading="No matches in this corpus."
              >
                Try a broader technical term. The search executed, so one credit
                was consumed.
              </EmptyState>
            )}
          </div>
        </>
      ) : (
        <div className="panel" style={{ marginTop: 30 }}>
          <EmptyState
            icon={<Search size={28} />}
            heading="A quieter way to find answers."
          >
            1,806 indexed technical resources. Your queries are processed to
            return results and are not saved as server-side search history.
          </EmptyState>
          {balance?.remaining === 0 && (
            <div style={{ textAlign: "center", paddingBottom: 30 }}>
              <Link href="/app/buy" className="button button-small">
                Get private credits <ArrowUpRight size={14} />
              </Link>
            </div>
          )}
        </div>
      )}
      <div className="privacy-note">
        <Globe size={19} />
        <p>
          <strong>Your query reaches the service.</strong> BlindPass removes the
          direct cryptographic link to payment. It does not hide your query
          contents or your current network connection. Use the CLI’s verified
          Tor mode for an additional network layer.
        </p>
      </div>
    </div>
  );
}
```

> **▶ Try It Out**
> ```bash
> pnpm test
> ```
> Run tests to ensure your component logic correctly processes search results.

> **🔒 SECURITY NOTE: Same-Origin JavaScript Risks**
>
> The merchant serves the JavaScript that holds credentials. A compromised deployment or injected same-origin script can call browserClient().search or exfiltrate plaintext after decryption. Non-extractable keys do not protect against authorized code.

## 10.4 Step 4 — Exercise the browser

> **▶ Try It Out**
> ```bash
> pnpm build
> pnpm exec playwright install chromium
> pnpm test:e2e
> ```
> Playwright tests to execute end-to-end user flows.

Playwright drives the actual browser, IndexedDB, API, simulated payment state,
real VOPRF issuance, and redemption. Run it against a disposable PostgreSQL
instance. Browser tests should assert visible simulation labels and balance
changes, while cryptographic byte properties remain in Vitest where failures
are easier to diagnose.

### Build checkpoint

The browser client now has encrypted origin-local custody, cross-tab exclusion,
and honest recovery semantics. It improves storage hygiene without claiming a
hardware guarantee the Web Crypto API does not provide.
