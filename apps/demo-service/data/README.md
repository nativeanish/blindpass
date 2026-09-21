# Search corpus

`rfcs.json` contains 1,800 real RFC titles, publication metadata and canonical RFC Editor links, downloaded with `scripts/import-rfcs.ts`. Descriptions are constructed from document IDs, status and publication dates; they are not fabricated article summaries. Six curated Zcash and privacy resources are added when seeding PostgreSQL.

Source: https://www.rfc-editor.org/rfc/rfc-index.xml
The corpus ships with the repository. Normal development, tests and demos never need an external search service or metadata download. Refresh deliberately with `pnpm exec tsx scripts/import-rfcs.ts`.
