import "server-only";
import { and, asc, desc, eq, ilike, inArray, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { z } from "zod";
import { db, type DbOrTx } from "@/server/db";
import { comments, milestones, taskDependencies, tasks, users } from "@/server/db/schema";
import { requireProject, type Actor, type ProjectAccess } from "@/server/authz";
import { BadRequest, NotFound } from "@/server/http/errors";
import { emit } from "@/server/events";
import { indexDocument, removeDocument } from "@/server/search";
import { formatRef } from "@/lib/refs";
import type { createTaskSchema, updateTaskSchema } from "@/lib/validation";
import { labelsForTasks, setTaskLabels } from "./labels";
import { linksFor, unlinkAll } from "./links";
import { assertProjectUser, linkMentions, nextNumber, userSummary } from "./shared";
import { checkMilestoneCompletion } from "./milestones";

export async function listTasks(actor: Actor, ref: string, f: { assignee?: string; milestone?: string; q?: string; includeSubtasks?: boolean } = {}) {
  const access = await requireProject(actor, ref, "project.read");
  const assignee = alias(users, "assignee");
  const conds = [eq(tasks.projectId, access.project.id)];
  if (f.assignee === "none") conds.push(sql`${tasks.assigneeId} is null`);
  else if (f.assignee) conds.push(eq(assignee.username, f.assignee));
  if (f.milestone) conds.push(eq(milestones.number, Number(f.milestone)));
  if (f.q) conds.push(ilike(tasks.title, `%${f.q}%`));
  const rows = await db
    .select({
      task: tasks,
      assignee: { id: assignee.id, username: assignee.username, displayName: assignee.displayName, avatarUrl: assignee.avatarUrl },
      milestone: { id: milestones.id, number: milestones.number, title: milestones.title },
      subtaskTotal: sql<number>`(select count(*)::int from tasks s where s.parent_id = ${tasks.id})`,
      subtaskDone: sql<number>`(select count(*)::int from tasks s where s.parent_id = ${tasks.id} and s.status = 'done')`,
      blockedBy: sql<number>`(select count(*)::int from task_dependencies d join tasks t2 on t2.id = d.depends_on_id where d.task_id = ${tasks.id} and t2.status <> 'done')`,
    })
    .from(tasks)
    .leftJoin(assignee, eq(assignee.id, tasks.assigneeId))
    .leftJoin(milestones, eq(milestones.id, tasks.milestoneId))
    .where(and(...conds))
    .orderBy(asc(tasks.sortOrder), desc(tasks.updatedAt))
    .limit(500);
  const lbl = await labelsForTasks(rows.map((r) => r.task.id));
  return {
    access,
    tasks: rows.map((r) => ({
      ...r.task,
      ref: formatRef("task", r.task.number),
      assignee: r.assignee?.id ? r.assignee : null,
      milestone: r.milestone?.id ? r.milestone : null,
      labels: lbl.get(r.task.id) ?? [],
      subtasks: { total: r.subtaskTotal, done: r.subtaskDone },
      blockedBy: r.blockedBy,
    })),
  };
}

async function load(access: ProjectAccess, number: number) {
  const [row] = await db.select().from(tasks).where(and(eq(tasks.projectId, access.project.id), eq(tasks.number, number)));
  if (!row) throw NotFound(formatRef("task", number));
  return row;
}

export async function getTask(actor: Actor, ref: string, number: number) {
  const access = await requireProject(actor, ref, "project.read");
  const task = await load(access, number);
  const assignee = alias(users, "assignee");
  const [subtasks, deps, dependents, lbl, links, people] = await Promise.all([
    db
      .select({ task: tasks, assignee: { id: assignee.id, displayName: assignee.displayName, username: assignee.username, avatarUrl: assignee.avatarUrl } })
      .from(tasks)
      .leftJoin(assignee, eq(assignee.id, tasks.assigneeId))
      .where(eq(tasks.parentId, task.id))
      .orderBy(asc(tasks.number)),
    db.select({ number: tasks.number, title: tasks.title, status: tasks.status }).from(taskDependencies).innerJoin(tasks, eq(tasks.id, taskDependencies.dependsOnId)).where(eq(taskDependencies.taskId, task.id)),
    db.select({ number: tasks.number, title: tasks.title, status: tasks.status }).from(taskDependencies).innerJoin(tasks, eq(tasks.id, taskDependencies.taskId)).where(eq(taskDependencies.dependsOnId, task.id)),
    labelsForTasks([task.id]),
    linksFor(access.project.id, access.project.slug, { type: "task", id: task.id }),
    db.select(userSummary).from(users).where(inArray(users.id, [task.assigneeId, task.createdBy].filter(Boolean) as string[])),
  ]);
  const parent = task.parentId ? (await db.select({ number: tasks.number, title: tasks.title }).from(tasks).where(eq(tasks.id, task.parentId)))[0] ?? null : null;
  const milestone = task.milestoneId ? (await db.select().from(milestones).where(eq(milestones.id, task.milestoneId)))[0] ?? null : null;
  return {
    access,
    task: {
      ...task,
      ref: formatRef("task", task.number),
      assignee: people.find((p) => p.id === task.assigneeId) ?? null,
      author: people.find((p) => p.id === task.createdBy) ?? null,
      labels: lbl.get(task.id) ?? [],
      milestone,
      parent,
    },
    subtasks: subtasks.map((s) => ({ ...s.task, ref: formatRef("task", s.task.number), assignee: s.assignee?.id ? s.assignee : null })),
    dependsOn: deps.map((d) => ({ ...d, ref: formatRef("task", d.number) })),
    blocks: dependents.map((d) => ({ ...d, ref: formatRef("task", d.number) })),
    links,
  };
}

async function setDependencies(tx: DbOrTx, access: ProjectAccess, taskId: string, numbers: number[]) {
  await tx.delete(taskDependencies).where(eq(taskDependencies.taskId, taskId));
  if (!numbers.length) return;
  const deps = await tx.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.projectId, access.project.id), inArray(tasks.number, numbers), ne(tasks.id, taskId)));
  // Reject direct cycles (A depends on B while B depends on A).
  for (const d of deps) {
    const [cycle] = await tx.select().from(taskDependencies).where(and(eq(taskDependencies.taskId, d.id), eq(taskDependencies.dependsOnId, taskId)));
    if (cycle) throw BadRequest("That dependency would create a cycle");
  }
  if (deps.length) await tx.insert(taskDependencies).values(deps.map((d) => ({ taskId, dependsOnId: d.id })));
}

