# Build checkpoints

Implementation follows the requested order. Test results are recorded in the final verification report.

All twelve implementation phases are complete. See [verification.md](docs/verification.md) for executed checks and external-integration limits. Real chain scanning requires external Zcash infrastructure; the default application simulates payment events only.

1. Workspace, PostgreSQL/Drizzle schema, API and Next.js skeleton.
2. RFC 9578 implementation, official reference vector, 10,000-cycle gate, PostgreSQL race test.
3. Offers, signed invoices, mock watcher, payment authorizations.
4. Payment-authorized, idempotent blinded issuance.
5. Client SDK, encrypted browser/CLI stores, CLI.
6. PostgreSQL full-text local search.
7. Purchase UI, wallet, search.
8. Comparison demo and side-channel education.
9. Signed configuration policy enforcement and malicious issuer tests.
10. Explicit SOCKS5h/Tor transport.
11. Authenticated scanner adapter boundary and fixtures.
12. Product polish, presentation, docs, containers, CI, final verification.
