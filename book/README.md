# Building BlindPass

## A developer's guide to private payment and unlinkable access

BlindPass is a reference application for buying ten search credits with Zcash and spending them later as single-use Privacy Pass credentials. This book teaches the architecture by building the same boundaries the repository uses: payment authorization, blind issuance, local custody, and transactional redemption. Its running example is intentionally a development demonstration. The engineering discussion treats each boundary as if it were being prepared for a production design review.

**Audience.** TypeScript developers who know HTTP, relational databases, and basic cryptographic terms. You do not need to know Zcash or oblivious pseudorandom functions before starting. You should be comfortable reading SQL transactions and running a local Node.js service.

**What you will build.** A local system in which a simulated payment authorizes a batch of ten _real_ RFC 9578 credentials. You will use the CLI to buy, issue, redeem, and inspect credits; read the implementation at each boundary; and test misuse and failure behavior. The simulation never represents a real Zcash transaction. The real scanner is an integration boundary requiring external tooling.

**Scope of the privacy claim.** Correct blind issuance removes a direct cryptographic identifier connecting an issuance transcript to a later credential. The merchant can still see payment observations, issuance timing, network metadata, redemption timing, and the search query. An observer can correlate those. This book uses “unlinkable” only for the protocol property under its stated assumptions, never as a synonym for complete anonymity.

## Contents

1. [The system and its trust boundaries](01-system.md)
2. [Run the reference application](02-lab.md)
3. [Model purchases without accounts](03-purchases.md)
4. [Receive and validate payment events](04-payments.md)
5. [Issue blind credentials](05-issuance.md)
6. [Verify and spend exactly once](06-redemption.md)
7. [Keep credentials on the client](07-custody.md)
8. [Threat model and privacy review](08-threat-model.md)
9. [Test the invariants](09-verification.md)
10. [Take a reference design toward production](10-production.md)
11. [Build it in deliberate slices](11-workshop.md)
12. [Glossary and primary references](12-reference.md)
13. [Build the workspace and domain model from zero](13-bootstrap.md)
14. [Design the database for privacy and concurrency](14-database.md)
15. [Understand the protocol and wire format deeply](15-protocol.md)
16. [Implement the HTTP and SDK boundary](16-api-sdk.md)
17. [Rebuild the browser experience](17-browser.md)
18. [Integrate a real Zcash scanner](18-scanner.md)
19. [Deploy and operate the production architecture](19-operations.md)
20. [Failure recovery and release acceptance](20-recovery.md)
21. [Code atlas and reading paths](21-code-atlas.md)

Chapters 1–12 establish the system and its implementation order. Chapters 13–20 slow down at each boundary and give the construction and operations details needed for a serious implementation. The [existing technical documentation](../docs/architecture.md) remains the protocol and operations reference.

## Conventions and repository snapshot

Commands run from the repository root. `pnpm blindpass` invokes the local CLI. Example output is illustrative; invoice IDs, keys, times, and hashes vary. Code references are relative to this repository. “Implemented” describes code in this checkout; “production extension” is design work you would still need to do. The current web landing page is present, but several app/demo routes described by the root README are deleted in the working tree. The CLI workflow is therefore the stable hands-on path for this manuscript. No chapter requires the missing routes.

The book itself is Markdown source so it can be reviewed in Git, rendered by common Markdown readers, and adapted into an EPUB or print workflow. It does not assert that the current repository is production ready or independently audited.