async function validateRefs(access: ProjectAccess, input: { parentId?: string | null; milestoneId?: string | null }) {
  if (input.parentId) {
    const [p] = await db.select({ id: tasks.id, parentId: tasks.parentId }).from(tasks).where(and(eq(tasks.id, input.parentId), eq(tasks.projectId, access.project.id)));
    if (!p) throw NotFound("Parent task");
    if (p.parentId) throw BadRequest("Subtasks can only be one level deep");
  }
  if (input.milestoneId) {
    const [m] = await db.select({ id: milestones.id }).from(milestones).where(and(eq(milestones.id, input.milestoneId), eq(milestones.projectId, access.project.id)));
    if (!m) throw NotFound("Milestone");
  }
}

export async function indexTask(access: ProjectAccess, t: typeof tasks.$inferSelect) {
  await indexDocument({
    organizationId: access.org.id,
    projectId: access.project.id,
    entityType: "task",
    entityId: t.id,
    ref: formatRef("task", t.number),
    title: t.title,
    body: t.description ?? "",
    url: `/project/${access.project.slug}/tasks/${t.number}`,
    meta: { status: t.status, priority: t.priority },
  });
}

export async function createTask(actor: Actor & { displayName: string }, ref: string, input: z.infer<typeof createTaskSchema>) {
  const access = await requireProject(actor, ref, "project.write");
  await assertProjectUser(access, input.assigneeId);
  await validateRefs(access, input);
  const task = await db.transaction(async (tx) => {
    const number = await nextNumber(tx, access.project.id, "task");
    const [maxOrder] = await tx.select({ m: sql<number>`coalesce(max(${tasks.sortOrder}), 0)::int` }).from(tasks).where(and(eq(tasks.projectId, access.project.id), eq(tasks.status, input.status)));
    const [row] = await tx
      .insert(tasks)
      .values({
        projectId: access.project.id,
        number,
        title: input.title,
        description: input.description,
        status: input.status,
        priority: input.priority,
        assigneeId: input.assigneeId ?? null,
        milestoneId: input.milestoneId ?? null,
        parentId: input.parentId ?? null,
        dueDate: input.dueDate ?? null,
        sortOrder: (maxOrder?.m ?? 0) + 1000,
        completedAt: input.status === "done" ? new Date() : null,
        createdBy: actor.id,
      })
      .returning();
    if (input.labels?.length) await setTaskLabels(tx, access.project.id, row!.id, input.labels);
    if (input.dependsOn?.length) await setDependencies(tx, access, row!.id, input.dependsOn);
    await linkMentions(tx, access.project.id, { type: "task", id: row!.id }, `${input.title}\n${input.description ?? ""}`, actor.id);
    return row!;
  });
  await indexTask(access, task);
  const r = formatRef("task", task.number);
  await emit({
    type: "task.created",
    actorId: actor.id,
    organizationId: access.org.id,
    projectId: access.project.id,
    target: { type: "task", id: task.id, label: r, title: task.title, url: `/project/${access.project.slug}/tasks/${task.number}` },
    notify: task.assigneeId ? [{ userId: task.assigneeId, type: "task.assigned", title: `${actor.displayName} assigned you ${r}`, body: task.title }] : [],
  });
  return task;
}

