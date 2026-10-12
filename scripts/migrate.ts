import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import type { Sql } from "postgres";
import { connectDatabase } from "../apps/api/src/db/connection.js";
export async function applyMigrations(sql: Sql) {
  const directory = new URL("../infra/migrations/", import.meta.url);
  const files = (await readdir(directory))
    .filter((name) => /^\d+_.*\.sql$/.test(name))
    .sort();
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(724862093)`;
    await tx`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`;
    for (const name of files) {
      const source = await readFile(new URL(name, directory), "utf8");
      const checksum = createHash("sha256").update(source).digest("hex");
      const [existing] =
        await tx`SELECT checksum FROM schema_migrations WHERE name=${name}`;
      if (existing) {
        if (existing.checksum !== checksum)
          throw new Error(
            `Applied migration changed: ${name}. Add a new migration instead.`,
          );
        continue;
      }
      await tx.unsafe(source);
      await tx`INSERT INTO schema_migrations(name,checksum) VALUES(${name},${checksum})`;
    }
  });
}
export async function migrate() {
  const { sql } = connectDatabase();
  try {
    await applyMigrations(sql);
  } finally {
    await sql.end();
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await migrate();
  console.log("Database schema ready.");
}
