import "server-only";
import { and, desc, eq, inArray, lt } from "drizzle-orm";
import { db } from "@/server/db";
import { activities, projects, users } from "@/server/db/schema";
import { accessibleProjectIds, requireOrg, requireProject, type Actor } from "@/server/authz";
import { userSummary } from "./shared";

export type ActivityItem = Awaited<ReturnType<typeof projectActivity>>["items"][number];

function cursorDate(cursor?: string | null) {
  if (!cursor) return undefined;
  const d = new Date(cursor);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

async function query(where: ReturnType<typeof and>, limit: number) {
  const rows = await db
    .select({ a: activities, actor: userSummary, project: { slug: projects.slug, name: projects.name } })
    .from(activities)
    .leftJoin(users, eq(users.id, activities.actorId))
    .leftJoin(projects, eq(projects.id, activities.projectId))
    .where(where)
    .orderBy(desc(activities.createdAt))
    .limit(limit + 1);
  const items = rows.slice(0, limit).map((r) => ({
    ...r.a,
    actor: r.actor?.id ? r.actor : null,
    project: r.project?.slug ? r.project : null,
  }));
  return { items, nextCursor: rows.length > limit ? items[items.length - 1]!.createdAt.toISOString() : null };
}

export async function projectActivity(actor: Actor, ref: string, opts: { cursor?: string | null; limit?: number; verbPrefix?: string } = {}) {
  const access = await requireProject(actor, ref, "project.read");
  const before = cursorDate(opts.cursor);
  return query(and(eq(activities.projectId, access.project.id), before ? lt(activities.createdAt, before) : undefined), Math.min(opts.limit ?? 40, 100));
}

export async function orgActivity(actor: Actor, ref: string, opts: { cursor?: string | null; limit?: number } = {}) {
  const { org } = await requireOrg(actor, ref, "org.read");
  const ids = await accessibleProjectIds(actor.id, [org.id]);
  const before = cursorDate(opts.cursor);
  return query(
    and(eq(activities.organizationId, org.id), ids.length ? inArray(activities.projectId, ids) : eq(activities.projectId, "00000000-0000-0000-0000-000000000000"), before ? lt(activities.createdAt, before) : undefined),
    Math.min(opts.limit ?? 40, 100),
  );
}

export async function feedForUser(actor: Actor, opts: { cursor?: string | null; limit?: number } = {}) {
  const ids = await accessibleProjectIds(actor.id);
  if (!ids.length) return { items: [], nextCursor: null };
  const before = cursorDate(opts.cursor);
  return query(and(inArray(activities.projectId, ids), before ? lt(activities.createdAt, before) : undefined), Math.min(opts.limit ?? 30, 100));
}
