import "server-only";
import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { z } from "zod";
import { db } from "@/server/db";
import { comments, issueLabels, issues, labels, milestones, users } from "@/server/db/schema";
import { requireProject, type Actor, type ProjectAccess } from "@/server/authz";
import { Forbidden, NotFound } from "@/server/http/errors";
import { emit } from "@/server/events";
import { indexDocument, removeDocument } from "@/server/search";
import { formatRef } from "@/lib/refs";
import type { createIssueSchema, updateIssueSchema } from "@/lib/validation";
import { labelsForIssues, setIssueLabels } from "./labels";
import { linksFor, unlinkAll } from "./links";
import { addLink, assertProjectUser, linkMentions, nextNumber, resolveMentions, resolveRefs, userSummary } from "./shared";

const OPEN = ["open", "in_progress", "blocked"] as const;
const CLOSED = ["resolved", "closed"] as const;

export type IssueFilters = {
  state?: "open" | "closed" | "all";
  status?: string;
  assignee?: string;
  label?: string;
  milestone?: string;
  priority?: string;
  q?: string;
};

export async function listIssues(actor: Actor, ref: string, f: IssueFilters = {}, limit = 100) {
  const access = await requireProject(actor, ref, "project.read");
  const assignee = alias(users, "assignee");
  const conds = [eq(issues.projectId, access.project.id)];
  if (f.status) conds.push(eq(issues.status, f.status as (typeof OPEN)[number]));
  else if (f.state !== "all") conds.push(inArray(issues.status, f.state === "closed" ? [...CLOSED] : [...OPEN]));
  if (f.assignee === "none") conds.push(sql`${issues.assigneeId} is null`);
  else if (f.assignee) conds.push(eq(assignee.username, f.assignee));
  if (f.priority) conds.push(eq(issues.priority, f.priority as "high"));
  if (f.milestone) conds.push(eq(milestones.number, Number(f.milestone)));
  if (f.label)
    conds.push(
      inArray(
        issues.id,
        db
          .select({ id: issueLabels.issueId })
          .from(issueLabels)
          .innerJoin(labels, eq(labels.id, issueLabels.labelId))
          .where(and(eq(labels.projectId, access.project.id), eq(labels.name, f.label))),
      ),
    );
  if (f.q) {
    const n = Number(f.q.replace(/^(ISS-|#)/i, ""));
    conds.push(or(ilike(issues.title, `%${f.q}%`), Number.isInteger(n) && n > 0 ? eq(issues.number, n) : undefined)!);
  }
  const rows = await db
    .select({
      issue: issues,
      assignee: { id: assignee.id, username: assignee.username, displayName: assignee.displayName, avatarUrl: assignee.avatarUrl },
      milestone: { id: milestones.id, number: milestones.number, title: milestones.title },
      comments: sql<number>`(select count(*)::int from comments c where c.target_type = 'issue' and c.target_id = ${issues.id} and c.deleted_at is null)`,
    })
    .from(issues)
    .leftJoin(assignee, eq(assignee.id, issues.assigneeId))
    .leftJoin(milestones, eq(milestones.id, issues.milestoneId))
    .where(and(...conds))
    .orderBy(desc(issues.updatedAt))
    .limit(limit);
  const lbl = await labelsForIssues(rows.map((r) => r.issue.id));
  const [counts] = await db
    .select({
      open: sql<number>`count(*) filter (where ${issues.status} in ('open','in_progress','blocked'))::int`,
      closed: sql<number>`count(*) filter (where ${issues.status} in ('resolved','closed'))::int`,
    })
    .from(issues)
    .where(eq(issues.projectId, access.project.id));
  return {
    access,
    counts: counts ?? { open: 0, closed: 0 },
    issues: rows.map((r) => ({
      ...r.issue,
      ref: formatRef("issue", r.issue.number),
      assignee: r.assignee?.id ? r.assignee : null,
      milestone: r.milestone?.id ? r.milestone : null,
      labels: lbl.get(r.issue.id) ?? [],
      commentCount: r.comments,
    })),
  };
}

async function load(access: ProjectAccess, number: number) {
  const [row] = await db.select().from(issues).where(and(eq(issues.projectId, access.project.id), eq(issues.number, number)));
  if (!row) throw NotFound(formatRef("issue", number));
  return row;
}

export async function getIssue(actor: Actor, ref: string, number: number) {
  const access = await requireProject(actor, ref, "project.read");
  const issue = await load(access, number);
  const [people, lbl, links] = await Promise.all([
    issue.assigneeId || issue.createdBy
      ? db.select(userSummary).from(users).where(inArray(users.id, [issue.assigneeId, issue.createdBy].filter(Boolean) as string[]))
      : [],
    labelsForIssues([issue.id]),
    linksFor(access.project.id, access.project.slug, { type: "issue", id: issue.id }),
  ]);
  const milestone = issue.milestoneId ? (await db.select().from(milestones).where(eq(milestones.id, issue.milestoneId)))[0] : null;
  return {
    access,
    issue: {
      ...issue,
      ref: formatRef("issue", issue.number),
      assignee: people.find((p) => p.id === issue.assigneeId) ?? null,
      author: people.find((p) => p.id === issue.createdBy) ?? null,
      labels: lbl.get(issue.id) ?? [],
      milestone: milestone ?? null,
    },
    links,
  };
}

async function checkMilestone(projectId: string, milestoneId: string | null | undefined) {
  if (!milestoneId) return;
  const [m] = await db.select({ id: milestones.id }).from(milestones).where(and(eq(milestones.id, milestoneId), eq(milestones.projectId, projectId)));
  if (!m) throw NotFound("Milestone");
}

async function applyLinks(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  access: ProjectAccess,
  issueId: string,
  input: z.infer<typeof createIssueSchema>["links"],
  actorId: string,
) {
  if (!input) return;
  const refs = [
    ...(input.requirements ?? []).map((n) => ({ kind: "requirement" as const, number: n })),
    ...(input.tests ?? []).map((n) => ({ kind: "test" as const, number: n })),
    ...(input.decisions ?? []).map((n) => ({ kind: "decision" as const, number: n })),
  ];
  for (const r of await resolveRefs(access.project.id, refs, tx))
    await addLink(tx, { projectId: access.project.id, sourceType: "issue", sourceId: issueId, targetType: r.kind, targetId: r.id, relation: "affects", createdBy: actorId });
}

export async function indexIssue(access: ProjectAccess, issue: typeof issues.$inferSelect) {
  await indexDocument({
    organizationId: access.org.id,
    projectId: access.project.id,
    entityType: "issue",
    entityId: issue.id,
    ref: formatRef("issue", issue.number),
    title: issue.title,
    body: issue.description ?? "",
    url: `/project/${access.project.slug}/issues/${issue.number}`,
    meta: { status: issue.status, priority: issue.priority },
  });
}

export async function createIssue(actor: Actor & { displayName: string }, ref: string, input: z.infer<typeof createIssueSchema>) {
  const access = await requireProject(actor, ref, "project.write");
  await assertProjectUser(access, input.assigneeId);
  await checkMilestone(access.project.id, input.milestoneId);
  const issue = await db.transaction(async (tx) => {
    const number = await nextNumber(tx, access.project.id, "issue");
    const [row] = await tx
      .insert(issues)
      .values({
        projectId: access.project.id,
        number,
        title: input.title,
        description: input.description,
        status: input.status,
        priority: input.priority,
        assigneeId: input.assigneeId ?? null,
        milestoneId: input.milestoneId ?? null,
        createdBy: actor.id,
        closedAt: CLOSED.includes(input.status as (typeof CLOSED)[number]) ? new Date() : null,
      })
      .returning();
    if (input.labels?.length) await setIssueLabels(tx, access.project.id, row!.id, input.labels);
    await applyLinks(tx, access, row!.id, input.links, actor.id);
    await linkMentions(tx, access.project.id, { type: "issue", id: row!.id }, `${input.title}\n${input.description ?? ""}`, actor.id);
    return row!;
  });
  await indexIssue(access, issue);
  const ref_ = formatRef("issue", issue.number);
  const mentions = await resolveMentions(access, issue.description ?? "");
  await emit({
    type: "issue.created",
    actorId: actor.id,
    organizationId: access.org.id,
    projectId: access.project.id,
    target: { type: "issue", id: issue.id, label: ref_, title: issue.title, url: `/project/${access.project.slug}/issues/${issue.number}` },
    data: { priority: issue.priority },
    notify: [
      ...(issue.assigneeId ? [{ userId: issue.assigneeId, type: "issue.assigned", title: `${actor.displayName} assigned you ${ref_}`, body: issue.title }] : []),
      ...mentions.map((m) => ({ userId: m.id, type: "comment.mention", title: `${actor.displayName} mentioned you in ${ref_}`, body: issue.title })),
    ],
  });
  return issue;
}

export async function updateIssue(actor: Actor & { displayName: string }, ref: string, number: number, input: z.infer<typeof updateIssueSchema>) {
  const access = await requireProject(actor, ref, "project.write");
  const before = await load(access, number);
  if (input.assigneeId !== undefined) await assertProjectUser(access, input.assigneeId);
  if (input.milestoneId !== undefined) await checkMilestone(access.project.id, input.milestoneId);
  const { labels: labelNames, links: linkInput, ...fields } = input;
  const statusChanged = fields.status && fields.status !== before.status;
  const issue = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(issues)
      .set({
        ...fields,
        ...(statusChanged ? { closedAt: CLOSED.includes(fields.status as (typeof CLOSED)[number]) ? new Date() : null } : {}),
      })
      .where(eq(issues.id, before.id))
      .returning();
    if (labelNames) await setIssueLabels(tx, access.project.id, before.id, labelNames);
    await applyLinks(tx, access, before.id, linkInput, actor.id);
    if (fields.description !== undefined || fields.title !== undefined)
      await linkMentions(tx, access.project.id, { type: "issue", id: before.id }, `${row!.title}\n${row!.description ?? ""}`, actor.id);
    return row!;
  });
  await indexIssue(access, issue);
  const ref_ = formatRef("issue", issue.number);
  const target = { type: "issue" as const, id: issue.id, label: ref_, title: issue.title, url: `/project/${access.project.slug}/issues/${issue.number}` };
  if (statusChanged) {
    const verb = issue.status === "closed" ? "issue.closed" : issue.status === "resolved" ? "issue.resolved" : CLOSED.includes(before.status as (typeof CLOSED)[number]) ? "issue.reopened" : "issue.status_changed";
    await emit({
      type: verb,
      actorId: actor.id,
      organizationId: access.org.id,
      projectId: access.project.id,
      target,
      data: { from: before.status, to: issue.status },
      notify: [before.createdBy, issue.assigneeId]
        .filter(Boolean)
        .map((u) => ({ userId: u!, type: "issue.status", title: `${ref_} is now ${issue.status.replace("_", " ")}`, body: issue.title })),
    });
  }
  if (input.assigneeId !== undefined && input.assigneeId !== before.assigneeId && issue.assigneeId) {
    await emit({
      type: "issue.assigned",
      actorId: actor.id,
      organizationId: access.org.id,
      projectId: access.project.id,
      target,
      notify: [{ userId: issue.assigneeId, type: "issue.assigned", title: `${actor.displayName} assigned you ${ref_}`, body: issue.title }],
    });
  }
  if (!statusChanged && (input.title || input.description !== undefined || input.priority)) {
    await emit({ type: "issue.updated", actorId: actor.id, organizationId: access.org.id, projectId: access.project.id, target, activity: Boolean(input.priority && input.priority !== before.priority), data: { priority: issue.priority } });
  }
  return issue;
}

export async function deleteIssue(actor: Actor, ref: string, number: number) {
  const access = await requireProject(actor, ref, "project.write");
  const issue = await load(access, number);
  if (access.role !== "admin" && issue.createdBy !== actor.id) throw Forbidden("Only the author or a project admin can delete this issue");
  await db.transaction(async (tx) => {
    await tx.delete(comments).where(and(eq(comments.targetType, "issue"), eq(comments.targetId, issue.id)));
    await tx.delete(issues).where(eq(issues.id, issue.id));
  });
  await unlinkAll(access.project.id, { type: "issue", id: issue.id });
  await removeDocument("issue", issue.id);
  await emit({
    type: "issue.deleted",
    actorId: actor.id,
    organizationId: access.org.id,
    projectId: access.project.id,
    target: { type: "issue", id: issue.id, label: formatRef("issue", issue.number), title: issue.title },
  });
}

export async function openIssueCount(projectId: string) {
  const [r] = await db.select({ n: count() }).from(issues).where(and(eq(issues.projectId, projectId), inArray(issues.status, [...OPEN])));
  return r?.n ?? 0;
}
