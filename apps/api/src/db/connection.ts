import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";
export function connectDatabase(
  url = process.env.DATABASE_URL ??
    "postgres://blindpass:blindpass-local-only@localhost:5432/blindpass",
  schemaName = "public",
) {
  const sql = postgres(url, {
    max: 25,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
    connection: {
      search_path: schemaName,
      statement_timeout: 30000,
      idle_in_transaction_session_timeout: 30000,
    },
  });
  return { sql, db: drizzle(sql, { schema }) };
}
export type Database = ReturnType<typeof connectDatabase>;
