import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { storage } from "@/server/storage";

/** Liveness/readiness probe. Reports dependency status without leaking configuration. */
export async function GET() {
  const started = Date.now();
  const checks: Record<string, "ok" | "error"> = {};
  try {
    await db.execute(sql`select 1`);
    checks.database = "ok";
  } catch {
    checks.database = "error";
  }
  checks.storage = storage().name ? "ok" : "error";
  const ok = Object.values(checks).every((v) => v === "ok");
  return Response.json(
    { status: ok ? "ok" : "degraded", checks, latencyMs: Date.now() - started, version: process.env.npm_package_version ?? "0.1.0" },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
