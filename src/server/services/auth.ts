import "server-only";
import { and, count, eq, gt, isNull, ne } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/server/db";
import { authTokens, oauthAccounts, organizationMembers, organizations, users } from "@/server/db/schema";
import { hashPassword, verifyPassword, burnPasswordCheck } from "@/server/auth/password";
import { createSession, invalidateAllSessions } from "@/server/auth/session";
import { randomToken, sha256 } from "@/server/crypto";
import { env } from "@/server/env";
import { sendEmail, templates } from "@/server/email";
import { BadRequest, Conflict, Unauthorized } from "@/server/http/errors";
import { audit } from "./audit";
import type { signupSchema, profileSchema } from "@/lib/validation";

type Meta = { ip?: string | null; userAgent?: string | null };

export async function isUsernameTaken(username: string, exceptUserId?: string) {
  const [r] = await db
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.username, username), exceptUserId ? ne(users.id, exceptUserId) : undefined));
  return (r?.n ?? 0) > 0;
}

export async function uniqueUsername(base: string) {
  const clean =
    base
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "engineer";
  let candidate = clean.length >= 2 ? clean : `${clean}-eng`;
  for (let i = 2; await isUsernameTaken(candidate); i++) candidate = `${clean}-${i}`;
  return candidate;
}

async function issueToken(userId: string, purpose: "email_verification" | "password_reset", ttlMs: number) {
  const raw = randomToken(32);
  await db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(authTokens.userId, userId), eq(authTokens.purpose, purpose), isNull(authTokens.usedAt)));
  await db.insert(authTokens).values({ userId, purpose, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + ttlMs) });
  return raw;
}

async function consumeToken(raw: string, purpose: "email_verification" | "password_reset") {
  const [row] = await db
    .update(authTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(authTokens.tokenHash, sha256(raw)),
        eq(authTokens.purpose, purpose),
        isNull(authTokens.usedAt),
        gt(authTokens.expiresAt, new Date()),
      ),
    )
    .returning();
  return row ?? null;
}

export async function sendVerificationEmail(user: { id: string; email: string; displayName: string }) {
  const token = await issueToken(user.id, "email_verification", 24 * 3600_000);
  const url = `${env().APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
  await sendEmail({ to: user.email, ...templates.verify(user.displayName, url) });
}

export async function signup(input: z.infer<typeof signupSchema>, meta: Meta) {
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email));
  if (existing) throw Conflict("An account with this email already exists. Try signing in instead.");
  if (await isUsernameTaken(input.username)) throw Conflict("That username is taken");
  const [user] = await db
    .insert(users)
    .values({
      email: input.email,
      passwordHash: await hashPassword(input.password),
      username: input.username,
      displayName: input.displayName,
    })
    .returning();
  await sendVerificationEmail(user!);
  await audit("user.signup", { actorId: user!.id });
  const session = await createSession(user!.id, meta);
  return { user: user!, session };
}

export async function login(email: string, password: string, meta: Meta) {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user?.passwordHash) {
    await burnPasswordCheck(password);
    await audit("user.login_failed", { metadata: { email } });
    throw Unauthorized("Incorrect email or password");
  }
  if (!(await verifyPassword(password, user.passwordHash))) {
    await audit("user.login_failed", { actorId: user.id });
    throw Unauthorized("Incorrect email or password");
  }
  await audit("user.login", { actorId: user.id });
  return { user, session: await createSession(user.id, meta) };
}

export async function verifyEmail(token: string) {
  const row = await consumeToken(token, "email_verification");
  if (!row) throw BadRequest("This verification link is invalid or has expired");
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, row.userId));
  await audit("user.email_verified", { actorId: row.userId });
  return row.userId;
}

export async function requestPasswordReset(email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email));
  // Always behave identically so accounts cannot be enumerated.
  if (!user || user.isDemo) return;
  const token = await issueToken(user.id, "password_reset", 3600_000);
  const url = `${env().APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  await sendEmail({ to: user.email, ...templates.reset(user.displayName, url) });
  await audit("user.password_reset_requested", { actorId: user.id });
}

export async function resetPassword(token: string, password: string) {
  const row = await consumeToken(token, "password_reset");
  if (!row) throw BadRequest("This reset link is invalid or has expired");
  await db
    .update(users)
    .set({ passwordHash: await hashPassword(password), emailVerifiedAt: new Date() })
    .where(eq(users.id, row.userId));
  await invalidateAllSessions(row.userId);
  await audit("user.password_reset", { actorId: row.userId });
  return row.userId;
}

export async function changePassword(userId: string, current: string | undefined, next: string, keepToken?: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw Unauthorized();
  if (user.isDemo) throw BadRequest("The demo account's password cannot be changed");
  if (user.passwordHash) {
    if (!current || !(await verifyPassword(current, user.passwordHash))) throw BadRequest("Current password is incorrect");
  }
  await db.update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, userId));
  await invalidateAllSessions(userId, keepToken);
  await audit("user.password_changed", { actorId: userId });
}

