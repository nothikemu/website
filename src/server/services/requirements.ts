import "server-only";
import { and, asc, eq, ilike, inArray, or } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/server/db";
import { comments, links, requirements, tests, users } from "@/server/db/schema";
import { requireProject, type Actor, type ProjectAccess } from "@/server/authz";
import { NotFound } from "@/server/http/errors";
import { emit } from "@/server/events";
import { indexDocument, removeDocument } from "@/server/search";
import { formatRef } from "@/lib/refs";
import type { createRequirementSchema, updateRequirementSchema } from "@/lib/validation";
import { describeEntities, linksFor, unlinkAll } from "./links";
import { assertProjectUser, linkMentions, nextNumber, userSummary } from "./shared";

export type Verification = "verified" | "failing" | "in_progress" | "untested" | "not_applicable";

/** Verification state derived from linked tests — the core of traceability. */
export function verificationOf(testStatuses: string[], method: string): Verification {
  if (!testStatuses.length) return method === "test" ? "untested" : "not_applicable";
  if (testStatuses.includes("failed")) return "failing";
  if (testStatuses.every((s) => s === "passed")) return "verified";
  return "in_progress";
}

async function linkedTestStatuses(projectId: string, requirementIds: string[]) {
  if (!requirementIds.length) return new Map<string, { number: number; name: string; status: string }[]>();
  const rows = await db
    .select({ reqId: links.targetId, number: tests.number, name: tests.name, status: tests.status })
    .from(links)
    .innerJoin(tests, eq(tests.id, links.sourceId))
    .where(and(eq(links.projectId, projectId), eq(links.sourceType, "test"), eq(links.targetType, "requirement"), inArray(links.targetId, requirementIds)));
  const m = new Map<string, { number: number; name: string; status: string }[]>();
  for (const r of rows) m.set(r.reqId, [...(m.get(r.reqId) ?? []), { number: r.number, name: r.name, status: r.status }]);
  return m;
}

export async function listRequirements(actor: Actor, ref: string, f: { status?: string; q?: string } = {}) {
  const access = await requireProject(actor, ref, "project.read");
  const conds = [eq(requirements.projectId, access.project.id)];
  if (f.status) conds.push(eq(requirements.status, f.status as "draft"));
  if (f.q) {
    const n = Number(f.q.replace(/^REQ-/i, ""));
    conds.push(or(ilike(requirements.title, `%${f.q}%`), Number.isInteger(n) && n > 0 ? eq(requirements.number, n) : undefined)!);
  }
  const rows = await db
    .select({ req: requirements, owner: userSummary })
    .from(requirements)
    .leftJoin(users, eq(users.id, requirements.ownerId))
    .where(and(...conds))
    .orderBy(asc(requirements.number));
  const tmap = await linkedTestStatuses(access.project.id, rows.map((r) => r.req.id));
  return {
    access,
    requirements: rows.map((r) => {
      const t = tmap.get(r.req.id) ?? [];
      return {
        ...r.req,
        ref: formatRef("requirement", r.req.number),
        owner: r.owner?.id ? r.owner : null,
        tests: t.map((x) => ({ ...x, ref: formatRef("test", x.number) })),
        verification: verificationOf(t.map((x) => x.status), r.req.verificationMethod),
      };
    }),
  };
}

/** Requirement → decisions / files / tests / issues / changes, for the traceability matrix. */
export async function traceabilityMatrix(actor: Actor, ref: string) {
  const { access, requirements: reqs } = await listRequirements(actor, ref);
  const ids = reqs.map((r) => r.id);
  const rows = ids.length
    ? await db
        .select()
        .from(links)
        .where(and(eq(links.projectId, access.project.id), or(and(eq(links.targetType, "requirement"), inArray(links.targetId, ids)), and(eq(links.sourceType, "requirement"), inArray(links.sourceId, ids)))))
    : [];
  const others = rows.map((l) => (l.targetType === "requirement" && ids.includes(l.targetId) ? { req: l.targetId, type: l.sourceType, id: l.sourceId } : { req: l.sourceId, type: l.targetType, id: l.targetId }));
  const described = await describeEntities(access.project.id, access.project.slug, others);
  const byReq = new Map<string, { type: string; ref: string; title: string; status: string | null; url: string }[]>();
  for (const o of others) {
    const d = described.get(`${o.type}:${o.id}`);
    if (d) byReq.set(o.req, [...(byReq.get(o.req) ?? []), d]);
  }
  return { access, rows: reqs.map((r) => ({ requirement: r, links: byReq.get(r.id) ?? [] })) };
}

async function load(access: ProjectAccess, number: number) {
  const [row] = await db.select().from(requirements).where(and(eq(requirements.projectId, access.project.id), eq(requirements.number, number)));
  if (!row) throw NotFound(formatRef("requirement", number));
  return row;
}

