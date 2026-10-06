import "server-only";
import { randomUUID, createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, isNotNull, isNull, like, or, sql } from "drizzle-orm";
import { diffLines } from "diff";
import type { z } from "zod";
import { db, type DbOrTx } from "@/server/db";
import { files, fileVersions, folders, organizations, uploads, users } from "@/server/db/schema";
import { requireProject, type Actor, type ProjectAccess } from "@/server/authz";
import { BadRequest, Conflict, NotFound, PayloadTooLarge, PlanLimit, UnsupportedMedia } from "@/server/http/errors";
import { storage } from "@/server/storage";
import { emit } from "@/server/events";
import { indexDocument, removeDocument } from "@/server/search";
import { extractMetadata, validateContent } from "@/server/files/inspect";
import { BLOCKED_EXTENSIONS, classify, extensionOf, isTextual, previewKind } from "@/lib/files";
import { PLANS, formatBytes } from "@/lib/plans";
import type { startUploadSchema, updateFileSchema } from "@/lib/validation";
import { userSummary } from "./shared";

export const MULTIPART_THRESHOLD = 64 * 1024 * 1024;
const MIN_PART = 16 * 1024 * 1024;
const FULL_READ_LIMIT = 25 * 1024 * 1024;
const TEXT_PREVIEW_LIMIT = 2 * 1024 * 1024;
const SEARCH_BODY_LIMIT = 200 * 1024;

function joinPath(parent: string | null | undefined, name: string) {
  return `${parent && parent !== "/" ? parent : ""}/${name}`;
}

async function getFolder(projectId: string, folderId: string | null | undefined, tx: DbOrTx = db) {
  if (!folderId) return null;
  const [f] = await tx.select().from(folders).where(and(eq(folders.id, folderId), eq(folders.projectId, projectId)));
  if (!f) throw NotFound("Folder");
  return f;
}

async function getLiveFile(projectId: string, fileId: string, tx: DbOrTx = db) {
  const [f] = await tx
    .select()
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.projectId, projectId), isNull(files.deletedAt)));
  if (!f) throw NotFound("File");
  return f;
}

async function pathTaken(projectId: string, path: string, exceptFileId?: string) {
  const [f] = await db
    .select({ id: files.id })
    .from(files)
    .where(and(eq(files.projectId, projectId), eq(files.path, path), isNull(files.deletedAt)));
  if (f && f.id !== exceptFileId) return true;
  const [d] = await db.select({ id: folders.id }).from(folders).where(and(eq(folders.projectId, projectId), eq(folders.path, path)));
  return Boolean(d);
}

// ─── Browsing ───────────────────────────────────────────────────────────────
export async function listDirectory(actor: Actor, ref: string, folderId: string | null) {
  const access = await requireProject(actor, ref, "project.read");
  const folder = await getFolder(access.project.id, folderId);
  const [subfolders, fileRows] = await Promise.all([
    db
      .select()
      .from(folders)
      .where(and(eq(folders.projectId, access.project.id), folderId ? eq(folders.parentId, folderId) : isNull(folders.parentId)))
      .orderBy(asc(folders.name)),
    db
      .select({ file: files, updatedBy: userSummary })
      .from(files)
      .leftJoin(users, eq(users.id, files.updatedBy))
      .where(
        and(
          eq(files.projectId, access.project.id),
          isNull(files.deletedAt),
          folderId ? eq(files.folderId, folderId) : isNull(files.folderId),
        ),
      )
      .orderBy(asc(files.name)),
  ]);
  const counts = subfolders.length
    ? await db
        .select({ folderId: files.folderId, n: sql<number>`count(*)::int`, size: sql<number>`coalesce(sum(${files.size}),0)::bigint` })
        .from(files)
        .where(and(inArray(files.folderId, subfolders.map((f) => f.id)), isNull(files.deletedAt)))
        .groupBy(files.folderId)
    : [];
  const countMap = new Map(counts.map((c) => [c.folderId, c]));
  return {
    access,
    folder,
    breadcrumbs: folder ? await breadcrumbs(access.project.id, folder.path) : [],
    folders: subfolders.map((f) => ({ ...f, fileCount: countMap.get(f.id)?.n ?? 0, size: Number(countMap.get(f.id)?.size ?? 0) })),
    files: fileRows.map((r) => ({ ...r.file, updatedByUser: r.updatedBy?.id ? r.updatedBy : null })),
  };
}

