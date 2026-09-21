import { readFile } from "node:fs/promises";
import type { Sql, TransactionSql } from "postgres";
import type {
  SearchResult,
  SearchResponse,
} from "../../../packages/shared/src/index.js";
const curated: SearchResult[] = [
  {
    id: "zcash-orchard",
    title: "Orchard: shielded transactions for Zcash",
    url: "https://z.cash/learn/what-is-orchard/",
    description:
      "Orchard is the Zcash shielded protocol introduced with Network Upgrade 5. Explore payment privacy, shielded pools, and the separation between blockchain visibility and service metadata.",
    category: "Zcash",
  },
  {
    id: "zip-316",
    title: "Unified Addresses and Unified Viewing Keys",
    url: "https://zips.z.cash/zip-0316",
    description:
      "ZIP 316 specifies Unified Addresses, Orchard and Sapling receivers, and unified incoming viewing keys. A receiver must be decoded and validated; its prefix alone is not proof of Orchard support.",
    category: "Zcash",
  },
  {
    id: "zip-321",
    title: "Zcash payment request URIs",
    url: "https://zips.z.cash/zip-0321",
    description:
      "ZIP 321 defines zcash: payment URIs. BlindPass uses a fixed denomination and an empty memo; the scanner derives a different payment address for each invoice.",
    category: "Zcash",
  },
  {
    id: "privacy-pass",
    title: "Privacy Pass: privacy-preserving authorization",
    url: "https://privacypass.github.io/",
    description:
      "Privacy Pass separates token issuance from presentation. BlindPass uses the standardized privately verifiable VOPRF protocol to remove the direct cryptographic payment-to-redemption link.",
    category: "Privacy",
  },
  {
    id: "tor",
    title: "How Tor protects network privacy",
    url: "https://support.torproject.org/about/what-is-tor/",
    description:
      "Tor routes connections through relays to reduce source network exposure. Timing, endpoint behavior, compromised devices and query content remain relevant to privacy.",
    category: "Privacy",
  },
  {
    id: "cloudflare-pp",
    title: "Cloudflare Privacy Pass TypeScript implementation",
    url: "https://github.com/cloudflare/privacypass-ts",
    description:
      "Implementation of RFC 9578 token protocols, including privately verifiable P-384 and SHA-384 VOPRF tokens, proof verification, blinding and finalization.",
    category: "Developer tools",
  },
];
export async function seedSearch(sql: Sql) {
  const [row] = await sql`SELECT count(*)::int AS n FROM search_documents`;
  if (row.n >= 1800) return;
  const data = JSON.parse(
    await readFile(new URL("../data/rfcs.json", import.meta.url), "utf8"),
  ) as SearchResult[];
  for (let i = 0; i < data.length + curated.length; i += 200) {
    const records = [...curated, ...data].slice(i, i + 200);
    if (records.length)
      await sql`INSERT INTO search_documents ${sql(records, ["id", "title", "url", "description", "category"])} ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description`;
  }
}
export async function search(
  sql: Sql | TransactionSql,
  query: string,
): Promise<SearchResponse> {
  const rows = await sql<
    (SearchResult & { total: number })[]
  >`SELECT id,title,url,description,category,count(*) OVER()::int AS total FROM search_documents WHERE search_vector @@ websearch_to_tsquery('english',${query}) ORDER BY ts_rank(search_vector,websearch_to_tsquery('english',${query})) DESC,id LIMIT 20`;
  return {
    query,
    results: rows.map(({ id, title, url, description, category }) => ({
      id,
      title,
      url,
      description,
      category,
    })),
    total: rows[0]?.total ?? 0,
    creditConsumed: true,
  };
}
