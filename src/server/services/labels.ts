import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db, type DbOrTx } from "@/server/db";
import { issueLabels, labels, taskLabels } from "@/server/db/schema";
import { requireProject, type Actor } from "@/server/authz";

const PALETTE = ["#d9822b", "#3fb68b", "#4c8bf5", "#a371f7", "#e5484d", "#d4b106", "#8a8f98", "#2bb3c0"];

export async function listLabels(actor: Actor, ref: string) {
  const access = await requireProject(actor, ref, "project.read");
  return db.select().from(labels).where(eq(labels.projectId, access.project.id)).orderBy(labels.name);
}

/** Find-or-create labels by name within a project. */
export async function ensureLabels(tx: DbOrTx, projectId: string, names: string[]) {
  const clean = [...new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean))];
  if (!clean.length) return [];
  const existing = await tx.select().from(labels).where(and(eq(labels.projectId, projectId), inArray(labels.name, clean)));
  const missing = clean.filter((n) => !existing.some((e) => e.name === n));
  for (const name of missing) {
    const color = PALETTE[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % PALETTE.length]!;
    const [l] = await tx.insert(labels).values({ projectId, name, color }).onConflictDoNothing().returning();
    if (l) existing.push(l);
  }
  return existing;
}

export async function setIssueLabels(tx: DbOrTx, projectId: string, issueId: string, names: string[]) {
  const ls = await ensureLabels(tx, projectId, names);
  await tx.delete(issueLabels).where(eq(issueLabels.issueId, issueId));
  if (ls.length) await tx.insert(issueLabels).values(ls.map((l) => ({ issueId, labelId: l.id })));
}

export async function setTaskLabels(tx: DbOrTx, projectId: string, taskId: string, names: string[]) {
  const ls = await ensureLabels(tx, projectId, names);
  await tx.delete(taskLabels).where(eq(taskLabels.taskId, taskId));
  if (ls.length) await tx.insert(taskLabels).values(ls.map((l) => ({ taskId, labelId: l.id })));
}

export async function labelsForIssues(ids: string[]) {
  if (!ids.length) return new Map<string, { name: string; color: string }[]>();
  const rows = await db
    .select({ issueId: issueLabels.issueId, name: labels.name, color: labels.color })
    .from(issueLabels)
    .innerJoin(labels, eq(labels.id, issueLabels.labelId))
    .where(inArray(issueLabels.issueId, ids));
  const m = new Map<string, { name: string; color: string }[]>();
  for (const r of rows) m.set(r.issueId, [...(m.get(r.issueId) ?? []), { name: r.name, color: r.color }]);
  return m;
}

export async function labelsForTasks(ids: string[]) {
  if (!ids.length) return new Map<string, { name: string; color: string }[]>();
  const rows = await db
    .select({ taskId: taskLabels.taskId, name: labels.name, color: labels.color })
    .from(taskLabels)
    .innerJoin(labels, eq(labels.id, taskLabels.labelId))
    .where(inArray(taskLabels.taskId, ids));
  const m = new Map<string, { name: string; color: string }[]>();
  for (const r of rows) m.set(r.taskId, [...(m.get(r.taskId) ?? []), { name: r.name, color: r.color }]);
  return m;
}