async function breadcrumbs(projectId: string, path: string) {
  const parts = path.split("/").filter(Boolean);
  const paths = parts.map((_, i) => `/${parts.slice(0, i + 1).join("/")}`);
  const rows = await db
    .select({ id: folders.id, name: folders.name, path: folders.path })
    .from(folders)
    .where(and(eq(folders.projectId, projectId), inArray(folders.path, paths)));
  return paths.map((p) => rows.find((r) => r.path === p)).filter(Boolean) as { id: string; name: string; path: string }[];
}

export async function folderTree(actor: Actor, ref: string) {
  const access = await requireProject(actor, ref, "project.read");
  return db
    .select({ id: folders.id, name: folders.name, path: folders.path, parentId: folders.parentId })
    .from(folders)
    .where(eq(folders.projectId, access.project.id))
    .orderBy(asc(folders.path));
}

export async function recentFiles(access: ProjectAccess, limit = 8) {
  return db
    .select({ file: files, user: userSummary })
    .from(files)
    .leftJoin(users, eq(users.id, files.updatedBy))
    .where(and(eq(files.projectId, access.project.id), isNull(files.deletedAt)))
    .orderBy(desc(files.updatedAt))
    .limit(limit);
}

// ─── Folders ────────────────────────────────────────────────────────────────
export async function createFolder(actor: Actor, ref: string, input: { name: string; parentId?: string | null }) {
  const access = await requireProject(actor, ref, "project.write");
  const parent = await getFolder(access.project.id, input.parentId);
  const path = joinPath(parent?.path, input.name);
  if (await pathTaken(access.project.id, path)) throw Conflict(`"${input.name}" already exists here`);
  const [folder] = await db
    .insert(folders)
    .values({ projectId: access.project.id, parentId: parent?.id ?? null, name: input.name, path, createdBy: actor.id })
    .returning();
  await emit({
    type: "folder.created",
    actorId: actor.id,
    organizationId: access.org.id,
    projectId: access.project.id,
    target: { type: "folder", id: folder!.id, label: path, url: `/project/${access.project.slug}/files?folder=${folder!.id}` },
  });
  return folder!;
}

/** Ensure a folder path exists (mkdir -p). Used by restores and seeding. */
export async function ensureFolderPath(tx: DbOrTx, projectId: string, path: string, actorId: string | null) {
  const parts = path.split("/").filter(Boolean);
  let parent: typeof folders.$inferSelect | null = null;
  for (let i = 0; i < parts.length; i++) {
    const p = `/${parts.slice(0, i + 1).join("/")}`;
    const [existing] = await tx.select().from(folders).where(and(eq(folders.projectId, projectId), eq(folders.path, p)));
    if (existing) {
      parent = existing;
      continue;
    }
    const created: (typeof folders.$inferSelect)[] = await tx
      .insert(folders)
      .values({ projectId, parentId: parent?.id ?? null, name: parts[i]!, path: p, createdBy: actorId })
      .returning();
    parent = created[0]!;
  }
  return parent;
}

