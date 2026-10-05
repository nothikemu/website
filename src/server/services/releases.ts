import "server-only";
import { and, desc, eq, gt, inArray, isNotNull, lte, ne } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/server/db";
import { changes, comments, commits, decisions, issues, releases, snapshots, tests, users, type ReleaseManifest } from "@/server/db/schema";
import { requireProject, type Actor, type ProjectAccess } from "@/server/authz";
import { BadRequest, Conflict, NotFound } from "@/server/http/errors";
import { emit } from "@/server/events";
import { indexDocument, removeDocument } from "@/server/search";
import { formatRef } from "@/lib/refs";
import type { createReleaseSchema, updateReleaseSchema } from "@/lib/validation";
import { requirementSummary } from "./requirements";
import { unlinkAll } from "./links";
import { userSummary } from "./shared";

export async function listReleases(actor: Actor, ref: string) {
  const access = await requireProject(actor, ref, "project.read");
  const rows = await db
    .select({ r: releases, author: userSummary, snapshot: { number: snapshots.number, name: snapshots.name } })
    .from(releases)
    .leftJoin(users, eq(users.id, releases.createdBy))
    .leftJoin(snapshots, eq(snapshots.id, releases.snapshotId))
    .where(eq(releases.projectId, access.project.id))
    .orderBy(desc(releases.createdAt));
  return { access, releases: rows.map((r) => ({ ...r.r, author: r.author?.id ? r.author : null, snapshot: r.snapshot?.number ? r.snapshot : null })) };
}

async function previousPublished(projectId: string, before?: Date) {
  const [r] = await db
    .select()
    .from(releases)
    .where(and(eq(releases.projectId, projectId), eq(releases.status, "published"), before ? lte(releases.publishedAt, before) : undefined))
    .orderBy(desc(releases.publishedAt))
    .limit(1);
  return r ?? null;
}

/** Build the release manifest & notes strictly from recorded project data. */
async function buildManifest(access: ProjectAccess, input: { snapshotId?: string | null; firmwareCommit?: string | null }, since: Date | null, until: Date) {
  const pid = access.project.id;
  const window = (col: Parameters<typeof gt>[0]) => and(since ? gt(col, since) : undefined, lte(col, until));
  const [snap, reqs, testRows, closed, chg, decs] = await Promise.all([
    input.snapshotId ? db.select().from(snapshots).where(and(eq(snapshots.id, input.snapshotId), eq(snapshots.projectId, pid))).then((r) => r[0] ?? null) : null,
    requirementSummary(pid),
    db.select({ number: tests.number, name: tests.name, status: tests.status }).from(tests).where(eq(tests.projectId, pid)),
    db.select({ number: issues.number, title: issues.title }).from(issues).where(and(eq(issues.projectId, pid), inArray(issues.status, ["resolved", "closed"]), isNotNull(issues.closedAt), window(issues.closedAt))),
    db.select({ number: changes.number, title: changes.title }).from(changes).where(and(eq(changes.projectId, pid), isNotNull(changes.implementedAt), window(changes.implementedAt))),
    db.select({ number: decisions.number, title: decisions.title }).from(decisions).where(and(eq(decisions.projectId, pid), eq(decisions.status, "accepted"), isNotNull(decisions.decidedAt), window(decisions.decidedAt))),
  ]);
  if (input.snapshotId && !snap) throw NotFound("Version");
  const manifest: ReleaseManifest = {
    snapshot: snap ? { id: snap.id, number: snap.number, name: snap.name } : null,
    firmwareCommit: input.firmwareCommit ?? null,
    requirements: { total: reqs.total, verified: reqs.verified, failed: reqs.failing },
    tests: {
      total: testRows.length,
      passed: testRows.filter((t) => t.status === "passed").length,
      failed: testRows.filter((t) => t.status === "failed").length,
      items: testRows.map((t) => ({ ref: formatRef("test", t.number), name: t.name, status: t.status })),
    },
    issuesClosed: closed.map((i) => ({ ref: formatRef("issue", i.number), title: i.title })),
    changes: chg.map((c) => ({ ref: formatRef("change", c.number), title: c.title })),
    decisions: decs.map((d) => ({ ref: formatRef("decision", d.number), title: d.title })),
  };
  return manifest;
}

