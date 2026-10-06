import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/server/db";
import { issues, milestones, projectMembers, tasks } from "@/server/db/schema";
import { requireProject, type Actor, type ProjectAccess } from "@/server/authz";
import { NotFound } from "@/server/http/errors";
import { emit } from "@/server/events";
import type { createMilestoneSchema, updateMilestoneSchema } from "@/lib/validation";
import { nextNumber } from "./shared";

/** Progress is derived only from linked tasks (done / total) — never entered manually. */
export async function milestoneStats(projectId: string) {
  const rows = await db
    .select({
      milestone: milestones,
      total: sql<number>`(select count(*)::int from tasks t where t.milestone_id = "milestones"."id")`,
      done: sql<number>`(select count(*)::int from tasks t where t.milestone_id = "milestones"."id" and t.status = 'done')`,
      openIssues: sql<number>`(select count(*)::int from issues i where i.milestone_id = "milestones"."id" and i.status in ('open','in_progress','blocked'))`,
    })
    .from(milestones)
    .where(eq(milestones.projectId, projectId))
    .orderBy(asc(milestones.number));
  return rows.map((r) => ({ ...r.milestone, total: r.total, done: r.done, openIssues: r.openIssues, progress: r.total ? r.done / r.total : 0 }));
}

export async function listMilestones(actor: Actor, ref: string) {
  const access = await requireProject(actor, ref, "project.read");
  return { access, milestones: await milestoneStats(access.project.id) };
}

export async function createMilestone(actor: Actor, ref: string, input: z.infer<typeof createMilestoneSchema>) {
  const access = await requireProject(actor, ref, "project.write");
  const m = await db.transaction(async (tx) => {
    const number = await nextNumber(tx, access.project.id, "milestone");
    const [row] = await tx
      .insert(milestones)
      .values({ projectId: access.project.id, number, title: input.title, description: input.description, dueDate: input.dueDate ?? null, createdBy: actor.id })
      .returning();
    return row!;
  });
  await emit({
    type: "milestone.created",
    actorId: actor.id,
    organizationId: access.org.id,
    projectId: access.project.id,
    target: { type: "milestone", id: m.id, label: `M${m.number}`, title: m.title, url: `/project/${access.project.slug}/milestones` },
  });
  return m;
}

export async function updateMilestone(actor: Actor, ref: string, id: string, input: z.infer<typeof updateMilestoneSchema>) {
  const access = await requireProject(actor, ref, "project.write");
  const [before] = await db.select().from(milestones).where(and(eq(milestones.id, id), eq(milestones.projectId, access.project.id)));
  if (!before) throw NotFound("Milestone");
  const [m] = await db
    .update(milestones)
    .set({ ...input, ...(input.status && input.status !== before.status ? { closedAt: input.status === "closed" ? new Date() : null } : {}) })
    .where(eq(milestones.id, id))
    .returning();
  if (input.status === "closed" && before.status !== "closed") await announceCompleted(access, m!, actor.id);
  return m!;
}

export async function deleteMilestone(actor: Actor, ref: string, id: string) {
  const access = await requireProject(actor, ref, "project.admin");
  await db.transaction(async (tx) => {
    await tx.update(tasks).set({ milestoneId: null }).where(eq(tasks.milestoneId, id));
    await tx.update(issues).set({ milestoneId: null }).where(eq(issues.milestoneId, id));
    const r = await tx.delete(milestones).where(and(eq(milestones.id, id), eq(milestones.projectId, access.project.id))).returning();
    if (!r.length) throw NotFound("Milestone");
  });
}

async function announceCompleted(access: ProjectAccess, m: typeof milestones.$inferSelect, actorId: string) {
  const members = await db.select({ userId: projectMembers.userId }).from(projectMembers).where(eq(projectMembers.projectId, access.project.id));
  await emit({
    type: "milestone.completed",
    actorId,
    organizationId: access.org.id,
    projectId: access.project.id,
    target: { type: "milestone", id: m.id, label: `M${m.number}`, title: m.title, url: `/project/${access.project.slug}/milestones` },
    notify: members.map((u) => ({ userId: u.userId, type: "milestone.completed", title: `M${m.number} — ${m.title} completed`, body: access.project.name })),
  });
}

/** When the last task in an open milestone is done, close it automatically. */
export async function checkMilestoneCompletion(access: ProjectAccess, milestoneId: string, actorId: string) {
  const [m] = await db.select().from(milestones).where(eq(milestones.id, milestoneId));
  if (!m || m.status === "closed") return;
  const [r] = await db
    .select({ total: sql<number>`count(*)::int`, done: sql<number>`count(*) filter (where ${tasks.status} = 'done')::int` })
    .from(tasks)
    .where(eq(tasks.milestoneId, milestoneId));
  if (r && r.total > 0 && r.total === r.done) {
    const [closed] = await db.update(milestones).set({ status: "closed", closedAt: new Date() }).where(eq(milestones.id, milestoneId)).returning();
    await announceCompleted(access, closed!, actorId);
  }
}