export async function updateFolder(actor: Actor, ref: string, folderId: string, input: { name?: string; parentId?: string | null }) {
  const access = await requireProject(actor, ref, "project.write");
  const folder = await getFolder(access.project.id, folderId);
  if (!folder) throw NotFound("Folder");
  const newParentId = input.parentId === undefined ? folder.parentId : input.parentId;
  const parent = await getFolder(access.project.id, newParentId);
  if (parent && (parent.id === folder.id || parent.path.startsWith(`${folder.path}/`)))
    throw BadRequest("A folder cannot be moved inside itself");
  const name = input.name ?? folder.name;
  const newPath = joinPath(parent?.path, name);
  if (newPath === folder.path) return folder;
  if (await pathTaken(access.project.id, newPath)) throw Conflict(`"${name}" already exists there`);
  const old = folder.path;
  await db.transaction(async (tx) => {
    await tx.update(folders).set({ name, parentId: parent?.id ?? null, path: newPath }).where(eq(folders.id, folder.id));
    await tx
      .update(folders)
      .set({ path: sql`${newPath} || substring(${folders.path} from ${old.length + 1})` })
      .where(and(eq(folders.projectId, access.project.id), like(folders.path, `${old}/%`)));
    await tx
      .update(files)
      .set({ path: sql`${newPath} || substring(${files.path} from ${old.length + 1})` })
      .where(and(eq(files.projectId, access.project.id), like(files.path, `${old}/%`), isNull(files.deletedAt)));
  });
  await emit({
    type: input.name && input.name !== folder.name ? "folder.renamed" : "folder.moved",
    actorId: actor.id,
    organizationId: access.org.id,
    projectId: access.project.id,
    target: { type: "folder", id: folder.id, label: newPath, url: `/project/${access.project.slug}/files?folder=${folder.id}` },
    data: { from: old, to: newPath },
  });
  return { ...folder, name, path: newPath };
}

export async function deleteFolder(actor: Actor, ref: string, folderId: string) {
  const access = await requireProject(actor, ref, "project.write");
  const folder = await getFolder(access.project.id, folderId);
  if (!folder) throw NotFound("Folder");
  const affected = await db
    .select({ id: files.id })
    .from(files)
    .where(and(eq(files.projectId, access.project.id), like(files.path, `${folder.path}/%`), isNull(files.deletedAt)));
  await db.transaction(async (tx) => {
    if (affected.length)
      await tx.update(files).set({ deletedAt: new Date(), updatedBy: actor.id }).where(inArray(files.id, affected.map((a) => a.id)));
    await tx
      .delete(folders)
      .where(and(eq(folders.projectId, access.project.id), or(eq(folders.id, folder.id), like(folders.path, `${folder.path}/%`))));
  });
  for (const f of affected) await removeDocument("file", f.id);
  await emit({
    type: "folder.deleted",
    actorId: actor.id,
    organizationId: access.org.id,
    projectId: access.project.id,
    target: { type: "folder", id: folder.id, label: folder.path },
    data: { files: affected.length },
  });
}

// ─── Uploads ────────────────────────────────────────────────────────────────
export async function startUpload(actor: Actor, ref: string, input: z.infer<typeof startUploadSchema>) {
  const access = await requireProject(actor, ref, "project.write");
  const ext = extensionOf(input.fileName);
  if (BLOCKED_EXTENSIONS.has(ext)) throw UnsupportedMedia(`.${ext} files are not allowed`);
  const plan = PLANS[access.org.plan];
  if (input.size > plan.maxFileBytes)
    throw PayloadTooLarge(`Files on the ${plan.name} plan can be up to ${formatBytes(plan.maxFileBytes)}`);
  const [org] = await db.select({ used: organizations.storageUsedBytes }).from(organizations).where(eq(organizations.id, access.org.id));
  if ((org?.used ?? 0) + input.size > plan.storageBytes)
    throw PlanLimit(`Storage quota exceeded (${formatBytes(plan.storageBytes)} on the ${plan.name} plan)`);

  let targetFileId: string | null = null;
  let folderId: string | null = input.folderId ?? null;
  if (input.fileId) {
    const f = await getLiveFile(access.project.id, input.fileId);
    targetFileId = f.id;
    folderId = f.folderId;
  } else {
    const folder = await getFolder(access.project.id, folderId);
    const path = joinPath(folder?.path, input.fileName);
    const [existing] = await db
      .select({ id: files.id })
      .from(files)
      .where(and(eq(files.projectId, access.project.id), eq(files.path, path), isNull(files.deletedAt)));
    if (existing) targetFileId = existing.id; // same path → new revision
    else {
      const [dir] = await db.select({ id: folders.id }).from(folders).where(and(eq(folders.projectId, access.project.id), eq(folders.path, path)));
      if (dir) throw Conflict(`A folder named "${input.fileName}" already exists here`);
    }
  }

  const contentType = classify(input.fileName).mime;
  const storageKey = `org/${access.org.id}/project/${access.project.id}/${randomUUID()}`;
  const multipart = input.size > MULTIPART_THRESHOLD;
  const partSize = Math.max(MIN_PART, Math.ceil(input.size / 10000));
  const partCount = multipart ? Math.ceil(input.size / partSize) : null;
  const s = storage();
  const multipartUploadId = multipart ? await s.createMultipart(storageKey, contentType) : null;

  const [upload] = await db
    .insert(uploads)
    .values({
      projectId: access.project.id,
      userId: actor.id,
      storageKey,
      fileName: input.fileName,
      folderId,
      targetFileId,
      mimeType: contentType,
      size: input.size,
      multipartUploadId,
      partCount,
      message: input.message ?? null,
      expiresAt: new Date(Date.now() + 6 * 3600_000),
    })
    .returning();

  if (multipart) {
    const parts = [];
    for (let n = 1; n <= partCount!; n++) {
      const p = await s.presignPart(storageKey, multipartUploadId!, n, 6 * 3600);
      parts.push({ partNumber: n, url: p.url });
    }
    return { uploadId: upload!.id, mode: "multipart" as const, partSize, parts, isRevision: Boolean(targetFileId) };
  }
  const put = await s.presignPut(storageKey, { contentType, contentLength: input.size, expiresIn: 1800 });
  return { uploadId: upload!.id, mode: "single" as const, url: put.url, headers: put.headers, isRevision: Boolean(targetFileId) };
}

