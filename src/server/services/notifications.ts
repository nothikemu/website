import "server-only";
import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { notificationPreferences, notifications, users } from "@/server/db/schema";
import { NOTIFICATION_TYPES } from "@/lib/notification-types";
import { sendEmail, templates } from "@/server/email";
import { env } from "@/server/env";

export async function getPreferences(userId: string) {
  const rows = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId));
  const map = new Map(rows.map((r) => [r.type, r]));
  return NOTIFICATION_TYPES.map((t) => ({
    type: t.type,
    label: t.label,
    inApp: map.get(t.type)?.inApp ?? true,
    email: map.get(t.type)?.email ?? t.defaultEmail,
  }));
}

export async function updatePreferences(userId: string, prefs: { type: string; inApp: boolean; email: boolean }[]) {
  const valid = new Set<string>(NOTIFICATION_TYPES.map((t) => t.type));
  for (const p of prefs) {
    if (!valid.has(p.type)) continue;
    await db
      .insert(notificationPreferences)
      .values({ userId, type: p.type, inApp: p.inApp, email: p.email })
      .onConflictDoUpdate({
        target: [notificationPreferences.userId, notificationPreferences.type],
        set: { inApp: p.inApp, email: p.email },
      });
  }
  return getPreferences(userId);
}

export async function deliver(input: {
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  url?: string | null;
  actorId?: string | null;
  projectId?: string | null;
  organizationId?: string | null;
}) {
  const prefs = await getPreferences(input.userId);
  const pref = prefs.find((p) => p.type === input.type) ?? { inApp: true, email: false };
  if (pref.inApp) {
    await db.insert(notifications).values({
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      url: input.url ?? null,
      actorId: input.actorId ?? null,
      projectId: input.projectId ?? null,
      organizationId: input.organizationId ?? null,
    });
  }
  if (pref.email) {
    const [u] = await db.select({ email: users.email, isDemo: users.isDemo }).from(users).where(eq(users.id, input.userId));
    if (u && !u.isDemo) {
      const url = new URL(input.url ?? "/dashboard", env().APP_URL).toString();
      await sendEmail({ to: u.email, ...templates.notification(input.title, input.body, url) });
    }
  }
}

export async function listNotifications(userId: string, opts: { unreadOnly?: boolean; limit?: number; before?: Date } = {}) {
  const rows = await db.query.notifications.findMany({
    where: and(eq(notifications.userId, userId), opts.unreadOnly ? isNull(notifications.readAt) : undefined),
    orderBy: desc(notifications.createdAt),
    limit: Math.min(opts.limit ?? 50, 100),
  });
  const actorIds = [...new Set(rows.map((r) => r.actorId).filter(Boolean))] as string[];
  const actors = actorIds.length
    ? await db
        .select({ id: users.id, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl })
        .from(users)
        .where(inArray(users.id, actorIds))
    : [];
  const byId = new Map(actors.map((a) => [a.id, a]));
  return rows.map((r) => ({ ...r, actor: r.actorId ? (byId.get(r.actorId) ?? null) : null }));
}

export async function unreadCount(userId: string) {
  const [r] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return r?.n ?? 0;
}

export async function markRead(userId: string, ids: string[] | "all") {
  const where =
    ids === "all"
      ? and(eq(notifications.userId, userId), isNull(notifications.readAt))
      : and(eq(notifications.userId, userId), inArray(notifications.id, ids));
  await db.update(notifications).set({ readAt: new Date() }).where(where);
}
