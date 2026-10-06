import "server-only";
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db, type DbOrTx } from "@/server/db";
import { files, fileVersions, snapshotEntries, snapshots, users } from "@/server/db/schema";
import { requireProject, type Actor } from "@/server/authz";
import { BadRequest, Conflict, NotFound } from "@/server/http/errors";
import { emit } from "@/server/events";
import { indexDocument } from "@/server/search";
import { createRevisionFrom, ensureFolderPath } from "./files";
import { nextNumber, userSummary } from "./shared";

/**
 * Project versions ("Version 1, 2, 3 …"): an immutable record of which revision
 * of every file was current at a point in time. Cheap — entries reference
 * existing file revisions, no bytes are copied.
 */
type Entry = { fileId: string; fileVersionId: string; path: string; number: number; size: number };

async function entriesOf(snapshotId: string, tx: DbOrTx = db): Promise<Entry[]> {
  return tx
    .select({
      fileId: snapshotEntries.fileId,
      fileVersionId: snapshotEntries.fileVersionId,
      path: snapshotEntries.path,
      number: fileVersions.number,
      size: fileVersions.size,
    })
    .from(snapshotEntries)
    .innerJoin(fileVersions, eq(fileVersions.id, snapshotEntries.fileVersionId))
    .where(eq(snapshotEntries.snapshotId, snapshotId));
}

async function liveEntries(projectId: string): Promise<Entry[]> {
  return db
    .select({ fileId: files.id, fileVersionId: fileVersions.id, path: files.path, number: fileVersions.number, size: fileVersions.size })
    .from(files)
    .innerJoin(fileVersions, eq(fileVersions.id, files.currentVersionId))
    .where(and(eq(files.projectId, projectId), isNull(files.deletedAt)));
}

export type EntryChange = {
  fileId: string;
  path: string;
  status: "added" | "removed" | "modified" | "renamed" | "unchanged";
  from?: { versionId: string; number: number; path: string } | null;
  to?: { versionId: string; number: number; path: string } | null;
};

export function compareEntries(a: Entry[], b: Entry[]): EntryChange[] {
  const am = new Map(a.map((e) => [e.fileId, e]));
  const bm = new Map(b.map((e) => [e.fileId, e]));
  const out: EntryChange[] = [];
  for (const e of b) {
    const prev = am.get(e.fileId);
    const to = { versionId: e.fileVersionId, number: e.number, path: e.path };
    if (!prev) out.push({ fileId: e.fileId, path: e.path, status: "added", from: null, to });
    else {
      const from = { versionId: prev.fileVersionId, number: prev.number, path: prev.path };
      const status = prev.fileVersionId !== e.fileVersionId ? "modified" : prev.path !== e.path ? "renamed" : "unchanged";
      out.push({ fileId: e.fileId, path: e.path, status, from, to });
    }
  }
  for (const e of a)
    if (!bm.has(e.fileId))
      out.push({ fileId: e.fileId, path: e.path, status: "removed", from: { versionId: e.fileVersionId, number: e.number, path: e.path }, to: null });
  const order = { added: 0, modified: 1, renamed: 2, removed: 3, unchanged: 4 };
  return out.sort((x, y) => order[x.status] - order[y.status] || x.path.localeCompare(y.path));
}

const summarize = (c: EntryChange[]) => ({
  added: c.filter((x) => x.status === "added").length,
  modified: c.filter((x) => x.status === "modified" || x.status === "renamed").length,
  removed: c.filter((x) => x.status === "removed").length,
});

export async function listSnapshots(actor: Actor, ref: string) {
  const access = await requireProject(actor, ref, "project.read");
  const rows = await db
    .select({ snapshot: snapshots, author: userSummary })
    .from(snapshots)
    .leftJoin(users, eq(users.id, snapshots.createdBy))
    .where(eq(snapshots.projectId, access.project.id))
    .orderBy(desc(snapshots.number));
  return { access, snapshots: rows.map((r) => ({ ...r.snapshot, author: r.author?.id ? r.author : null })) };
}

export async function pendingChanges(actor: Actor, ref: string) {
  const access = await requireProject(actor, ref, "project.read");
  const [latest] = await db
    .select()
    .from(snapshots)
    .where(eq(snapshots.projectId, access.project.id))
    .orderBy(desc(snapshots.number))
    .limit(1);
  const changes = compareEntries(latest ? await entriesOf(latest.id) : [], await liveEntries(access.project.id));
  return { latest: latest ?? null, changes: changes.filter((c) => c.status !== "unchanged"), summary: summarize(changes) };
}