export async function completeUpload(actor: Actor, ref: string, uploadId: string, parts?: { partNumber: number; etag: string }[]) {
  const access = await requireProject(actor, ref, "project.write");
  const [upload] = await db
    .select()
    .from(uploads)
    .where(and(eq(uploads.id, uploadId), eq(uploads.projectId, access.project.id), eq(uploads.userId, actor.id)));
  if (!upload || upload.status !== "pending") throw NotFound("Upload");
  if (upload.expiresAt < new Date()) throw BadRequest("Upload session expired");
  const s = storage();

  if (upload.multipartUploadId) {
    if (!parts?.length || parts.length !== upload.partCount) throw BadRequest("All parts must be uploaded");
    await s.completeMultipart(upload.storageKey, upload.multipartUploadId, parts);
  }
  const head = await s.head(upload.storageKey);
  if (!head) throw BadRequest("Upload has not reached storage yet");
  const reject = async (msg: string, status: "size" | "content") => {
    await s.delete(upload.storageKey).catch(() => {});
    await db.update(uploads).set({ status: "aborted" }).where(eq(uploads.id, upload.id));
    throw status === "size" ? BadRequest(msg) : UnsupportedMedia(msg);
  };
  if (head.size !== upload.size) await reject("Uploaded size does not match the declared size", "size");

  const full = head.size <= FULL_READ_LIMIT ? (head.size ? await s.getObject(upload.storageKey) : Buffer.alloc(0)) : null;
  const sample = full ?? (await s.getRange(upload.storageKey, 0, 64 * 1024 - 1));
  const problem = validateContent(upload.fileName, sample.subarray(0, 4096));
  if (problem) await reject(problem, "content");

  const { kind } = classify(upload.fileName);
  const metadata = extractMetadata(upload.fileName, sample, head.size);
  const checksum = full ? createHash("sha256").update(full).digest("hex") : null;

  const result = await db.transaction(async (tx) => {
    let file: typeof files.$inferSelect;
    let previousUploader: string | null = null;
    if (upload.targetFileId) {
      file = await getLiveFile(access.project.id, upload.targetFileId, tx);
      previousUploader = file.updatedBy;
      if (checksum) {
        const [cur] = await tx.select({ checksum: fileVersions.checksum }).from(fileVersions).where(eq(fileVersions.id, file.currentVersionId!));
        if (cur?.checksum === checksum) {
          // Identical content — don't create a meaningless revision.
          await tx.update(uploads).set({ status: "aborted" }).where(eq(uploads.id, upload.id));
          return { file, version: null, unchanged: true, previousUploader };
        }
      }
    } else {
      const folder = await getFolder(access.project.id, upload.folderId, tx).catch(() => null);
      const [created] = await tx
        .insert(files)
        .values({
          projectId: access.project.id,
          folderId: folder?.id ?? null,
          name: upload.fileName,
          path: joinPath(folder?.path, upload.fileName),
          kind,
          mimeType: upload.mimeType,
          size: head.size,
          createdBy: actor.id,
          updatedBy: actor.id,
        })
        .returning();
      file = created!;
    }
    const number = file.versionCount + 1;
    const [version] = await tx
      .insert(fileVersions)
      .values({
        fileId: file.id,
        projectId: access.project.id,
        number,
        storageKey: upload.storageKey,
        size: head.size,
        mimeType: upload.mimeType,
        checksum,
        message: upload.message ?? (number === 1 ? "Initial upload" : null),
        metadata,
        uploadedBy: actor.id,
      })
      .returning();
    const [updated] = await tx
      .update(files)
      .set({ currentVersionId: version!.id, versionCount: number, size: head.size, mimeType: upload.mimeType, kind, updatedBy: actor.id, updatedAt: new Date() })
      .where(eq(files.id, file.id))
      .returning();
    await tx.update(uploads).set({ status: "completed" }).where(eq(uploads.id, upload.id));
    await tx.execute(sql`update organizations set storage_used_bytes = storage_used_bytes + ${head.size} where id = ${access.org.id}`);
    return { file: updated!, version: version!, unchanged: false, previousUploader };
  });

  if (result.unchanged) {
    await s.delete(upload.storageKey).catch(() => {});
    return { file: result.file, version: null, unchanged: true };
  }

  await indexFile(access, result.file, full && isTextual(upload.fileName) && full.length <= SEARCH_BODY_LIMIT ? full.toString("utf8") : null);
  const isRevision = result.version!.number > 1;
  await emit({
    type: isRevision ? "file.revised" : "file.uploaded",
    actorId: actor.id,
    organizationId: access.org.id,
    projectId: access.project.id,
    target: {
      type: "file",
      id: result.file.id,
      label: result.file.name,
      title: result.file.path,
      url: `/project/${access.project.slug}/files/${result.file.id}`,
    },
    data: { version: result.version!.number, size: head.size, message: result.version!.message },
    notify:
      isRevision && result.previousUploader
        ? [{ userId: result.previousUploader, type: "file.updated", title: `${result.file.name} updated to v${result.version!.number}`, body: result.version!.message }]
        : [],
  });
  return { file: result.file, version: result.version, unchanged: false };
}

