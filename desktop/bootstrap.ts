/**
 * Desktop bootstrap — bundled to bootstrap.cjs by desktop/build.sh.
 * Runs before the web server starts: applies migrations to the embedded
 * database and, on first run, loads the demo workspace.
 */
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

export async function prepareDatabase(dir: string, migrationsFolder: string) {
  const client = new PGlite(dir, { extensions: { pg_trgm } });
  await migrate(drizzle(client), { migrationsFolder });
  await client.close();
}

export async function loadDemo() {
  // A personal, single-user copy: the demo is the intended first-run content.
  process.env.SEED_ALLOW_PRODUCTION = "1";
  const { seedDemo } = await import("../scripts/seed");
  const { closeDb } = await import("@/server/db");
  try {
    await seedDemo();
  } finally {
    await closeDb();
  }
}