export async function createSnapshot(actor: Actor, ref: string, input: { name: string; description?: string | null; tag?: string | null }) {
  const access = await requireProject(actor, ref, "project.write");
  const live = await liveEntries(access.project.id);
  if (!live.length) throw BadRequest("There are no files to version yet");
  const snapshot = await db.transaction(async (tx) => {
    const [latest] = await tx
      .select()
      .from(snapshots)
      .where(eq(snapshots.projectId, access.project.id))
      .orderBy(desc(snapshots.number))
      .limit(1);
    const prev = latest ? await entriesOf(latest.id, tx) : [];
    const summary = summarize(compareEntries(prev, live));
    if (latest && summary.added + summary.modified + summary.removed === 0)
      throw Conflict(`Nothing changed since Version ${latest.number}`);
    const number = await nextNumber(tx, access.project.id, "snapshot");
    const [s] = await tx
      .insert(snapshots)
      .values({
        projectId: access.project.id,
        number,
        name: input.name,
        description: input.description ?? null,
        tag: input.tag ?? null,
        fileCount: live.length,
        changeSummary: summary,
        createdBy: actor.id,
      })
      .returning();
    await tx.insert(snapshotEntries).values(live.map((e) => ({ snapshotId: s!.id, fileId: e.fileId, fileVersionId: e.fileVersionId, path: e.path })));
    return s!;
  });
  await indexDocument({
    organizationId: access.org.id,
    projectId: access.project.id,
    entityType: "snapshot",
    entityId: snapshot.id,
    ref: `V${snapshot.number}`,
    title: `Version ${snapshot.number} — ${snapshot.name}`,
    body: `${snapshot.description ?? ""} ${snapshot.tag ?? ""}`,
    url: `/project/${access.project.slug}/versions/${snapshot.number}`,
  });
  await emit({
    type: "snapshot.created",
    actorId: actor.id,
    organizationId: access.org.id,
    projectId: access.project.id,
    target: {
      type: "snapshot",
      id: snapshot.id,
      label: `Version ${snapshot.number}`,
      title: snapshot.name,
      url: `/project/${access.project.slug}/versions/${snapshot.number}`,
    },
    data: snapshot.changeSummary,
  });
  return snapshot;
}

async function getByNumber(projectId: string, number: number) {
  const [s] = await db
    .select({ snapshot: snapshots, author: userSummary })
    .from(snapshots)
    .leftJoin(users, eq(users.id, snapshots.createdBy))
    .where(and(eq(snapshots.projectId, projectId), eq(snapshots.number, number)));
  if (!s) throw NotFound("Version");
  return { ...s.snapshot, author: s.author?.id ? s.author : null };
}

export async function getSnapshot(actor: Actor, ref: string, number: number) {
  const access = await requireProject(actor, ref, "project.read");
  const snapshot = await getByNumber(access.project.id, number);
  const [prev] = await db
    .select()
    .from(snapshots)
    .where(and(eq(snapshots.projectId, access.project.id), eq(snapshots.number, number - 1)));
  const entries = await entriesOf(snapshot.id);
  const changes = compareEntries(prev ? await entriesOf(prev.id) : [], entries);
  return { access, snapshot, previous: prev ?? null, changes };
}

export async function compareSnapshots(actor: Actor, ref: string, a: number, b: number) {
  const access = await requireProject(actor, ref, "project.read");
  const [sa, sb] = await Promise.all([getByNumber(access.project.id, a), getByNumber(access.project.id, b)]);
  const changes = compareEntries(await entriesOf(sa.id), await entriesOf(sb.id));
  return { a: sa, b: sb, changes, summary: summarize(changes) };
}

/**
 * Restore the project's files to a version. Every affected file gets a *new*
 * revision (history is never rewritten); files that did not exist in the
 * version are moved to the trash and can be recovered.
 */
export async function restoreSnapshot(actor: Actor, ref: string, number: number) {
  const access = await requireProject(actor, ref, "project.write");
  const snapshot = await getByNumber(access.project.id, number);
  const target = await entriesOf(snapshot.id);
  const live = await liveEntries(access.project.id);
  const plan = compareEntries(live, target);
  let restored = 0;
  let removed = 0;
  await db.transaction(async (tx) => {
    const versionIds = target.map((t) => t.fileVersionId);
    const versions = versionIds.length ? await tx.select().from(fileVersions).where(inArray(fileVersions.id, versionIds)) : [];
    const vmap = new Map(versions.map((v) => [v.id, v]));
    for (const c of plan) {
      if (c.status === "unchanged") continue;
      if (c.status === "removed") {
        await tx.update(files).set({ deletedAt: new Date(), updatedBy: actor.id }).where(eq(files.id, c.fileId));
        removed++;
        continue;
      }
      const [file] = await tx.select().from(files).where(eq(files.id, c.fileId));
      if (!file) continue;
      if (file.deletedAt || file.path !== c.to!.path) {
        const [clash] = await tx
          .select({ id: files.id })
          .from(files)
          .where(and(eq(files.projectId, access.project.id), eq(files.path, c.to!.path), isNull(files.deletedAt)));
        if (clash && clash.id !== file.id) await tx.update(files).set({ deletedAt: new Date() }).where(eq(files.id, clash.id));
        const dir = c.to!.path.split("/").slice(0, -1).join("/");
        const folder = dir ? await ensureFolderPath(tx, access.project.id, dir, actor.id) : null;
        await tx
          .update(files)
          .set({ deletedAt: null, path: c.to!.path, name: c.to!.path.split("/").pop()!, folderId: folder?.id ?? null })
          .where(eq(files.id, file.id));
      }
      if (file.currentVersionId !== c.to!.versionId) {
        const [fresh] = await tx.select().from(files).where(eq(files.id, file.id));
        await createRevisionFrom(tx, fresh!, vmap.get(c.to!.versionId)!, actor.id, `Restored from Version ${snapshot.number}`);
      }
      restored++;
    }
  });
  await emit({
    type: "snapshot.restored",
    actorId: actor.id,
    organizationId: access.org.id,
    projectId: access.project.id,
    target: { type: "snapshot", id: snapshot.id, label: `Version ${snapshot.number}`, title: snapshot.name, url: `/project/${access.project.slug}/versions/${snapshot.number}` },
    data: { restored, removed },
  });
  return { restored, removed };
}

export async function deletedFileCount(projectId: string) {
  const rows = await db.select({ id: files.id }).from(files).where(and(eq(files.projectId, projectId), isNotNull(files.deletedAt)));
  return rows.length;
}