export async function abortUpload(actor: Actor, ref: string, uploadId: string) {
  const access = await requireProject(actor, ref, "project.write");
  const [upload] = await db
    .select()
    .from(uploads)
    .where(and(eq(uploads.id, uploadId), eq(uploads.projectId, access.project.id), eq(uploads.userId, actor.id)));
  if (!upload || upload.status !== "pending") return;
  if (upload.multipartUploadId) await storage().abortMultipart(upload.storageKey, upload.multipartUploadId).catch(() => {});
  else await storage().delete(upload.storageKey).catch(() => {});
  await db.update(uploads).set({ status: "aborted" }).where(eq(uploads.id, upload.id));
}

/** Server-side write (seed data, generated artifacts). Goes through the same validation & versioning. */
export async function putFileFromServer(
  actor: Actor,
  ref: string,
  input: { path: string; content: Buffer; message?: string; createdAt?: Date },
) {
  const access = await requireProject(actor, ref, "project.write");
  const parts = input.path.split("/").filter(Boolean);
  const name = parts.pop()!;
  const folder = parts.length ? await ensureFolderPath(db, access.project.id, `/${parts.join("/")}`, actor.id) : null;
  const up = await startUpload(actor, ref, { fileName: name, size: input.content.length, folderId: folder?.id ?? null, message: input.message ?? null });
  const [row] = await db.select().from(uploads).where(eq(uploads.id, up.uploadId));
  await storage().putObject(row!.storageKey, input.content, row!.mimeType);
  const res = await completeUpload(actor, ref, up.uploadId);
  if (input.createdAt && res.version) {
    await db.update(fileVersions).set({ createdAt: input.createdAt }).where(eq(fileVersions.id, res.version.id));
    await db.update(files).set({ updatedAt: input.createdAt }).where(eq(files.id, res.file.id));
  }
  return res;
}

