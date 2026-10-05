import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/server/db";
import {
  changes,
  decisions,
  issues,
  links,
  notebookEntries,
  organizationMembers,
  projectCounters,
  projectMembers,
  requirements,
  tasks,
  tests,
  users,
} from "@/server/db/schema";
import { type ProjectAccess } from "@/server/authz";
import { BadRequest } from "@/server/http/errors";
import { parseRefs, type RefKind } from "@/lib/refs";
import type { EntityType } from "@/server/events/types";

export const userSummary = {
  id: users.id,
  username: users.username,
  displayName: users.displayName,
  avatarUrl: users.avatarUrl,
};
export type UserSummary = { id: string; username: string; displayName: string; avatarUrl: string | null };

/** Atomically allocate the next per-project number for a kind (REQ, TEST, …). */
export async function nextNumber(tx: DbOrTx, projectId: string, kind: string): Promise<number> {
  const rows = await tx.execute<{ value: number }>(sql`
    insert into project_counters (project_id, kind, value) values (${projectId}, ${kind}, 1)
    on conflict (project_id, kind) do update set value = project_counters.value + 1
    returning value`);
  return Number(rows[0]!.value);
}

export async function setCounterAtLeast(tx: DbOrTx, projectId: string, kind: string, value: number) {
  await tx
    .insert(projectCounters)
    .values({ projectId, kind, value })
    .onConflictDoUpdate({
      target: [projectCounters.projectId, projectCounters.kind],
      set: { value: sql`greatest(${projectCounters.value}, ${value})` },
    });
}

/** Users who can see the project (for assignee pickers & validation). */
export async function projectPeople(access: ProjectAccess): Promise<(UserSummary & { role: string })[]> {
  const { project } = access;
  const rows = await db
    .select({ ...userSummary, orgRole: organizationMembers.role, projectRole: projectMembers.role })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .leftJoin(projectMembers, and(eq(projectMembers.userId, users.id), eq(projectMembers.projectId, project.id)))
    .where(eq(organizationMembers.organizationId, project.organizationId))
    .orderBy(users.displayName);
  return rows
    .filter((r) => project.visibility === "organization" || r.projectRole || r.orgRole === "owner" || r.orgRole === "admin")
    .map((r) => ({
      id: r.id,
      username: r.username,
      displayName: r.displayName,
      avatarUrl: r.avatarUrl,
      role: r.orgRole === "owner" || r.orgRole === "admin" ? "admin" : (r.projectRole ?? (r.orgRole === "engineer" ? "engineer" : "viewer")),
    }));
}

/** Rejects user ids that do not have access to the project (prevents cross-org assignment). */
export async function assertProjectUser(access: ProjectAccess, userId: string | null | undefined) {
  if (!userId) return;
  const people = await projectPeople(access);
  if (!people.some((p) => p.id === userId)) throw BadRequest("Assignee is not a member of this project");
}

const REF_TABLES = {
  requirement: requirements,
  test: tests,
  decision: decisions,
  change: changes,
  issue: issues,
  task: tasks,
  notebook_entry: notebookEntries,
} as const;

/** Resolve "REQ-001"-style references within one project to entity ids. */
export async function resolveRefs(projectId: string, refs: { kind: RefKind; number: number }[], tx: DbOrTx = db) {
  const out: { kind: RefKind; number: number; id: string; title: string }[] = [];
  const byKind = new Map<RefKind, number[]>();
  for (const r of refs) byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), r.number]);
  for (const [kind, numbers] of byKind) {
    const table = REF_TABLES[kind];
    const titleCol = "title" in table ? table.title : (table as typeof tests).name;
    const rows = await tx
      .select({ id: table.id, number: table.number, title: titleCol })
      .from(table)
      .where(and(eq(table.projectId, projectId), inArray(table.number, numbers)));
    for (const r of rows) out.push({ kind, number: r.number, id: r.id, title: r.title });
  }
  return out;
}

export async function addLink(
  tx: DbOrTx,
  input: {
    projectId: string;
    sourceType: EntityType;
    sourceId: string;
    targetType: EntityType;
    targetId: string;
    relation?: string;
    createdBy?: string | null;
  },
) {
  if (input.sourceType === input.targetType && input.sourceId === input.targetId) return;
  await tx
    .insert(links)
    .values({ ...input, relation: input.relation ?? "references", createdBy: input.createdBy ?? null })
    .onConflictDoNothing();
}

/** Create "references" links for every REF mentioned in free text. */
export async function linkMentions(
  tx: DbOrTx,
  projectId: string,
  source: { type: EntityType; id: string },
  text: string | null | undefined,
  actorId: string | null,
) {
  const refs = parseRefs(text);
  if (!refs.length) return [];
  const resolved = await resolveRefs(projectId, refs, tx);
  for (const r of resolved) {
    await addLink(tx, {
      projectId,
      sourceType: source.type,
      sourceId: source.id,
      targetType: r.kind as EntityType,
      targetId: r.id,
      relation: "references",
      createdBy: actorId,
    });
  }
  return resolved;
}

export function projectUrl(slug: string, path = "") {
  return `/project/${slug}${path}`;
}

/** Find @username mentions limited to people who can see the project. */
export async function resolveMentions(access: ProjectAccess, text: string) {
  const names = [...new Set([...text.matchAll(/(?:^|[^\w@])@([a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?)\b/gi)].map((m) => m[1]!.toLowerCase()))];
  if (!names.length) return [];
  const people = await projectPeople(access);
  return people.filter((p) => names.includes(p.username));
}

export function paginateDate(cursor?: string) {
  if (!cursor) return undefined;
  const d = new Date(cursor);
  return Number.isNaN(d.getTime()) ? undefined : d;
}
