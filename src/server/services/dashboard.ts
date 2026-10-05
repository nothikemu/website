import "server-only";
import { and, asc, desc, eq, gte, inArray, isNotNull, lte, ne, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { changes, commits, issues, milestones, organizations, projects, releases, tasks, users } from "@/server/db/schema";
import { accessibleProjectIds, requireProject, type Actor } from "@/server/authz";
import { formatRef } from "@/lib/refs";
import { feedForUser } from "./activity";
import { listNotifications } from "./notifications";
import { recentFiles } from "./files";
import { milestoneStats } from "./milestones";
import { requirementSummary } from "./requirements";
import { latestRuns } from "./tests";
import { projectPeople, userSummary } from "./shared";

const PRIORITY_ORDER = sql`case priority when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 when 'low' then 3 else 4 end`;

export async function personalDashboard(actor: Actor) {
  const ids = await accessibleProjectIds(actor.id);
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date(Date.now() + 14 * 86400_000).toISOString().slice(0, 10);
  const none = ["00000000-0000-0000-0000-000000000000"];
  const pids = ids.length ? ids : none;

  const [projectRows, myIssues, myTasks, deadlines, milestonesDue, engChanges, feed, notes] = await Promise.all([
    db
      .select({
        project: projects,
        org: { slug: organizations.slug, name: organizations.name },
        openIssues: sql<number>`(select count(*)::int from issues i where i.project_id = ${projects.id} and i.status in ('open','in_progress','blocked'))`,
        failingTests: sql<number>`(select count(*)::int from tests t where t.project_id = ${projects.id} and t.status = 'failed')`,
        lastActivity: sql<Date | null>`(select max(a.created_at) from activities a where a.project_id = ${projects.id})`,
      })
      .from(projects)
      .innerJoin(organizations, eq(organizations.id, projects.organizationId))
      .where(inArray(projects.id, pids))
      .orderBy(desc(sql`(select max(a.created_at) from activities a where a.project_id = ${projects.id})`))
      .limit(12),
    db
      .select({ issue: issues, project: { slug: projects.slug, name: projects.name } })
      .from(issues)
      .innerJoin(projects, eq(projects.id, issues.projectId))
      .where(and(inArray(issues.projectId, pids), eq(issues.assigneeId, actor.id), inArray(issues.status, ["open", "in_progress", "blocked"])))
      .orderBy(PRIORITY_ORDER, desc(issues.updatedAt))
      .limit(10),
    db
      .select({ task: tasks, project: { slug: projects.slug, name: projects.name } })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(and(inArray(tasks.projectId, pids), eq(tasks.assigneeId, actor.id), ne(tasks.status, "done")))
      .orderBy(sql`${tasks.dueDate} asc nulls last`, PRIORITY_ORDER)
      .limit(12),
    db
      .select({ task: tasks, project: { slug: projects.slug, name: projects.name } })
      .from(tasks)
      .innerJoin(projects, eq(projects.id, tasks.projectId))
      .where(and(inArray(tasks.projectId, pids), eq(tasks.assigneeId, actor.id), ne(tasks.status, "done"), isNotNull(tasks.dueDate), lte(tasks.dueDate, horizon)))
      .orderBy(asc(tasks.dueDate))
      .limit(8),
    db
      .select({ m: milestones, project: { slug: projects.slug, name: projects.name } })
      .from(milestones)
      .innerJoin(projects, eq(projects.id, milestones.projectId))
      .where(and(inArray(milestones.projectId, pids), eq(milestones.status, "open"), isNotNull(milestones.dueDate), lte(milestones.dueDate, horizon)))
      .orderBy(asc(milestones.dueDate))
      .limit(5),
    db
      .select({ c: changes, author: userSummary, project: { slug: projects.slug, name: projects.name } })
      .from(changes)
      .innerJoin(projects, eq(projects.id, changes.projectId))
      .leftJoin(users, eq(users.id, changes.authorId))
      .where(inArray(changes.projectId, pids))
      .orderBy(desc(changes.updatedAt))
      .limit(5),
    feedForUser(actor, { limit: 25 }),
    listNotifications(actor.id, { limit: 6, unreadOnly: true }),
  ]);
  return {
    projects: projectRows.map((p) => ({ ...p.project, org: p.org, openIssues: p.openIssues, failingTests: p.failingTests, lastActivity: p.lastActivity })),
    issues: myIssues.map((r) => ({ ...r.issue, ref: formatRef("issue", r.issue.number), project: r.project })),
    tasks: myTasks.map((r) => ({ ...r.task, ref: formatRef("task", r.task.number), project: r.project })),
    deadlines: [
      ...deadlines.map((r) => ({ kind: "task" as const, ref: formatRef("task", r.task.number), title: r.task.title, due: r.task.dueDate!, overdue: r.task.dueDate! < today, url: `/project/${r.project.slug}/tasks/${r.task.number}`, project: r.project })),
      ...milestonesDue.map((r) => ({ kind: "milestone" as const, ref: `M${r.m.number}`, title: r.m.title, due: r.m.dueDate!, overdue: r.m.dueDate! < today, url: `/project/${r.project.slug}/milestones`, project: r.project })),
    ].sort((a, b) => a.due.localeCompare(b.due)),
    changes: engChanges.map((r) => ({ ...r.c, ref: formatRef("change", r.c.number), author: r.author?.id ? r.author : null, project: r.project })),
    activity: feed.items,
    notifications: notes,
  };
}

export type Health = { level: "good" | "attention" | "critical" | "unknown"; reasons: string[] };

export async function projectOverview(actor: Actor, ref: string) {
  const access = await requireProject(actor, ref, "project.read");
  const pid = access.project.id;
  const today = new Date().toISOString().slice(0, 10);
  const [ms, openIssues, activeTasks, recentCommits, files, runs, latestRelease, reqs, people, counts, overdue] = await Promise.all([
    milestoneStats(pid),
    db
      .select({ issue: issues, assignee: userSummary })
      .from(issues)
      .leftJoin(users, eq(users.id, issues.assigneeId))
      .where(and(eq(issues.projectId, pid), inArray(issues.status, ["open", "in_progress", "blocked"])))
      .orderBy(PRIORITY_ORDER, desc(issues.updatedAt))
      .limit(6),
    db
      .select({ task: tasks, assignee: userSummary })
      .from(tasks)
      .leftJoin(users, eq(users.id, tasks.assigneeId))
      .where(and(eq(tasks.projectId, pid), inArray(tasks.status, ["in_progress", "review"])))
      .orderBy(desc(tasks.updatedAt))
      .limit(6),
    db.select().from(commits).where(eq(commits.projectId, pid)).orderBy(desc(commits.committedAt)).limit(5),
    recentFiles(access, 6),
    latestRuns(pid, 6),
    db.select().from(releases).where(and(eq(releases.projectId, pid), eq(releases.status, "published"))).orderBy(desc(releases.publishedAt)).limit(1).then((r) => r[0] ?? null),
    requirementSummary(pid),
    projectPeople(access),
    db
      .select({
        openIssues: sql<number>`(select count(*)::int from issues where project_id = ${pid} and status in ('open','in_progress','blocked'))`,
        blockedIssues: sql<number>`(select count(*)::int from issues where project_id = ${pid} and status = 'blocked')`,
        urgentIssues: sql<number>`(select count(*)::int from issues where project_id = ${pid} and status in ('open','in_progress','blocked') and priority = 'urgent')`,
        failingTests: sql<number>`(select count(*)::int from tests where project_id = ${pid} and status = 'failed')`,
        tests: sql<number>`(select count(*)::int from tests where project_id = ${pid})`,
        files: sql<number>`(select count(*)::int from files where project_id = ${pid} and deleted_at is null)`,
        storage: sql<number>`(select coalesce(sum(size),0)::bigint from files where project_id = ${pid} and deleted_at is null)`,
      })
      .from(sql`(select 1) x`)
      .then((r) => r[0]!),
    db.select({ n: sql<number>`count(*)::int` }).from(tasks).where(and(eq(tasks.projectId, pid), ne(tasks.status, "done"), isNotNull(tasks.dueDate), sql`${tasks.dueDate} < ${today}`)).then((r) => r[0]?.n ?? 0),
  ]);

  // Health is computed from real signals only, with the reasons shown to the user.
  const reasons: string[] = [];
  let score = 0;
  if (counts.failingTests) {
    reasons.push(`${counts.failingTests} failing test${counts.failingTests > 1 ? "s" : ""}`);
    score += 2;
  }
  if (reqs.failing) {
    reasons.push(`${reqs.failing} requirement${reqs.failing > 1 ? "s" : ""} failing verification`);
    score += 2;
  }
  if (counts.urgentIssues) {
    reasons.push(`${counts.urgentIssues} urgent issue${counts.urgentIssues > 1 ? "s" : ""}`);
    score += 1;
  }
  if (counts.blockedIssues) {
    reasons.push(`${counts.blockedIssues} blocked issue${counts.blockedIssues > 1 ? "s" : ""}`);
    score += 1;
  }
  if (overdue) {
    reasons.push(`${overdue} overdue task${overdue > 1 ? "s" : ""}`);
    score += 1;
  }
  const currentMilestone = ms.filter((m) => m.status === "open").sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))[0] ?? null;
  if (currentMilestone?.dueDate && currentMilestone.dueDate < today) {
    reasons.push(`M${currentMilestone.number} is past due`);
    score += 1;
  }
  const hasData = counts.tests + counts.openIssues + reqs.total + counts.files > 0;
  const health: Health = {
    level: !hasData ? "unknown" : score >= 4 ? "critical" : score >= 1 ? "attention" : "good",
    reasons: reasons.length ? reasons : hasData ? ["No failing tests, blocked work or overdue tasks"] : ["Not enough project data yet"],
  };

  return {
    access,
    health,
    counts: { ...counts, storage: Number(counts.storage), overdueTasks: overdue },
    requirements: reqs,
    currentMilestone,
    milestones: ms,
    openIssues: openIssues.map((r) => ({ ...r.issue, ref: formatRef("issue", r.issue.number), assignee: r.assignee?.id ? r.assignee : null })),
    activeTasks: activeTasks.map((r) => ({ ...r.task, ref: formatRef("task", r.task.number), assignee: r.assignee?.id ? r.assignee : null })),
    commits: recentCommits,
    files: files.map((f) => ({ ...f.file, user: f.user?.id ? f.user : null })),
    testRuns: runs.map((r) => ({ ...r.run, testRef: formatRef("test", r.testNumber), testName: r.testName, testNumber: r.testNumber, by: r.by?.id ? r.by : null })),
    latestRelease,
    people,
  };
}

export async function upcoming(actor: Actor) {
  const ids = await accessibleProjectIds(actor.id);
  if (!ids.length) return [];
  return db
    .select({ task: tasks })
    .from(tasks)
    .where(and(inArray(tasks.projectId, ids), eq(tasks.assigneeId, actor.id), gte(tasks.dueDate, new Date().toISOString().slice(0, 10))))
    .limit(10);
}