async function indexFile(access: ProjectAccess, file: typeof files.$inferSelect, text: string | null) {
  await indexDocument({
    organizationId: access.org.id,
    projectId: access.project.id,
    entityType: "file",
    entityId: file.id,
    title: file.name,
    body: `${file.path} ${file.description ?? ""} ${text ?? ""}`,
    url: `/project/${access.project.slug}/files/${file.id}`,
    meta: { path: file.path, kind: file.kind, size: file.size, version: file.versionCount },
  });
}

// ─── File detail, download, preview, diff ───────────────────────────────────
export async function getFileDetail(actor: Actor, ref: string, fileId: string) {
  const access = await requireProject(actor, ref, "project.read");
  const file = await getLiveFile(access.project.id, fileId);
  const versions = await db
    .select({ version: fileVersions, uploader: userSummary })
    .from(fileVersions)
    .leftJoin(users, eq(users.id, fileVersions.uploadedBy))
    .where(eq(fileVersions.fileId, file.id))
    .orderBy(desc(fileVersions.number));
  const folder = file.folderId ? await getFolder(access.project.id, file.folderId).catch(() => null) : null;
  return {
    access,
    file,
    folder,
    breadcrumbs: folder ? await breadcrumbs(access.project.id, folder.path) : [],
    versions: versions.map((v) => ({ ...v.version, uploader: v.uploader?.id ? v.uploader : null })),
    preview: previewKind(file.name, file.mimeType),
  };
}

async function resolveVersion(projectId: string, fileId: string, versionId?: string | null) {
  const [file] = await db.select().from(files).where(and(eq(files.id, fileId), eq(files.projectId, projectId)));
  if (!file) throw NotFound("File");
  const vid = versionId ?? file.currentVersionId;
  if (!vid) throw NotFound("File version");
  const [version] = await db.select().from(fileVersions).where(and(eq(fileVersions.id, vid), eq(fileVersions.fileId, file.id)));
  if (!version) throw NotFound("File version");
  return { file, version };
}

const INLINE_SAFE = new Set(["image", "video", "pdf"]);

export async function downloadUrl(actor: Actor, ref: string, fileId: string, opts: { versionId?: string | null; inline?: boolean }) {
  const access = await requireProject(actor, ref, "project.read");
  const { file, version } = await resolveVersion(access.project.id, fileId, opts.versionId);
  const kind = previewKind(file.name, version.mimeType);
  const inline = Boolean(opts.inline) && INLINE_SAFE.has(kind) && extensionOf(file.name) !== "svg";
  const name = version.number === file.versionCount ? file.name : file.name.replace(/(\.[^.]+)?$/, `.v${version.number}$1`);
  return storage().presignGet(version.storageKey, {
    filename: name,
    contentType: inline ? version.mimeType : kind === "image" ? version.mimeType : "application/octet-stream",
    disposition: inline ? "inline" : "attachment",
    expiresIn: 300,
  });
}

export async function readText(actor: Actor, ref: string, fileId: string, versionId?: string | null) {
  const access = await requireProject(actor, ref, "project.read");
  const { file, version } = await resolveVersion(access.project.id, fileId, versionId);
  if (!isTextual(file.name)) throw BadRequest("This file type has no text preview");
  if (version.size > TEXT_PREVIEW_LIMIT) return { truncated: true, text: (await storage().getRange(version.storageKey, 0, TEXT_PREVIEW_LIMIT - 1)).toString("utf8") };
  return { truncated: false, text: version.size ? (await storage().getObject(version.storageKey)).toString("utf8") : "" };
}

export async function readBinary(actor: Actor, ref: string, fileId: string, versionId?: string | null, maxBytes = 50 * 1024 * 1024) {
  const access = await requireProject(actor, ref, "project.read");
  const { version } = await resolveVersion(access.project.id, fileId, versionId);
  if (version.size > maxBytes) throw PayloadTooLarge("File too large to preview");
  return storage().getObject(version.storageKey);
}

