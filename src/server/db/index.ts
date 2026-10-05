import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/server/env";
import * as schema from "./schema";

export type Database = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbOrTx = Database | Tx;

const globalForDb = globalThis as unknown as { __fbSql?: postgres.Sql; __fbDb?: Database };

function create(): Database {
  const url = env().DATABASE_URL;
  const sql =
    globalForDb.__fbSql ??
    postgres(url, {
      max: env().NODE_ENV === "production" ? 10 : 5,
      idle_timeout: 20,
      // Transaction-mode poolers (Supabase :6543, PgBouncer) do not support prepared statements.
      prepare: !/:6543\//.test(url) && !url.includes("pgbouncer=true"),
      onnotice: () => {},
    });
  globalForDb.__fbSql = sql;
  return drizzle(sql, { schema, casing: "snake_case" });
}

export const db: Database = globalForDb.__fbDb ?? create();
if (env().NODE_ENV !== "production") globalForDb.__fbDb = db;

export async function closeDb() {
  await globalForDb.__fbSql?.end({ timeout: 5 });
  globalForDb.__fbSql = undefined;
  globalForDb.__fbDb = undefined;
}

export { schema };
