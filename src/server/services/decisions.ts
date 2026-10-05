import "server-only";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/server/db";
import { comments, decisions, users } from "@/server/db/schema";
import { requireProject, type Actor, type ProjectAccess } from "@/server/authz";
import { NotFound } from "@/server/http/errors";
import { emit } from "@/server/events";
import { indexDocument, removeDocument } from "@/server/search";
import { formatRef } from "@/lib/refs";
import type { createDecisionSchema, updateDecisionSchema } from "@/lib/validation";
import { linksFor, unlinkAll } from "./links";
import { addLink, assertProjectUser, linkMentions, nextNumber, userSummary } from "./shared";

export async function listDecisions(actor: Actor, ref: string, f: { status?: string; q?: string } = {}) {
  const access = await requireProject(actor, ref, "project.read");
  const conds = [eq(decisions.projectId, access.project.id)];
  if (f.status) conds.push(eq(decisions.status, f.status as "accepted"));
  if (f.q) {
    const n = Number(f.q.replace(/^DEC-/i, ""));
    conds.push(or(ilike(decisions.title, `%${f.q}%`), ilike(decisions.decision, `%${f.q}%`), Number.isInteger(n) && n > 0 ? eq(decisions.number, n) : undefined)!);
  }
  const rows = await db
    .select({ d: decisions, owner: userSummary })
    .from(decisions)
    .leftJoin(users, eq(users.id, decisions.ownerId))
    .where(and(...conds))
    .orderBy(desc(decisions.number));
  return { access, decisions: rows.map((r) => ({ ...r.d, ref: formatRef("decision", r.d.number), owner: r.owner?.id ? r.owner : null })) };
}

async function load(access: ProjectAccess, number: number) {
  const [row] = await db.select().from(decisions).where(and(eq(decisions.projectId, access.project.id), eq(decisions.number, number)));
  if (!row) throw NotFound(formatRef("decision", number));
  return row;
}

export async function getDecision(actor: Actor, ref: string, number: number) {
  const access = await requireProject(actor, ref, "project.read");
  const d = await load(access, number);
  const [linksList, owner] = await Promise.all([
    linksFor(access.project.id, access.project.slug, { type: "decision", id: d.id }),
    d.ownerId ? db.select(userSummary).from(users).where(eq(users.id, d.ownerId)).then((r) => r[0] ?? null) : null,
  ]);
  const supersededBy = d.supersededById ? (await db.select({ number: decisions.number, title: decisions.title }).from(decisions).where(eq(decisions.id, d.supersededById)))[0] ?? null : null;
  const supersedes = await db.select({ number: decisions.number, title: decisions.title }).from(decisions).where(eq(decisions.supersededById, d.id));
  return {
    access,
    decision: { ...d, ref: formatRef("decision", d.number), owner },
    supersededBy: supersededBy ? { ...supersededBy, ref: formatRef("decision", supersededBy.number) } : null,
    supersedes: supersedes.map((s) => ({ ...s, ref: formatRef("decision", s.number) })),
    links: linksList,
  };
}

async function index(access: ProjectAccess, d: typeof decisions.$inferSelect) {
  await indexDocument({
    organizationId: access.org.id,
    projectId: access.project.id,
    entityType: "decision",
    entityId: d.id,
    ref: formatRef("decision", d.number),
    title: d.title,
    body: [d.decision, d.context, d.rationale, d.consequences, ...d.alternatives.map((a) => `${a.name} ${a.pros ?? ""} ${a.cons ?? ""}`)].filter(Boolean).join("\n"),
    url: `/project/${access.project.slug}/decisions/${d.number}`,
    meta: { status: d.status },
  });
}

const textOf = (d: { context?: string | null; rationale?: string | null; consequences?: string | null; decision?: string | null }) =>
  [d.decision, d.context, d.rationale, d.consequences].filter(Boolean).join("\n");

export async function createDecision(actor: Actor, ref: string, input: z.infer<typeof createDecisionSchema>) {
  const access = await requireProject(actor, ref, "project.write");
  await assertProjectUser(access, input.ownerId);
  const { supersedes, ...fields } = input;
  const d = await db.transaction(async (tx) => {
    const number = await nextNumber(tx, access.project.id, "decision");
    const [row] = await tx
      .insert(decisions)
      .values({ ...fields, ownerId: fields.ownerId ?? actor.id, projectId: access.project.id, number, createdBy: actor.id, decidedAt: fields.status === "accepted" ? new Date() : null })
      .returning();
    if (supersedes) {
      const [old] = await tx.select().from(decisions).where(and(eq(decisions.projectId, access.project.id), eq(decisions.number, supersedes)));
      if (!old) throw NotFound(formatRef("decision", supersedes));
      await tx.update(decisions).set({ status: "superseded", supersededById: row!.id }).where(eq(decisions.id, old.id));
      await addLink(tx, { projectId: access.project.id, sourceType: "decision", sourceId: row!.id, targetType: "decision", targetId: old.id, relation: "supersedes", createdBy: actor.id });
    }
    await linkMentions(tx, access.project.id, { type: "decision", id: row!.id }, textOf(fields), actor.id);
    return row!;
  });
  await index(access, d);
  await emit({
    type: "decision.created",
    actorId: actor.id,
    organizationId: access.org.id,
    projectId: access.project.id,
    target: { type: "decision", id: d.id, label: formatRef("decision", d.number), title: d.title, url: `/project/${access.project.slug}/decisions/${d.number}` },
    data: { status: d.status },
  });
  return d;
}

export async function updateDecision(actor: Actor, ref: string, number: number, input: z.infer<typeof updateDecisionSchema>) {
  const access = await requireProject(actor, ref, "project.write");
  const before = await load(access, number);
  if (input.ownerId !== undefined) await assertProjectUser(access, input.ownerId);
  const { supersedes: _ignored, ...fields } = input;
  const statusChanged = fields.status && fields.status !== before.status;
  const [d] = await db
    .update(decisions)
    .set({ ...fields, ...(statusChanged && fields.status === "accepted" ? { decidedAt: new Date() } : {}) })
    .where(eq(decisions.id, before.id))
    .returning();
  await linkMentions(db, access.project.id, { type: "decision", id: d!.id }, textOf(d!), actor.id);
  await index(access, d!);
  if (statusChanged)
    await emit({
      type: `decision.${fields.status}`,
      actorId: actor.id,
      organizationId: access.org.id,
      projectId: access.project.id,
      target: { type: "decision", id: d!.id, label: formatRef("decision", d!.number), title: d!.title, url: `/project/${access.project.slug}/decisions/${d!.number}` },
      data: { from: before.status, to: d!.status },
    });
  return d!;
}

export async function deleteDecision(actor: Actor, ref: string, number: number) {
  const access = await requireProject(actor, ref, "project.admin");
  const d = await load(access, number);
  await db.transaction(async (tx) => {
    await tx.update(decisions).set({ supersededById: null }).where(eq(decisions.supersededById, d.id));
    await tx.delete(comments).where(and(eq(comments.targetType, "decision"), eq(comments.targetId, d.id)));
    await tx.delete(decisions).where(eq(decisions.id, d.id));
  });
  await unlinkAll(access.project.id, { type: "decision", id: d.id });
  await removeDocument("decision", d.id);
  await emit({ type: "decision.deleted", actorId: actor.id, organizationId: access.org.id, projectId: access.project.id, target: { type: "decision", id: d.id, label: formatRef("decision", d.number), title: d.title } });
}