export function renderNotes(m: ReleaseManifest, extra?: { commits?: { sha: string; message: string }[] }) {
  const lines: string[] = [];
  lines.push("## Contents");
  if (m.snapshot) lines.push(`- CAD & files: **Version ${m.snapshot.number}** — ${m.snapshot.name}`);
  if (m.firmwareCommit) lines.push(`- Firmware: \`${m.firmwareCommit.slice(0, 12)}\``);
  lines.push(`- Requirements: ${m.requirements.verified}/${m.requirements.total} verified${m.requirements.failed ? `, ${m.requirements.failed} failing` : ""}`);
  lines.push(`- Tests: ${m.tests.passed}/${m.tests.total} passing${m.tests.failed ? `, ${m.tests.failed} failing` : ""}`);
  if (m.changes.length) {
    lines.push("", "## Engineering changes");
    for (const c of m.changes) lines.push(`- ${c.ref} ${c.title}`);
  }
  if (m.decisions.length) {
    lines.push("", "## Decisions");
    for (const d of m.decisions) lines.push(`- ${d.ref} ${d.title}`);
  }
  if (m.issuesClosed.length) {
    lines.push("", "## Issues resolved");
    for (const i of m.issuesClosed) lines.push(`- ${i.ref} ${i.title}`);
  }
  const failing = m.tests.items.filter((t) => t.status === "failed");
  if (failing.length) {
    lines.push("", "## Known failures");
    for (const t of failing) lines.push(`- ${t.ref} ${t.name}`);
  }
  if (extra?.commits?.length) {
    lines.push("", "## Commits");
    for (const c of extra.commits.slice(0, 30)) lines.push(`- \`${c.sha.slice(0, 7)}\` ${c.message.split("\n")[0]}`);
  }
  return lines.join("\n");
}

export async function draftNotes(actor: Actor, ref: string, input: { snapshotId?: string | null; firmwareCommit?: string | null }) {
  const access = await requireProject(actor, ref, "project.read");
  const prev = await previousPublished(access.project.id);
  const now = new Date();
  const manifest = await buildManifest(access, input, prev?.publishedAt ?? null, now);
  const recentCommits = await db
    .select({ sha: commits.sha, message: commits.message })
    .from(commits)
    .where(and(eq(commits.projectId, access.project.id), prev?.publishedAt ? gt(commits.committedAt, prev.publishedAt) : undefined))
    .orderBy(desc(commits.committedAt))
    .limit(30);
  return { since: prev ? { tag: prev.tag, publishedAt: prev.publishedAt } : null, manifest, notes: renderNotes(manifest, { commits: recentCommits }) };
}

async function index(access: ProjectAccess, r: typeof releases.$inferSelect) {
  await indexDocument({
    organizationId: access.org.id,
    projectId: access.project.id,
    entityType: "release",
    entityId: r.id,
    ref: r.tag,
    title: `${r.tag} ${r.name}`,
    body: r.notes ?? "",
    url: `/project/${access.project.slug}/releases/${encodeURIComponent(r.tag)}`,
    meta: { status: r.status },
  });
}

async function publish(access: ProjectAccess, actorId: string, r: typeof releases.$inferSelect) {
  const prev = await previousPublished(access.project.id);
  const now = new Date();
  const manifest = await buildManifest(access, r, prev && prev.id !== r.id ? prev.publishedAt : null, now);
  const [published] = await db.update(releases).set({ status: "published", publishedAt: now, manifest }).where(eq(releases.id, r.id)).returning();
  await emit({
    type: "release.published",
    actorId,
    organizationId: access.org.id,
    projectId: access.project.id,
    target: { type: "release", id: r.id, label: r.tag, title: r.name, url: `/project/${access.project.slug}/releases/${encodeURIComponent(r.tag)}` },
    data: { tests: manifest.tests, requirements: manifest.requirements },
  });
  return published!;
}

