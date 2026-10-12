import { applyMigrations } from "../scripts/migrate.js";
import { randomUUID } from "node:crypto";
import { connectDatabase } from "../apps/api/src/db/connection.js";
export async function testDatabase() {
  const admin = connectDatabase();
  const schema = `test_${randomUUID().replaceAll("-", "")}`;
  await admin.sql`CREATE SCHEMA ${admin.sql(schema)}`;
  const database = connectDatabase(undefined, schema);
  await applyMigrations(database.sql);
  return {
    ...database,
    async cleanup() {
      await database.sql.end();
      await admin.sql`DROP SCHEMA ${admin.sql(schema)} CASCADE`;
      await admin.sql.end();
    },
  };
}
