import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { rm } from "node:fs/promises";

/** Recreate the test database schema from migrations before the suite runs. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgres://forgebase:forgebase@localhost:5432/forgebase_test";
  if (url.startsWith("pglite:")) {
    // Embedded PostgreSQL (desktop build): fresh data directory, then migrate.
    const dir = url.slice("pglite:".length);
    await rm(dir, { recursive: true, force: true });
    const { PGlite } = await import("@electric-sql/pglite");
    const { pg_trgm } = await import("@electric-sql/pglite/contrib/pg_trgm");
    const { drizzle: drizzleLite } = await import("drizzle-orm/pglite");
    const { migrate: migrateLite } = await import("drizzle-orm/pglite/migrator");
    const client = new PGlite(dir, { extensions: { pg_trgm } });
    await migrateLite(drizzleLite(client), { migrationsFolder: "drizzle" });
    await client.close();
    await rm(".storage-test", { recursive: true, force: true });
    return;
  }
  const sql = postgres(url, { max: 1, onnotice: () => {} });
  await sql.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
  await sql.end();
  await rm(".storage-test", { recursive: true, force: true });
}
