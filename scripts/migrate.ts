import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { connectDatabase } from "../apps/api/src/db/connection.js";
export async function migrate() {
  const { sql } = connectDatabase();
  try {
    await sql.unsafe(
      await readFile(
        fileURLToPath(
          new URL("../infra/migrations/001_initial.sql", import.meta.url),
        ),
        "utf8",
      ),
    );
  } finally {
    await sql.end();
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await migrate();
  console.log("Database schema ready.");
}
