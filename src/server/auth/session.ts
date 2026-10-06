import "server-only";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "@/server/db";
import { sessions, users, apiTokens } from "@/server/db/schema";
import { randomToken, sha256 } from "@/server/crypto";
import { secureCookies } from "@/server/env";

export const SESSION_COOKIE = "fb_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RENEW_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000;

export type SessionUser = typeof users.$inferSelect;

export type CookieSpec = {
  name: string;
  value: string;
  options: {
    httpOnly: boolean;
    secure: boolean;
    sameSite: "lax";
    path: string;
    expires: Date;
  };
};

export function sessionCookie(token: string, expires: Date): CookieSpec {
  return {
    name: SESSION_COOKIE,
    value: token,
    options: { httpOnly: true, secure: secureCookies(), sameSite: "lax", path: "/", expires },
  };
}

export function clearedSessionCookie(): CookieSpec {
  return sessionCookie("", new Date(0));
}

export async function createSession(userId: string, meta: { ip?: string | null; userAgent?: string | null } = {}) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    id: sha256(token),
    userId,
    expiresAt,
    ipAddress: meta.ip ?? null,
    userAgent: meta.userAgent?.slice(0, 400) ?? null,
  });
  return { token, expiresAt };
}

/** Validates a raw session token. Returns null if missing/expired. Slides expiry when close to the end. */
export async function validateSessionToken(token: string | undefined | null) {
  if (!token || token.length > 200) return null;
  const sid = sha256(token);
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sid), gt(sessions.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;
  const now = Date.now();
  if (row.session.expiresAt.getTime() - now < RENEW_THRESHOLD_MS || now - row.session.lastSeenAt.getTime() > 3600_000) {
    const expiresAt = new Date(now + SESSION_TTL_MS);
    await db.update(sessions).set({ expiresAt, lastSeenAt: new Date() }).where(eq(sessions.id, sid));
    row.session.expiresAt = expiresAt;
  }
  return row;
}

export async function invalidateSession(token: string) {
  await db.delete(sessions).where(eq(sessions.id, sha256(token)));
}

export async function invalidateAllSessions(userId: string, exceptToken?: string) {
  const all = await db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, userId));
  const keep = exceptToken ? sha256(exceptToken) : null;
  for (const s of all) if (s.id !== keep) await db.delete(sessions).where(eq(sessions.id, s.id));
}

export async function purgeExpiredSessions() {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

/** Personal access tokens: "fbp_<random>". Stored hashed; shown once on creation. */
export async function createApiToken(userId: string, name: string, expiresAt: Date | null) {
  const raw = `fbp_${randomToken(30)}`;
  const [row] = await db
    .insert(apiTokens)
    .values({ userId, name, tokenHash: sha256(raw), prefix: raw.slice(0, 10), expiresAt })
    .returning();
  return { token: raw, record: row! };
}

export async function validateApiToken(raw: string) {
  if (!raw.startsWith("fbp_") || raw.length > 100) return null;
  const [row] = await db
    .select({ token: apiTokens, user: users })
    .from(apiTokens)
    .innerJoin(users, eq(users.id, apiTokens.userId))
    .where(eq(apiTokens.tokenHash, sha256(raw)))
    .limit(1);
  if (!row) return null;
  if (row.token.expiresAt && row.token.expiresAt < new Date()) return null;
  await db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, row.token.id));
  return row.user;
}
