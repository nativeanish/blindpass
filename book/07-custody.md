# 7. Keep credentials on the client

Blind issuance produces bearer credentials. Whoever can read and present one can spend it. A client vault therefore protects value, not merely preferences. BlindPass has one client interface, `CredentialStore`, with `load`, `save`, and `exclusive`; browser, CLI, and in-memory demo stores implement it differently.

## The shared client policy

[`BlindPassClient`](../packages/blindpass-client/src/index.ts) performs three jobs beyond sending HTTP requests. It validates the signed issuer manifest and remembers a trusted fingerprint and epoch configuration. It checks signed invoice terms before a payer acts on them. It manages credentials through issuance and redemption without revealing them in logs or CLI output. The HTTP wrapper omits cookies, disables caching and redirects, and sets no-referrer behavior.

The client policy is intentionally narrow: token type 1, `search-v1`, batch size ten, shared monthly dates, matching origin, and a public-key ID derived from the advertised public key. These checks reject a merchant-signed but uniquely tailored class, key, expiry, or key ID after an accepted configuration. They do not solve malicious first-use partitioning by themselves. Production clients should obtain a trusted signing fingerprint or manifest through an independent release channel.

## Browser storage

[`BrowserVault`](../apps/web/lib/vault.ts) stores ciphertext in IndexedDB and a non-extractable AES-GCM key in the same browser origin. Web Locks serialize cross-tab mutations. `non-extractable` stops ordinary export of key bytes; it does not prevent malicious same-origin JavaScript from asking the browser to decrypt or spend tokens. A merchant controlling the delivered web bundle has significant power. A compromised device does too. Clearing site data removes both key and ciphertext, so there is no account-based recovery.

This is a useful demonstration storage model, not a complete answer to browser supply-chain risk. Production choices include signed client releases, independent distribution, audited build pipelines, stricter content security policy, and carefully designed wallet-native or hardware-backed custody. Each choice changes deployability and recovery behavior; no storage label alone establishes anonymity.

## CLI storage

[`FileVault`](../cli/src/vault.ts) encrypts the state with AES-256-GCM. A fresh salt drives scrypt key derivation and a fresh IV is used for each save. Associated data binds the vault format. On Linux it prefers Secret Service; otherwise it asks for a passphrase or accepts an explicitly supplied environment secret. The directory and files use restrictive modes, writes go through a temporary file and rename, and an exclusive lock file prevents concurrent CLI commands from overwriting each other's state.

Encryption at rest limits exposure from a copied vault file. It does not protect a running process from malware, a leaked passphrase, or someone who can make the CLI itself disclose credentials. Backups must preserve the encryption secret; losing it loses the credits. A stale lock after a crash requires operator confirmation that no process is active before removal.

## Network transport is another boundary

The CLI's optional Tor transport requires a `socks5h://` proxy, checks a Tor Project exit endpoint, and fails closed if verification or the request fails. `socks5h` sends DNS resolution through the proxy. A Tor exit cannot reach a local development API at `localhost:3001`, so the ordinary lab uses a direct connection. Tor changes which network observer sees the source; it does not hide queries from the API or compensate for a unique redemption time.

## Exercise: design a crash recovery journal

Write a state machine for a credential with `available`, `pending`, `confirmed spent`, and `ambiguous` states. Specify exactly when each state is durably saved and which server response allows restoration. Then design a separate encrypted pending-issuance record that survives a process crash. It must preserve the library's blinding state securely enough to finalize the _same_ committed request transcript; generating a new transcript is not a retry. List the tests you would need before making a recovery claim.
