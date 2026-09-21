# Security

BlindPass is an unaudited reference implementation. Do not assume production readiness from passing tests or the use of standardized cryptographic primitives.

Never include live credentials, invoice capabilities, authorization headers, issuer private keys, merchant signing keys, wallet spending keys, or viewing keys in public issues. Report vulnerabilities privately to the operator or repository owner through their established security contact. No specific email address is invented by this project.

Priority review boundaries: client trust and configuration bootstrap; canonical token parsing; batch authorization and retry semantics; PostgreSQL transaction behavior; scanner trust and raw-body webhook authentication; browser script injection; local vault recovery; proxy/CDN logs; epoch lifecycle and key backups.

The API must never receive a spending key. The mock watcher is development-only and produces clearly non-payable sample destinations. Production configuration fails closed without explicit cryptographic and scanner secrets. Token credentials are bearer instruments: whoever possesses one may spend it once.

See `docs/threat-model.md`, `docs/cryptography.md` and `docs/deployment.md` before integrating real-value payments.
