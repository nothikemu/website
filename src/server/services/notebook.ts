import "server-only";
import { and, desc, eq, ilike, lt, or, sql } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/server/db";
import { comments, notebookEntries, notebookRevisions, users } from "@/server/db/schema";
import { requireProject, type Actor, type ProjectAccess } from "@/server/authz";
import { Forbidden, NotFound } from "@/server/http/errors";
import { emit } from "@/server/events";
import { indexDocument, removeDocument } from "@/server/search";
import { formatRef } from "@/lib/refs";
import type { createNotebookSchema, updateNotebookSchema } from "@/lib/validation";
import { linksFor, unlinkAll } from "./links";
import { linkMentions, nextNumber, resolveMentions, userSummary } from "./shared";

/**
 * Engineering notebook. Author and creation timestamp are immutable; edits by
 * the author create numbered revisions so the original record is preserved.
 */
export async function listEntries(actor: Actor, ref: string, f: { tag?: string; author?: string; q?: string; before?: string } = {}, limit = 30) {
  const access = await requireProject(actor, ref, "project.read");
  const conds = [eq(notebookEntries.projectId, access.project.id)];
  if (f.tag) conds.push(sql`${f.tag} = any(${notebookEntries.tags})`);
  if (f.author) conds.push(eq(users.username, f.author));
  if (f.q) conds.push(or(ilike(notebookEntries.title, `%${f.q}%`), ilike(notebookEntries.body, `%${f.q}%`))!);
  if (f.before) conds.push(lt(notebookEntries.number, Number(f.before)));
  const rows = await db
    .select({ e: notebookEntries, author: userSummary })
    .from(notebookEntries)
    .leftJoin(users, eq(users.id, notebookEntries.authorId))
    .where(and(...conds))
    .orderBy(desc(notebookEntries.entryDate), desc(notebookEntries.number))
    .limit(limit + 1);
  const tags = await db.execute<{ tag: string; n: number }>(sql`
    select t as tag, count(*)::int as n from notebook_entries, unnest(tags) t
    where project_id = ${access.project.id} group by t order by n desc, t limit 30`);
  return {
    access,
    entries: rows.slice(0, limit).map((r) => ({ ...r.e, ref: formatRef("notebook_entry", r.e.number), author: r.author?.id ? r.author : null })),
    hasMore: rows.length > limit,
    tags: [...tags].map((t) => ({ tag: t.tag, count: Number(t.n) })),
  };
}

async function load(access: ProjectAccess, number: number) {
  const [row] = await db.select().from(notebookEntries).where(and(eq(notebookEntries.projectId, access.project.id), eq(notebookEntries.number, number)));
  if (!row) throw NotFound(formatRef("notebook_entry", number));
  return row;
}

export async function getEntry(actor: Actor, ref: string, number: number) {
  const access = await requireProject(actor, ref, "project.read");
  const e = await load(access, number);
  const [author, revisions, linksList] = await Promise.all([
    e.authorId ? db.select(userSummary).from(users).where(eq(users.id, e.authorId)).then((r) => r[0] ?? null) : null,
    db.select({ r: notebookRevisions, by: userSummary }).from(notebookRevisions).leftJoin(users, eq(users.id, notebookRevisions.editedBy)).where(eq(notebookRevisions.entryId, e.id)).orderBy(desc(notebookRevisions.revision)),
    linksFor(access.project.id, access.project.slug, { type: "notebook_entry", id: e.id }),
  ]);
  return {
    access,
    entry: { ...e, ref: formatRef("notebook_entry", e.number), author },
    revisions: revisions.map((r) => ({ ...r.r, by: r.by?.id ? r.by : null })),
    links: linksList,
  };
}

async function index(access: ProjectAccess, e: typeof notebookEntries.$inferSelect) {
  await indexDocument({
    organizationId: access.org.id,
    projectId: access.project.id,
    entityType: "notebook_entry",
    entityId: e.id,
    ref: formatRef("notebook_entry", e.number),
    title: e.title,
    body: `${e.body}\n${e.tags.join(" ")}`,
    url: `/project/${access.project.slug}/notebook/${e.number}`,
    meta: { date: e.entryDate, tags: e.tags },
  });
}

export async function createEntry(actor: Actor & { displayName: string }, ref: string, input: z.infer<typeof createNotebookSchema>) {
  const access = await requireProject(actor, ref, "project.write");
  const e = await db.transaction(async (tx) => {
    const number = await nextNumber(tx, access.project.id, "notebook_entry");
    const [row] = await tx
      .insert(notebookEntries)
      .values({ projectId: access.project.id, number, title: input.title, body: input.body, entryDate: input.entryDate, tags: [...new Set(input.tags)], authorId: actor.id })
      .returning();
    await tx.insert(notebookRevisions).values({ entryId: row!.id, revision: 1, title: row!.title, body: row!.body, editedBy: actor.id });
    await linkMentions(tx, access.project.id, { type: "notebook_entry", id: row!.id }, `${input.title}\n${input.body}`, actor.id);
    return row!;
  });
  await index(access, e);
  const r = formatRef("notebook_entry", e.number);
  const mentions = await resolveMentions(access, e.body);
  await emit({
    type: "notebook.entry_created",
    actorId: actor.id,
    organizationId: access.org.id,
    projectId: access.project.id,
    target: { type: "notebook_entry", id: e.id, label: r, title: e.title, url: `/project/${access.project.slug}/notebook/${e.number}` },
    notify: mentions.map((m) => ({ userId: m.id, type: "comment.mention", title: `${actor.displayName} mentioned you in notebook ${r}`, body: e.title })),
  });
  return e;
}

export async function updateEntry(actor: Actor, ref: string, number: number, input: z.infer<typeof updateNotebookSchema>) {
  const access = await requireProject(actor, ref, "project.write");
  const before = await load(access, number);
  if (before.authorId !== actor.id) throw Forbidden("Only the author can amend a notebook entry");
  const e = await db.transaction(async (tx) => {
    const revision = before.revisionCount + 1;
    const [row] = await tx
      .update(notebookEntries)
      .set({ ...input, ...(input.tags ? { tags: [...new Set(input.tags)] } : {}), revisionCount: revision, editedAt: new Date() })
      .where(eq(notebookEntries.id, before.id))
      .returning();
    await tx.insert(notebookRevisions).values({ entryId: before.id, revision, title: row!.title, body: row!.body, editedBy: actor.id });
    await linkMentions(tx, access.project.id, { type: "notebook_entry", id: row!.id }, `${row!.title}\n${row!.body}`, actor.id);
    return row!;
  });
  await index(access, e);
  await emit({
    type: "notebook.entry_amended",
    actorId: actor.id,
    organizationId: access.org.id,
    projectId: access.project.id,
    target: { type: "notebook_entry", id: e.id, label: formatRef("notebook_entry", e.number), title: e.title, url: `/project/${access.project.slug}/notebook/${e.number}` },
    data: { revision: e.revisionCount },
  });
  return e;
}

export async function deleteEntry(actor: Actor, ref: string, number: number) {
  const access = await requireProject(actor, ref, "project.admin");
  const e = await load(access, number);
  await db.transaction(async (tx) => {
    await tx.delete(comments).where(and(eq(comments.targetType, "notebook_entry"), eq(comments.targetId, e.id)));
    await tx.delete(notebookEntries).where(eq(notebookEntries.id, e.id));
  });
  await unlinkAll(access.project.id, { type: "notebook_entry", id: e.id });
  await removeDocument("notebook_entry", e.id);
}