export async function createRelease(actor: Actor, ref: string, input: z.infer<typeof createReleaseSchema>) {
  const access = await requireProject(actor, ref, "project.write");
  const [exists] = await db.select({ id: releases.id }).from(releases).where(and(eq(releases.projectId, access.project.id), eq(releases.tag, input.tag)));
  if (exists) throw Conflict(`Release ${input.tag} already exists`);
  if (input.snapshotId) {
    const [s] = await db.select({ id: snapshots.id }).from(snapshots).where(and(eq(snapshots.id, input.snapshotId), eq(snapshots.projectId, access.project.id)));
    if (!s) throw NotFound("Version");
  }
  const notes = input.notes ?? (await draftNotes(actor, ref, input)).notes;
  const [r] = await db
    .insert(releases)
    .values({ projectId: access.project.id, tag: input.tag, name: input.name, notes, snapshotId: input.snapshotId ?? null, firmwareCommit: input.firmwareCommit ?? null, createdBy: actor.id })
    .returning();
  let release = r!;
  if (input.publish) release = await publish(access, actor.id, release);
  else
    await emit({
      type: "release.drafted",
      actorId: actor.id,
      organizationId: access.org.id,
      projectId: access.project.id,
      activity: false,
      target: { type: "release", id: release.id, label: release.tag, title: release.name },
    });
  await index(access, release);
  return release;
}

async function load(access: ProjectAccess, tag: string) {
  const [r] = await db.select().from(releases).where(and(eq(releases.projectId, access.project.id), eq(releases.tag, tag)));
  if (!r) throw NotFound(`Release ${tag}`);
  return r;
}

export async function getRelease(actor: Actor, ref: string, tag: string) {
  const access = await requireProject(actor, ref, "project.read");
  const r = await load(access, tag);
  const [author, snapshot] = await Promise.all([
    r.createdBy ? db.select(userSummary).from(users).where(eq(users.id, r.createdBy)).then((x) => x[0] ?? null) : null,
    r.snapshotId ? db.select().from(snapshots).where(eq(snapshots.id, r.snapshotId)).then((x) => x[0] ?? null) : null,
  ]);
  const live = r.status === "draft" ? await buildManifest(access, r, (await previousPublished(access.project.id))?.publishedAt ?? null, new Date()) : null;
  return { access, release: { ...r, author, snapshot }, manifest: r.manifest ?? live };
}

export async function updateRelease(actor: Actor, ref: string, tag: string, input: z.infer<typeof updateReleaseSchema>) {
  const access = await requireProject(actor, ref, "project.write");
  const before = await load(access, tag);
  if (before.status === "published" && (input.snapshotId !== undefined || input.firmwareCommit !== undefined || input.tag))
    throw BadRequest("Published releases are immutable — only the name and notes can be edited");
  if (input.tag && input.tag !== before.tag) {
    const [exists] = await db.select({ id: releases.id }).from(releases).where(and(eq(releases.projectId, access.project.id), eq(releases.tag, input.tag), ne(releases.id, before.id)));
    if (exists) throw Conflict(`Release ${input.tag} already exists`);
  }
  const { publish: doPublish, ...fields } = input;
  let [r] = await db.update(releases).set(fields).where(eq(releases.id, before.id)).returning();
  if (doPublish && r!.status === "draft") r = await publish(access, actor.id, r!);
  await index(access, r!);
  return r!;
}

export async function deleteRelease(actor: Actor, ref: string, tag: string) {
  const access = await requireProject(actor, ref, "project.admin");
  const r = await load(access, tag);
  await db.transaction(async (tx) => {
    await tx.delete(comments).where(and(eq(comments.targetType, "release"), eq(comments.targetId, r.id)));
    await tx.delete(releases).where(eq(releases.id, r.id));
  });
  await unlinkAll(access.project.id, { type: "release", id: r.id });
  await removeDocument("release", r.id);
}