export async function getRequirement(actor: Actor, ref: string, number: number) {
  const access = await requireProject(actor, ref, "project.read");
  const req = await load(access, number);
  const [linksList, owner, tmap, children] = await Promise.all([
    linksFor(access.project.id, access.project.slug, { type: "requirement", id: req.id }),
    req.ownerId ? db.select(userSummary).from(users).where(eq(users.id, req.ownerId)).then((r) => r[0] ?? null) : null,
    linkedTestStatuses(access.project.id, [req.id]),
    db.select({ number: requirements.number, title: requirements.title, status: requirements.status }).from(requirements).where(eq(requirements.parentId, req.id)),
  ]);
  const parent = req.parentId ? (await db.select({ number: requirements.number, title: requirements.title }).from(requirements).where(eq(requirements.id, req.parentId)))[0] ?? null : null;
  const t = tmap.get(req.id) ?? [];
  return {
    access,
    requirement: { ...req, ref: formatRef("requirement", req.number), owner, parent, verification: verificationOf(t.map((x) => x.status), req.verificationMethod) },
    children: children.map((c) => ({ ...c, ref: formatRef("requirement", c.number) })),
    links: linksList,
  };
}

async function index(access: ProjectAccess, r: typeof requirements.$inferSelect) {
  await indexDocument({
    organizationId: access.org.id,
    projectId: access.project.id,
    entityType: "requirement",
    entityId: r.id,
    ref: formatRef("requirement", r.number),
    title: r.title,
    body: `${r.description ?? ""}\n${r.rationale ?? ""}`,
    url: `/project/${access.project.slug}/requirements/${r.number}`,
    meta: { status: r.status, priority: r.priority },
  });
}

async function checkParent(access: ProjectAccess, parentId: string | null | undefined) {
  if (!parentId) return;
  const [p] = await db.select({ id: requirements.id }).from(requirements).where(and(eq(requirements.id, parentId), eq(requirements.projectId, access.project.id)));
  if (!p) throw NotFound("Parent requirement");
}

export async function createRequirement(actor: Actor, ref: string, input: z.infer<typeof createRequirementSchema>) {
  const access = await requireProject(actor, ref, "project.write");
  await assertProjectUser(access, input.ownerId);
  await checkParent(access, input.parentId);
  const req = await db.transaction(async (tx) => {
    const number = await nextNumber(tx, access.project.id, "requirement");
    const [row] = await tx.insert(requirements).values({ ...input, ownerId: input.ownerId ?? null, parentId: input.parentId ?? null, projectId: access.project.id, number, createdBy: actor.id }).returning();
    await linkMentions(tx, access.project.id, { type: "requirement", id: row!.id }, `${input.description ?? ""}\n${input.rationale ?? ""}`, actor.id);
    return row!;
  });
  await index(access, req);
  await emit({
    type: "requirement.created",
    actorId: actor.id,
    organizationId: access.org.id,
    projectId: access.project.id,
    target: { type: "requirement", id: req.id, label: formatRef("requirement", req.number), title: req.title, url: `/project/${access.project.slug}/requirements/${req.number}` },
  });
  return req;
}

export async function updateRequirement(actor: Actor, ref: string, number: number, input: z.infer<typeof updateRequirementSchema>) {
  const access = await requireProject(actor, ref, "project.write");
  const before = await load(access, number);
  if (input.ownerId !== undefined) await assertProjectUser(access, input.ownerId);
  if (input.parentId !== undefined) await checkParent(access, input.parentId);
  const [req] = await db.update(requirements).set(input).where(eq(requirements.id, before.id)).returning();
  if (input.description !== undefined || input.rationale !== undefined)
    await linkMentions(db, access.project.id, { type: "requirement", id: req!.id }, `${req!.description ?? ""}\n${req!.rationale ?? ""}`, actor.id);
  await index(access, req!);
  const changed = Object.keys(input).filter((k) => JSON.stringify((input as Record<string, unknown>)[k]) !== JSON.stringify((before as Record<string, unknown>)[k]));
  if (changed.length)
    await emit({
      type: input.status && input.status !== before.status ? "requirement.status_changed" : "requirement.updated",
      actorId: actor.id,
      organizationId: access.org.id,
      projectId: access.project.id,
      target: { type: "requirement", id: req!.id, label: formatRef("requirement", req!.number), title: req!.title, url: `/project/${access.project.slug}/requirements/${req!.number}` },
      data: { fields: changed, from: before.status, to: req!.status },
    });
  return req!;
}

export async function deleteRequirement(actor: Actor, ref: string, number: number) {
  const access = await requireProject(actor, ref, "project.admin");
  const req = await load(access, number);
  await db.transaction(async (tx) => {
    await tx.update(requirements).set({ parentId: null }).where(eq(requirements.parentId, req.id));
    await tx.delete(comments).where(and(eq(comments.targetType, "requirement"), eq(comments.targetId, req.id)));
    await tx.delete(requirements).where(eq(requirements.id, req.id));
  });
  await unlinkAll(access.project.id, { type: "requirement", id: req.id });
  await removeDocument("requirement", req.id);
  await emit({ type: "requirement.deleted", actorId: actor.id, organizationId: access.org.id, projectId: access.project.id, target: { type: "requirement", id: req.id, label: formatRef("requirement", req.number), title: req.title } });
}

export async function requirementSummary(projectId: string) {
  const reqs = await db.select({ id: requirements.id, method: requirements.verificationMethod, status: requirements.status }).from(requirements).where(eq(requirements.projectId, projectId));
  const tmap = await linkedTestStatuses(projectId, reqs.map((r) => r.id));
  const out = { total: 0, verified: 0, failing: 0, in_progress: 0, untested: 0, not_applicable: 0 };
  for (const r of reqs) {
    if (r.status === "obsolete") continue;
    out.total++;
    out[verificationOf((tmap.get(r.id) ?? []).map((t) => t.status), r.method)]++;
  }
  return out;
}