export async function updateTask(actor: Actor & { displayName: string }, ref: string, number: number, input: z.infer<typeof updateTaskSchema>) {
  const access = await requireProject(actor, ref, "project.write");
  const before = await load(access, number);
  if (input.assigneeId !== undefined) await assertProjectUser(access, input.assigneeId);
  if (input.parentId === before.id) throw BadRequest("A task cannot be its own parent");
  await validateRefs(access, input);
  const { labels: labelNames, dependsOn, ...fields } = input;
  const statusChanged = fields.status && fields.status !== before.status;
  if (statusChanged && fields.status === "done") {
    const [open] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(taskDependencies)
      .innerJoin(tasks, eq(tasks.id, taskDependencies.dependsOnId))
      .where(and(eq(taskDependencies.taskId, before.id), ne(tasks.status, "done")));
    if ((open?.n ?? 0) > 0) throw BadRequest(`${formatRef("task", before.number)} is blocked by ${open!.n} unfinished task(s)`);
  }
  const task = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(tasks)
      .set({ ...fields, ...(statusChanged ? { completedAt: fields.status === "done" ? new Date() : null } : {}) })
      .where(eq(tasks.id, before.id))
      .returning();
    if (labelNames) await setTaskLabels(tx, access.project.id, before.id, labelNames);
    if (dependsOn) await setDependencies(tx, access, before.id, dependsOn);
    if (fields.description !== undefined) await linkMentions(tx, access.project.id, { type: "task", id: before.id }, row!.description, actor.id);
    return row!;
  });
  await indexTask(access, task);
  const r = formatRef("task", task.number);
  const target = { type: "task" as const, id: task.id, label: r, title: task.title, url: `/project/${access.project.slug}/tasks/${task.number}` };
  if (statusChanged) {
    await emit({
      type: task.status === "done" ? "task.completed" : "task.moved",
      actorId: actor.id,
      organizationId: access.org.id,
      projectId: access.project.id,
      target,
      data: { from: before.status, to: task.status },
    });
    if (task.milestoneId) await checkMilestoneCompletion(access, task.milestoneId, actor.id);
  }
  if (input.assigneeId !== undefined && input.assigneeId !== before.assigneeId && task.assigneeId) {
    await emit({
      type: "task.assigned",
      actorId: actor.id,
      organizationId: access.org.id,
      projectId: access.project.id,
      target,
      activity: false,
      notify: [{ userId: task.assigneeId, type: "task.assigned", title: `${actor.displayName} assigned you ${r}`, body: task.title }],
    });
  }
  return task;
}

export async function deleteTask(actor: Actor, ref: string, number: number) {
  const access = await requireProject(actor, ref, "project.write");
  const task = await load(access, number);
  await db.transaction(async (tx) => {
    await tx.update(tasks).set({ parentId: null }).where(eq(tasks.parentId, task.id));
    await tx.delete(comments).where(and(eq(comments.targetType, "task"), eq(comments.targetId, task.id)));
    await tx.delete(tasks).where(eq(tasks.id, task.id));
  });
  await unlinkAll(access.project.id, { type: "task", id: task.id });
  await removeDocument("task", task.id);
  await emit({
    type: "task.deleted",
    actorId: actor.id,
    organizationId: access.org.id,
    projectId: access.project.id,
    target: { type: "task", id: task.id, label: formatRef("task", task.number), title: task.title },
  });
}


