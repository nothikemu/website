import "server-only";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/server/db";
import {
  changes,
  commits,
  decisions,
  files,
  issues,
  links,
  milestones,
  notebookEntries,
  releases,
  requirements,
  snapshots,
  tasks,
  testRuns,
  tests,
} from "@/server/db/schema";
import { requireProject, type Actor } from "@/server/authz";
import { BadRequest, NotFound } from "@/server/http/errors";
import { emit } from "@/server/events";
import { formatRef, PREFIX_TO_KIND, type RefKind } from "@/lib/refs";
import type { EntityType } from "@/server/events/types";
import { addLink, resolveRefs } from "./shared";

export type EntityRef = { type: EntityType; id: string };
export type EntitySummary = EntityRef & { ref: string; title: string; status: string | null; url: string };

/** Load display info (ref, title, status, url) for a set of entities in one project. */
export async function describeEntities(projectId: string, projectSlug: string, items: EntityRef[]): Promise<Map<string, EntitySummary>> {
  const out = new Map<string, EntitySummary>();
  const by = new Map<EntityType, string[]>();
  for (const i of items) by.set(i.type, [...(by.get(i.type) ?? []), i.id]);
  const base = `/project/${projectSlug}`;
  const put = (type: EntityType, id: string, ref: string, title: string, status: string | null, url: string) =>
    out.set(`${type}:${id}`, { type, id, ref, title, status, url });

  for (const [type, ids] of by) {
    switch (type) {
      case "requirement":
        for (const r of await db.select().from(requirements).where(and(eq(requirements.projectId, projectId), inArray(requirements.id, ids))))
          put(type, r.id, formatRef("requirement", r.number), r.title, r.status, `${base}/requirements/${r.number}`);
        break;
      case "test":
        for (const r of await db.select().from(tests).where(and(eq(tests.projectId, projectId), inArray(tests.id, ids))))
          put(type, r.id, formatRef("test", r.number), r.name, r.status, `${base}/tests/${r.number}`);
        break;
      case "test_run":
        for (const r of await db
          .select({ run: testRuns, testNumber: tests.number, testName: tests.name })
          .from(testRuns)
          .innerJoin(tests, eq(tests.id, testRuns.testId))
          .where(and(eq(testRuns.projectId, projectId), inArray(testRuns.id, ids))))
          put(type, r.run.id, `${formatRef("test", r.testNumber)} #${r.run.number}`, r.testName, r.run.status, `${base}/tests/${r.testNumber}`);
        break;
      case "decision":
        for (const r of await db.select().from(decisions).where(and(eq(decisions.projectId, projectId), inArray(decisions.id, ids))))
          put(type, r.id, formatRef("decision", r.number), r.title, r.status, `${base}/decisions/${r.number}`);
        break;
      case "change":
        for (const r of await db.select().from(changes).where(and(eq(changes.projectId, projectId), inArray(changes.id, ids))))
          put(type, r.id, formatRef("change", r.number), r.title, r.status, `${base}/changes/${r.number}`);
        break;
      case "issue":
        for (const r of await db.select().from(issues).where(and(eq(issues.projectId, projectId), inArray(issues.id, ids))))
          put(type, r.id, formatRef("issue", r.number), r.title, r.status, `${base}/issues/${r.number}`);
        break;
      case "task":
        for (const r of await db.select().from(tasks).where(and(eq(tasks.projectId, projectId), inArray(tasks.id, ids))))
          put(type, r.id, formatRef("task", r.number), r.title, r.status, `${base}/tasks/${r.number}`);
        break;
      case "notebook_entry":
        for (const r of await db.select().from(notebookEntries).where(and(eq(notebookEntries.projectId, projectId), inArray(notebookEntries.id, ids))))
          put(type, r.id, formatRef("notebook_entry", r.number), r.title, null, `${base}/notebook/${r.number}`);
        break;
      case "file":
        for (const r of await db.select().from(files).where(and(eq(files.projectId, projectId), inArray(files.id, ids), isNull(files.deletedAt))))
          put(type, r.id, `v${r.versionCount}`, r.path, r.kind, `${base}/files/${r.id}`);
        break;
      case "snapshot":
        for (const r of await db.select().from(snapshots).where(and(eq(snapshots.projectId, projectId), inArray(snapshots.id, ids))))
          put(type, r.id, `V${r.number}`, r.name, null, `${base}/versions/${r.number}`);
        break;
      case "release":
        for (const r of await db.select().from(releases).where(and(eq(releases.projectId, projectId), inArray(releases.id, ids))))
          put(type, r.id, r.tag, r.name, r.status, `${base}/releases/${encodeURIComponent(r.tag)}`);
        break;
      case "milestone":
        for (const r of await db.select().from(milestones).where(and(eq(milestones.projectId, projectId), inArray(milestones.id, ids))))
          put(type, r.id, `M${r.number}`, r.title, r.status, `${base}/milestones`);
        break;
      case "commit":
        for (const r of await db.select().from(commits).where(and(eq(commits.projectId, projectId), inArray(commits.id, ids))))
          put(type, r.id, r.sha.slice(0, 7), r.message.split("\n")[0]!, null, r.url ?? `${base}/activity`);
        break;
      default:
        break;
    }
  }
  return out;
}

