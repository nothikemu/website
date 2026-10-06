import "server-only";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import type { z } from "zod";
import { db, type DbOrTx } from "@/server/db";
import { changes, comments, users } from "@/server/db/schema";
import { requireProject, type Actor, type ProjectAccess } from "@/server/authz";
import { NotFound } from "@/server/http/errors";
import { emit } from "@/server/events";
import { indexDocument, removeDocument } from "@/server/search";
import { formatRef } from "@/lib/refs";
import type { createChangeSchema, updateChangeSchema } from "@/lib/validation";
import { linksFor, unlinkAll } from "./links";
import { addLink, linkMentions, nextNumber, resolveRefs, userSummary } from "./shared";

/** Engineering change records — the "why" behind every physical revision. */
export async function listChanges(actor: Actor, ref: string, f: { status?: string; q?: string } = {}) {
  const access = await requireProject(actor, ref, "project.read");
  const conds = [eq(changes.projectId, access.project.id)];
  if (f.status) conds.push(eq(changes.status, f.status as "approved"));
  if (f.q) {
    const n = Number(f.q.replace(/^CHANGE-/i, ""));
    conds.push(or(ilike(changes.title, `%${f.q}%`), ilike(changes.reason, `%${f.q}%`), Number.isInteger(n) && n > 0 ? eq(changes.number, n) : undefined)!);
  }
  const rows = await db.select({ c: changes, author: userSummary }).from(changes).leftJoin(users, eq(users.id, changes.authorId)).where(and(...conds)).orderBy(desc(changes.number));
  return { access, changes: rows.map((r) => ({ ...r.c, ref: formatRef("change", r.c.number), author: r.author?.id ? r.author : null })) };
}

async function load(access: ProjectAccess, number: number) {
  const [row] = await db.select().from(changes).where(and(eq(changes.projectId, access.project.id), eq(changes.number, number)));
  if (!row) throw NotFound(formatRef("change", number));
  return row;
}

export async function getChange(actor: Actor, ref: string, number: number) {
  const access = await requireProject(actor, ref, "project.read");
  const c = await load(access, number);
  const [linksList, author] = await Promise.all([
    linksFor(access.project.id, access.project.slug, { type: "change", id: c.id }),
    c.authorId ? db.select(userSummary).from(users).where(eq(users.id, c.authorId)).then((r) => r[0] ?? null) : null,
  ]);
  return { access, change: { ...c, ref: formatRef("change", c.number), author }, links: linksList };
}

async function index(access: ProjectAccess, c: typeof changes.$inferSelect) {
  await indexDocument({
    organizationId: access.org.id,
    projectId: access.project.id,
    entityType: "change",
    entityId: c.id,
    ref: formatRef("change", c.number),
    title: c.title,
    body: [c.reason, c.description, c.result, ...c.items.map((i) => `${i.parameter} ${i.from} ${i.to}`)].filter(Boolean).join("\n"),
    url: `/project/${access.project.slug}/changes/${c.number}`,
    meta: { status: c.status },
  });
}

async function applyLinks(tx: DbOrTx, access: ProjectAccess, id: string, input: z.infer<typeof createChangeSchema>["links"], actorId: string) {
  if (!input) return;
  const refs = [
    ...(input.requirements ?? []).map((n) => ({ kind: "requirement" as const, number: n })),
    ...(input.tests ?? []).map((n) => ({ kind: "test" as const, number: n })),
    ...(input.decisions ?? []).map((n) => ({ kind: "decision" as const, number: n })),
    ...(input.issues ?? []).map((n) => ({ kind: "issue" as const, number: n })),
  ];
  for (const r of await resolveRefs(access.project.id, refs, tx))
    await addLink(tx, { projectId: access.project.id, sourceType: "change", sourceId: id, targetType: r.kind, targetId: r.id, relation: r.kind === "issue" ? "fixes" : "affects", createdBy: actorId });
  for (const fid of input.files ?? [])
    await addLink(tx, { projectId: access.project.id, sourceType: "change", sourceId: id, targetType: "file", targetId: fid, relation: "affects", createdBy: actorId });
}

export async function createChange(actor: Actor, ref: string, input: z.infer<typeof createChangeSchema>) {
  const access = await requireProject(actor, ref, "project.write");
  const { links: linkInput, ...fields } = input;
  const c = await db.transaction(async (tx) => {
    const number = await nextNumber(tx, access.project.id, "change");
    const [row] = await tx
      .insert(changes)
      .values({ ...fields, projectId: access.project.id, number, authorId: actor.id, implementedAt: ["implemented", "verified"].includes(fields.status) ? new Date() : null })
      .returning();
    await applyLinks(tx, access, row!.id, linkInput, actor.id);
    await linkMentions(tx, access.project.id, { type: "change", id: row!.id }, `${fields.reason}\n${fields.description ?? ""}\n${fields.result ?? ""}`, actor.id);
    return row!;
  });
  await index(access, c);
  await emit({
    type: "change.created",
    actorId: actor.id,
    organizationId: access.org.id,
    projectId: access.project.id,
    target: { type: "change", id: c.id, label: formatRef("change", c.number), title: c.title, url: `/project/${access.project.slug}/changes/${c.number}` },
    data: { status: c.status, items: c.items.length },
  });
  return c;
}

export async function updateChange(actor: Actor, ref: string, number: number, input: z.infer<typeof updateChangeSchema>) {
  const access = await requireProject(actor, ref, "project.write");
  const before = await load(access, number);
  const { links: linkInput, ...fields } = input;
  const statusChanged = fields.status && fields.status !== before.status;
  const c = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(changes)
      .set({ ...fields, ...(statusChanged && ["implemented", "verified"].includes(fields.status!) && !before.implementedAt ? { implementedAt: new Date() } : {}) })
      .where(eq(changes.id, before.id))
      .returning();
    await applyLinks(tx, access, row!.id, linkInput, actor.id);
    await linkMentions(tx, access.project.id, { type: "change", id: row!.id }, `${row!.reason}\n${row!.description ?? ""}\n${row!.result ?? ""}`, actor.id);
    return row!;
  });
  await index(access, c);
  if (statusChanged)
    await emit({
      type: `change.${c.status}`,
      actorId: actor.id,
      organizationId: access.org.id,
      projectId: access.project.id,
      target: { type: "change", id: c.id, label: formatRef("change", c.number), title: c.title, url: `/project/${access.project.slug}/changes/${c.number}` },
      data: { from: before.status, to: c.status },
    });
  return c;
}

export async function deleteChange(actor: Actor, ref: string, number: number) {
  const access = await requireProject(actor, ref, "project.admin");
  const c = await load(access, number);
  await db.transaction(async (tx) => {
    await tx.delete(comments).where(and(eq(comments.targetType, "change"), eq(comments.targetId, c.id)));
    await tx.delete(changes).where(eq(changes.id, c.id));
  });
  await unlinkAll(access.project.id, { type: "change", id: c.id });
  await removeDocument("change", c.id);
}
