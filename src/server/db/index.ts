import "server-only";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/server/env";
import * as schema from "./schema";

/**
 * Database client. Two drivers share one API:
 *  - PostgreSQL over the network (postgres-js) — servers, Supabase, CI.
 *  - Embedded PostgreSQL (PGlite) when DATABASE_URL is `pglite:<directory>` —
 *    used by the portable desktop build so no database install is needed.
 */
export type Database = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbOrTx = Database | Tx;

type Closable = { close: () => Promise<void> };
const globalForDb = globalThis as unknown as { __fbSql?: postgres.Sql; __fbLite?: Closable; __fbDb?: Database };

/**
 * PGlite's `execute` resolves to `{ rows }` while postgres-js resolves to the
 * row array itself. Services are written against the array form, so wrap
 * PGlite handles (and the transaction handles they create) to match.
 */
function normalizeExecute<T extends object>(target: T): T {
  return new Proxy(target, {
    get(obj, prop, receiver) {
      const value = Reflect.get(obj, prop, receiver);
      if (prop === "execute" && typeof value === "function") {
        return async (...args: unknown[]) => {
          const res = await value.apply(obj, args);
          return res && typeof res === "object" && "rows" in res ? (res as { rows: unknown[] }).rows : res;
        };
      }
      if (prop === "transaction" && typeof value === "function") {
        return (fn: (tx: unknown) => unknown, cfg?: unknown) =>
          value.call(obj, (tx: object) => fn(normalizeExecute(tx)), cfg);
      }
      return typeof value === "function" ? value.bind(obj) : value;
    },
  });
}

function createPglite(dir: string): Database {
  // Loaded lazily so server deployments never touch the WASM bundle.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PGlite } = require("@electric-sql/pglite") as typeof import("@electric-sql/pglite");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { pg_trgm } = require("@electric-sql/pglite/contrib/pg_trgm") as typeof import("@electric-sql/pglite/contrib/pg_trgm");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { drizzle: drizzleLite } = require("drizzle-orm/pglite") as typeof import("drizzle-orm/pglite");
  const client = new PGlite(dir, { extensions: { pg_trgm } });
  globalForDb.__fbLite = client;
  return normalizeExecute(drizzleLite(client, { schema, casing: "snake_case" })) as unknown as Database;
}

function create(): Database {
  const url = env().DATABASE_URL;
  if (url.startsWith("pglite:")) return createPglite(url.slice("pglite:".length) || "memory://");
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
if (env().NODE_ENV !== "production" || env().DATABASE_URL.startsWith("pglite:")) globalForDb.__fbDb = db;

export async function closeDb() {
  await globalForDb.__fbSql?.end({ timeout: 5 });
  await globalForDb.__fbLite?.close();
  globalForDb.__fbSql = undefined;
  globalForDb.__fbLite = undefined;
  globalForDb.__fbDb = undefined;
}

export { schema };
