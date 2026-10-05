import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { rm } from "node:fs/promises";

/** Recreate the test database schema from migrations before the suite runs. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://forgebase:forgebase@localhost:5432/forgebase_test";
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await sql.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
  await sql.end();
  await rm(".storage-test", { recursive: true, force: true });
}
