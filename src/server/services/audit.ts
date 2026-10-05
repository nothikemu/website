import "server-only";
import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "@/server/db";
import { auditLogs, users } from "@/server/db/schema";
import { currentContext } from "@/server/observability/context";

/**
 * Append-only security audit trail (auth events, permission & membership
 * changes, deletions, integration/webhook changes). Distinct from the
 * human-facing activity feed.
 */
export async function audit(
  action: string,
  input: { actorId?: string | null; organizationId?: string | null; targetType?: string; targetId?: string; metadata?: Record<string, unknown> } = {},
) {
  const ctx = currentContext();
  await db.insert(auditLogs).values({
    action,
    actorId: input.actorId ?? ctx?.userId ?? null,
    organizationId: input.organizationId ?? null,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    ipAddress: ctx?.ip ?? null,
    userAgent: ctx?.userAgent?.slice(0, 400) ?? null,
    requestId: ctx?.requestId ?? null,
    metadata: input.metadata ?? {},
  });
}

export async function listAuditLog(organizationId: string, opts: { before?: Date; limit?: number } = {}) {
  return db
    .select({
      log: auditLogs,
      actor: { id: users.id, username: users.username, displayName: users.displayName },
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.actorId))
    .where(and(eq(auditLogs.organizationId, organizationId), opts.before ? lt(auditLogs.createdAt, opts.before) : undefined))
    .orderBy(desc(auditLogs.createdAt))
    .limit(Math.min(opts.limit ?? 50, 200));
}