export type LinkView = EntitySummary & { linkId: string; relation: string; direction: "outgoing" | "incoming" };

/** All links touching an entity, resolved for display. Links to deleted entities are dropped. */
export async function linksFor(projectId: string, projectSlug: string, entity: EntityRef): Promise<LinkView[]> {
  const rows = await db
    .select()
    .from(links)
    .where(
      and(
        eq(links.projectId, projectId),
        or(
          and(eq(links.sourceType, entity.type), eq(links.sourceId, entity.id)),
          and(eq(links.targetType, entity.type), eq(links.targetId, entity.id)),
        ),
      ),
    );
  const others = rows.map((l) =>
    l.sourceType === entity.type && l.sourceId === entity.id
      ? { link: l, other: { type: l.targetType, id: l.targetId }, direction: "outgoing" as const }
      : { link: l, other: { type: l.sourceType, id: l.sourceId }, direction: "incoming" as const },
  );
  const described = await describeEntities(projectId, projectSlug, others.map((o) => o.other));
  const seen = new Set<string>();
  return others
    .map((o) => {
      const d = described.get(`${o.other.type}:${o.other.id}`);
      return d ? { ...d, linkId: o.link.id, relation: o.link.relation, direction: o.direction } : null;
    })
    .filter((l): l is LinkView => {
      // One row per related entity; prefer the more specific relation over a plain reference.
      if (!l) return false;
      const k = `${l.type}:${l.id}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => (a.relation === "references" ? 1 : 0) - (b.relation === "references" ? 1 : 0));
}

const TYPE_ALIASES: Record<string, EntityType> = {
  requirement: "requirement",
  test: "test",
  decision: "decision",
  change: "change",
  issue: "issue",
  task: "task",
  notebook_entry: "notebook_entry",
  file: "file",
  release: "release",
  snapshot: "snapshot",
  commit: "commit",
};

async function entityExists(projectId: string, e: EntityRef) {
  const d = await describeEntities(projectId, "_", [e]);
  return d.has(`${e.type}:${e.id}`);
}

/** Create a link from an entity to another, addressed either by id or by REF ("REQ-004"). */
export async function createLink(
  actor: Actor,
  ref: string,
  input: { sourceType: string; sourceId: string; targetRef?: string; targetType?: string; targetId?: string; relation: string },
) {
  const access = await requireProject(actor, ref, "project.write");
  const sourceType = TYPE_ALIASES[input.sourceType];
  if (!sourceType) throw BadRequest("Unknown source type");
  if (!(await entityExists(access.project.id, { type: sourceType, id: input.sourceId }))) throw NotFound("Source");
  let target: EntityRef | null = null;
  if (input.targetRef) {
    const m = /^([A-Z]+)-(\d+)$/i.exec(input.targetRef.trim());
    const kind = m ? (PREFIX_TO_KIND[m[1]!.toUpperCase()] as RefKind | undefined) : undefined;
    if (!m || !kind) throw BadRequest("Use a reference like REQ-004, TEST-012 or ISS-031");
    const [hit] = await resolveRefs(access.project.id, [{ kind, number: Number(m[2]) }]);
    if (!hit) throw NotFound(input.targetRef.toUpperCase());
    target = { type: kind as EntityType, id: hit.id };
  } else if (input.targetType && input.targetId) {
    const t = TYPE_ALIASES[input.targetType];
    if (!t) throw BadRequest("Unknown target type");
    target = { type: t, id: input.targetId };
    if (!(await entityExists(access.project.id, target))) throw NotFound("Target");
  }
  if (!target) throw BadRequest("Specify a target");
  await addLink(db, {
    projectId: access.project.id,
    sourceType,
    sourceId: input.sourceId,
    targetType: target.type,
    targetId: target.id,
    relation: input.relation,
    createdBy: actor.id,
  });
  const d = await describeEntities(access.project.id, access.project.slug, [{ type: sourceType, id: input.sourceId }, target]);
  const src = d.get(`${sourceType}:${input.sourceId}`);
  const dst = d.get(`${target.type}:${target.id}`);
  await emit({
    type: "link.created",
    actorId: actor.id,
    organizationId: access.org.id,
    projectId: access.project.id,
    target: { type: sourceType, id: input.sourceId, label: src?.ref, title: src?.title, url: src?.url },
    data: { relation: input.relation, to: dst?.ref, toTitle: dst?.title },
  });
  return { ok: true };
}

export async function deleteLink(actor: Actor, ref: string, linkId: string) {
  const access = await requireProject(actor, ref, "project.write");
  const r = await db.delete(links).where(and(eq(links.id, linkId), eq(links.projectId, access.project.id))).returning();
  if (!r.length) throw NotFound("Link");
}

/** Remove every link touching an entity (on delete). */
export async function unlinkAll(projectId: string, e: EntityRef) {
  await db
    .delete(links)
    .where(
      and(
        eq(links.projectId, projectId),
        or(and(eq(links.sourceType, e.type), eq(links.sourceId, e.id)), and(eq(links.targetType, e.type), eq(links.targetId, e.id))),
      ),
    );
}
