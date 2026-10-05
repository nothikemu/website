import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { TooManyRequests } from "@/server/http/errors";

/**
 * Fixed-window rate limiter backed by PostgreSQL, so limits hold across
 * serverless instances without extra infrastructure. Swap for Redis/Upstash by
 * re-implementing `hit` if traffic warrants it.
 */
export type RateRule = { limit: number; windowSec: number };

export const RATE_RULES = {
  login: { limit: 10, windowSec: 15 * 60 },
  signup: { limit: 5, windowSec: 60 * 60 },
  passwordReset: { limit: 5, windowSec: 60 * 60 },
  verifyEmail: { limit: 5, windowSec: 60 * 60 },
  api: { limit: 600, windowSec: 60 },
  upload: { limit: 120, windowSec: 60 },
  ai: { limit: 20, windowSec: 60 },
  webhook: { limit: 300, windowSec: 60 },
  invite: { limit: 30, windowSec: 60 * 60 },
} satisfies Record<string, RateRule>;

export async function hit(key: string, rule: RateRule): Promise<{ allowed: boolean; remaining: number; retryAfter: number }> {
  if (process.env.FORGEBASE_DISABLE_RATE_LIMIT === "1") return { allowed: true, remaining: rule.limit, retryAfter: 0 };
  const rows = await db.execute<{ count: number; reset_at: Date }>(sql`
    insert into rate_limits (key, count, reset_at)
    values (${key}, 1, now() + make_interval(secs => ${rule.windowSec}))
    on conflict (key) do update set
      count = case when rate_limits.reset_at < now() then 1 else rate_limits.count + 1 end,
      reset_at = case when rate_limits.reset_at < now() then now() + make_interval(secs => ${rule.windowSec}) else rate_limits.reset_at end
    returning count, reset_at
  `);
  const row = rows[0]!;
  const retryAfter = Math.max(0, Math.ceil((new Date(row.reset_at).getTime() - Date.now()) / 1000));
  return { allowed: row.count <= rule.limit, remaining: Math.max(0, rule.limit - row.count), retryAfter };
}

export async function enforce(key: string, rule: RateRule) {
  const r = await hit(key, rule);
  if (!r.allowed) throw TooManyRequests(r.retryAfter);
}
