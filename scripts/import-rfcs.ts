import { XMLParser } from "fast-xml-parser";
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
interface Entry {
  "doc-id": string;
  title: string;
  date: { month: string; year: number };
  "current-status": string;
}
const response = await fetch("https://www.rfc-editor.org/rfc/rfc-index.xml");
if (!response.ok) throw new Error("RFC metadata download failed");
const entries = (
  new XMLParser().parse(await response.text()) as {
    "rfc-index": { "rfc-entry": Entry[] };
  }
)["rfc-index"]["rfc-entry"];
const documents = entries
  .filter((e) => Number(e["doc-id"].slice(3)) >= 7000)
  .slice(-1800)
  .map((e) => ({
    id: e["doc-id"].toLowerCase(),
    title: e.title,
    url: `https://www.rfc-editor.org/rfc/rfc${Number(e["doc-id"].slice(3))}.html`,
    description: `${e["doc-id"]} · ${e["current-status"]} · Published ${e.date.month} ${e.date.year}. Technical specification in the RFC Series.`,
    category: /privacy|token|oblivious|anonym/i.test(e.title)
      ? "Privacy"
      : /security|crypt|tls|authenticat|certificate/i.test(e.title)
        ? "Security"
        : /http|web|transport/i.test(e.title)
          ? "Web & transport"
          : "Internet standards",
  }));
const path = fileURLToPath(
  new URL("../apps/demo-service/data/rfcs.json", import.meta.url),
);
await mkdir(
  fileURLToPath(new URL("../apps/demo-service/data/", import.meta.url)),
  { recursive: true },
);
await writeFile(path, JSON.stringify(documents, null, 2) + "\n");
console.log(`Imported ${documents.length} real RFC metadata entries.`);