export async function updateProfile(userId: string, input: z.infer<typeof profileSchema>) {
  if (await isUsernameTaken(input.username, userId)) throw Conflict("That username is taken");
  const [user] = await db.update(users).set(input).where(eq(users.id, userId)).returning();
  return user!;
}

/**
 * Deletes the account. Organizations the user solely owns are deleted when they
 * have no other members; otherwise ownership must be transferred first.
 */
export async function deleteAccount(userId: string, opts: { password?: string; confirm: string }) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw Unauthorized();
  if (user.isDemo) throw BadRequest("The demo account cannot be deleted");
  if (opts.confirm !== user.username) throw BadRequest("Type your username to confirm");
  if (user.passwordHash && (!opts.password || !(await verifyPassword(opts.password, user.passwordHash))))
    throw BadRequest("Password is incorrect");

  const owned = await db
    .select({ orgId: organizationMembers.organizationId, name: organizations.name })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(and(eq(organizationMembers.userId, userId), eq(organizationMembers.role, "owner")));
  const toDelete: string[] = [];
  for (const o of owned) {
    const [others] = await db
      .select({ n: count() })
      .from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, o.orgId), ne(organizationMembers.userId, userId)));
    const [otherOwners] = await db
      .select({ n: count() })
      .from(organizationMembers)
      .where(
        and(eq(organizationMembers.organizationId, o.orgId), eq(organizationMembers.role, "owner"), ne(organizationMembers.userId, userId)),
      );
    if ((others?.n ?? 0) === 0) toDelete.push(o.orgId);
    else if ((otherOwners?.n ?? 0) === 0)
      throw BadRequest(`Transfer ownership of ${o.name} to another member before deleting your account`);
  }
  await db.transaction(async (tx) => {
    for (const id of toDelete) await tx.delete(organizations).where(eq(organizations.id, id));
    await tx.delete(users).where(eq(users.id, userId));
  });
  await audit("user.deleted", { actorId: null, targetType: "user", targetId: userId, metadata: { username: user.username } });
}

export async function linkedAccounts(userId: string) {
  return db
    .select({ provider: oauthAccounts.provider, login: oauthAccounts.providerLogin, createdAt: oauthAccounts.createdAt })
    .from(oauthAccounts)
    .where(eq(oauthAccounts.userId, userId));
}

export async function unlinkAccount(userId: string, provider: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  const accounts = await linkedAccounts(userId);
  if (!user?.passwordHash && accounts.length <= 1)
    throw BadRequest("Set a password before disconnecting your only sign-in method");
  await db.delete(oauthAccounts).where(and(eq(oauthAccounts.userId, userId), eq(oauthAccounts.provider, provider)));
  await audit("user.oauth_unlinked", { actorId: userId, metadata: { provider } });
}