export type DiffResult =
  | {
      mode: "text";
      a: { number: number };
      b: { number: number };
      hunks: { added?: boolean; removed?: boolean; value: string; count?: number }[];
      stats: { added: number; removed: number };
    }
  | {
      mode: "metadata";
      a: { number: number };
      b: { number: number };
      rows: { field: string; a: string; b: string; changed: boolean }[];
    };

export async function diffVersions(actor: Actor, ref: string, fileId: string, aId: string, bId: string): Promise<DiffResult> {
  const access = await requireProject(actor, ref, "project.read");
  const a = await resolveVersion(access.project.id, fileId, aId);
  const b = await resolveVersion(access.project.id, fileId, bId);
  if (isTextual(a.file.name) && a.version.size <= TEXT_PREVIEW_LIMIT && b.version.size <= TEXT_PREVIEW_LIMIT) {
    const [ta, tb] = await Promise.all([
      a.version.size ? storage().getObject(a.version.storageKey) : Buffer.alloc(0),
      b.version.size ? storage().getObject(b.version.storageKey) : Buffer.alloc(0),
    ]);
    const hunks = diffLines(ta.toString("utf8"), tb.toString("utf8"));
    const stats = hunks.reduce(
      (s, h) => ({ added: s.added + (h.added ? (h.count ?? 0) : 0), removed: s.removed + (h.removed ? (h.count ?? 0) : 0) }),
      { added: 0, removed: 0 },
    );
    return { mode: "text", a: { number: a.version.number }, b: { number: b.version.number }, hunks, stats };
  }
  // Binary / CAD: compare stored metadata. A CAD-aware differ can replace this per file kind.
  const fmt = (v: unknown) => (v === undefined || v === null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
  const base: [string, unknown, unknown][] = [
    ["Size", formatBytes(a.version.size), formatBytes(b.version.size)],
    ["SHA-256", a.version.checksum?.slice(0, 16) ?? "—", b.version.checksum?.slice(0, 16) ?? "—"],
    ["MIME type", a.version.mimeType, b.version.mimeType],
    ["Uploaded", a.version.createdAt.toISOString(), b.version.createdAt.toISOString()],
  ];
  const keys = [...new Set([...Object.keys(a.version.metadata), ...Object.keys(b.version.metadata)])].sort();
  for (const k of keys) base.push([k, a.version.metadata[k], b.version.metadata[k]]);
  return {
    mode: "metadata",
    a: { number: a.version.number },
    b: { number: b.version.number },
    rows: base.map(([field, va, vb]) => ({ field, a: fmt(va), b: fmt(vb), changed: fmt(va) !== fmt(vb) && field !== "Uploaded" })),
  };
}

// ─── Mutations ──────────────────────────────────────────────────────────────
export async function updateFile(actor: Actor, ref: string, fileId: string, input: z.infer<typeof updateFileSchema>) {
  const access = await requireProject(actor, ref, "project.write");
  const file = await getLiveFile(access.project.id, fileId);
  const folderId = input.folderId === undefined ? file.folderId : input.folderId;
  const folder = await getFolder(access.project.id, folderId);
  const name = input.name ?? file.name;
  if (input.name && extensionOf(input.name) !== extensionOf(file.name) && BLOCKED_EXTENSIONS.has(extensionOf(input.name)))
    throw UnsupportedMedia("That file extension is not allowed");
  const path = joinPath(folder?.path, name);
  if (path !== file.path && (await pathTaken(access.project.id, path, file.id))) throw Conflict(`"${name}" already exists there`);
  const [updated] = await db
    .update(files)
    .set({
      name,
      path,
      folderId: folder?.id ?? null,
      kind: classify(name).kind,
      description: input.description === undefined ? file.description : input.description,
      updatedAt: new Date(),
    })
    .where(eq(files.id, file.id))
    .returning();
  await indexFile(access, updated!, null);
  if (path !== file.path) {
    await emit({
      type: name !== file.name ? "file.renamed" : "file.moved",
      actorId: actor.id,
      organizationId: access.org.id,
      projectId: access.project.id,
      target: { type: "file", id: file.id, label: name, title: path, url: `/project/${access.project.slug}/files/${file.id}` },
      data: { from: file.path, to: path },
    });
  }
  return updated!;
}

export async function deleteFile(actor: Actor, ref: string, fileId: string) {
  const access = await requireProject(actor, ref, "project.write");
  const file = await getLiveFile(access.project.id, fileId);
  await db.update(files).set({ deletedAt: new Date(), updatedBy: actor.id }).where(eq(files.id, file.id));
  await removeDocument("file", file.id);
  await emit({
    type: "file.deleted",
    actorId: actor.id,
    organizationId: access.org.id,
    projectId: access.project.id,
    target: { type: "file", id: file.id, label: file.name, title: file.path },
  });
}

export async function listDeletedFiles(actor: Actor, ref: string) {
  const access = await requireProject(actor, ref, "project.read");
  return db
    .select({ file: files, user: userSummary })
    .from(files)
    .leftJoin(users, eq(users.id, files.updatedBy))
    .where(and(eq(files.projectId, access.project.id), isNotNull(files.deletedAt)))
    .orderBy(desc(files.deletedAt))
    .limit(100);
}

export async function undeleteFile(actor: Actor, ref: string, fileId: string) {
  const access = await requireProject(actor, ref, "project.write");
  const [file] = await db
    .select()
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.projectId, access.project.id), isNotNull(files.deletedAt)));
  if (!file) throw NotFound("File");
  if (await pathTaken(access.project.id, file.path)) throw Conflict(`Another file already exists at ${file.path}`);
  const dir = file.path.split("/").slice(0, -1).join("/");
  const folder = dir ? await ensureFolderPath(db, access.project.id, dir, actor.id) : null;
  const [restored] = await db.update(files).set({ deletedAt: null, folderId: folder?.id ?? null }).where(eq(files.id, file.id)).returning();
  await indexFile(access, restored!, null);
  await emit({
    type: "file.restored",
    actorId: actor.id,
    organizationId: access.org.id,
    projectId: access.project.id,
    target: { type: "file", id: file.id, label: file.name, url: `/project/${access.project.slug}/files/${file.id}` },
  });
  return restored!;
}

/** Restore an old revision by creating a new head revision that points at the same object. */
export async function restoreVersion(actor: Actor, ref: string, fileId: string, versionId: string, message?: string | null) {
  const access = await requireProject(actor, ref, "project.write");
  const file = await getLiveFile(access.project.id, fileId);
  const [source] = await db.select().from(fileVersions).where(and(eq(fileVersions.id, versionId), eq(fileVersions.fileId, file.id)));
  if (!source) throw NotFound("File version");
  if (source.id === file.currentVersionId) throw BadRequest("That revision is already current");
  const version = await createRevisionFrom(db, file, source, actor.id, message ?? `Restored v${source.number}`);
  await emit({
    type: "file.version_restored",
    actorId: actor.id,
    organizationId: access.org.id,
    projectId: access.project.id,
    target: { type: "file", id: file.id, label: file.name, url: `/project/${access.project.slug}/files/${file.id}` },
    data: { restored: source.number, version: version.number },
  });
  return version;
}

export async function createRevisionFrom(
  tx: DbOrTx,
  file: typeof files.$inferSelect,
  source: typeof fileVersions.$inferSelect,
  actorId: string,
  message: string,
) {
  const number = file.versionCount + 1;
  const [version] = await tx
    .insert(fileVersions)
    .values({
      fileId: file.id,
      projectId: file.projectId,
      number,
      storageKey: source.storageKey,
      size: source.size,
      mimeType: source.mimeType,
      checksum: source.checksum,
      metadata: source.metadata,
      message,
      restoredFromVersionId: source.id,
      uploadedBy: actorId,
    })
    .returning();
  await tx
    .update(files)
    .set({ currentVersionId: version!.id, versionCount: number, size: source.size, updatedBy: actorId, updatedAt: new Date() })
    .where(eq(files.id, file.id));
  return version!;
}

export async function filesByIds(projectId: string, ids: string[]) {
  if (!ids.length) return [];
  return db
    .select({ id: files.id, name: files.name, path: files.path, kind: files.kind, size: files.size })
    .from(files)
    .where(and(eq(files.projectId, projectId), inArray(files.id, ids), isNull(files.deletedAt)));
}
