import "server-only";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/server/db";
import { changes, commentReactions, comments, decisions, files, issues, links, notebookEntries, releases, requirements, snapshots, tasks, tests, users } from "@/server/db/schema";
import { requireProject, type Actor, type ProjectAccess } from "@/server/authz";
import { Forbidden, NotFound } from "@/server/http/errors";
import { emit } from "@/server/events";
import type { EntityType } from "@/server/events/types";
import type { createCommentSchema } from "@/lib/validation";
import { describeEntities } from "./links";
import { addLink, linkMentions, resolveMentions, userSummary } from "./shared";
import { filesByIds } from "./files";

/** People who "own" a commentable entity (creator, assignee, owner) — they hear about new comments. */
async function owners(type: EntityType, id: string): Promise<string[]> {
  const pick = (...ids: (string | null | undefined)[]) => ids.filter(Boolean) as string[];
  switch (type) {
    case "issue": {
      const [r] = await db.select().from(issues).where(eq(issues.id, id));
      return pick(r?.createdBy, r?.assigneeId);
    }
    case "task": {
      const [r] = await db.select().from(tasks).where(eq(tasks.id, id));
      return pick(r?.createdBy, r?.assigneeId);
    }
    case "requirement": {
      const [r] = await db.select().from(requirements).where(eq(requirements.id, id));
      return pick(r?.ownerId, r?.createdBy);
    }
    case "test": {
      const [r] = await db.select().from(tests).where(eq(tests.id, id));
      return pick(r?.ownerId, r?.createdBy);
    }
    case "decision": {
      const [r] = await db.select().from(decisions).where(eq(decisions.id, id));
      return pick(r?.ownerId, r?.createdBy);
    }
    case "change": {
      const [r] = await db.select().from(changes).where(eq(changes.id, id));
      return pick(r?.authorId);
    }
    case "notebook_entry": {
      const [r] = await db.select().from(notebookEntries).where(eq(notebookEntries.id, id));
      return pick(r?.authorId);
    }
    case "release": {
      const [r] = await db.select().from(releases).where(eq(releases.id, id));
      return pick(r?.createdBy);
    }
    case "file": {
      const [r] = await db.select().from(files).where(eq(files.id, id));
      return pick(r?.createdBy, r?.updatedBy);
    }
    case "snapshot": {
      const [r] = await db.select().from(snapshots).where(eq(snapshots.id, id));
      return pick(r?.createdBy);
    }
    default:
      return [];
  }
}

async function requireTarget(access: ProjectAccess, type: EntityType, id: string) {
  const d = await describeEntities(access.project.id, access.project.slug, [{ type, id }]);
  const t = d.get(`${type}:${id}`);
  if (!t) throw NotFound("Comment target");
  return t;
}

export async function listComments(actor: Actor, ref: string, type: EntityType, id: string) {
  const access = await requireProject(actor, ref, "project.read");
  await requireTarget(access, type, id);
  const rows = await db
    .select({ c: comments, author: userSummary })
    .from(comments)
    .leftJoin(users, eq(users.id, comments.authorId))
    .where(and(eq(comments.projectId, access.project.id), eq(comments.targetType, type), eq(comments.targetId, id)))
    .orderBy(asc(comments.createdAt));
  const ids = rows.map((r) => r.c.id);
  const [reactions, attachmentLinks] = await Promise.all([
    ids.length ? db.select().from(commentReactions).where(inArray(commentReactions.commentId, ids)) : [],
    ids.length ? db.select().from(links).where(and(eq(links.sourceType, "comment"), inArray(links.sourceId, ids), eq(links.targetType, "file"))) : [],
  ]);
  const fileRows = await filesByIds(access.project.id, attachmentLinks.map((l) => l.targetId));
  const fmap = new Map(fileRows.map((f) => [f.id, f]));
  return rows.map((r) => {
    const rs = reactions.filter((x) => x.commentId === r.c.id);
    const grouped = [...new Set(rs.map((x) => x.emoji))].map((emoji) => ({
      emoji,
      count: rs.filter((x) => x.emoji === emoji).length,
      mine: rs.some((x) => x.emoji === emoji && x.userId === actor.id),
    }));
    const deleted = Boolean(r.c.deletedAt);
    return {
      id: r.c.id,
      parentId: r.c.parentId,
      body: deleted ? "" : r.c.body,
      deleted,
      editedAt: r.c.editedAt,
      createdAt: r.c.createdAt,
      author: r.author?.id ? r.author : null,
      reactions: deleted ? [] : grouped,
      attachments: deleted ? [] : (attachmentLinks.filter((l) => l.sourceId === r.c.id).map((l) => fmap.get(l.targetId)).filter(Boolean) as typeof fileRows),
      canEdit: !deleted && r.c.authorId === actor.id,
      canDelete: !deleted && (r.c.authorId === actor.id || access.role === "admin"),
    };
  });
}

export async function createComment(actor: Actor & { displayName: string }, ref: string, input: z.infer<typeof createCommentSchema>) {
  const access = await requireProject(actor, ref, "project.comment");
  const target = await requireTarget(access, input.targetType, input.targetId);
  let parentAuthor: string | null = null;
  if (input.parentId) {
    const [p] = await db.select().from(comments).where(and(eq(comments.id, input.parentId), eq(comments.targetId, input.targetId), isNull(comments.parentId)));
    if (!p) throw NotFound("Parent comment");
    parentAuthor = p.authorId;
  }
  if (input.attachments?.length) {
    const ok = await filesByIds(access.project.id, input.attachments);
    if (ok.length !== new Set(input.attachments).size) throw NotFound("Attachment");
  }
  const c = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(comments)
      .values({ projectId: access.project.id, targetType: input.targetType, targetId: input.targetId, parentId: input.parentId ?? null, authorId: actor.id, body: input.body })
      .returning();
    for (const fid of input.attachments ?? [])
      await addLink(tx, { projectId: access.project.id, sourceType: "comment", sourceId: row!.id, targetType: "file", targetId: fid, relation: "attachment", createdBy: actor.id });
    // References in comments link the *target* to what is mentioned, so traceability follows discussion.
    if (access.role !== "viewer") await linkMentions(tx, access.project.id, { type: input.targetType, id: input.targetId }, input.body, actor.id);
    return row!;
  });
  const mentions = await resolveMentions(access, input.body);
  const ownerIds = await owners(input.targetType, input.targetId);
  await emit({
    type: "comment.created",
    actorId: actor.id,
    organizationId: access.org.id,
    projectId: access.project.id,
    target: { type: input.targetType, id: input.targetId, label: target.ref, title: target.title, url: `${target.url}#comment-${c.id}` },
    data: { excerpt: input.body.slice(0, 140) },
    notify: [
      ...mentions.map((m) => ({ userId: m.id, type: "comment.mention", title: `${actor.displayName} mentioned you on ${target.ref}`, body: input.body.slice(0, 200) })),
      ...[...ownerIds, ...(parentAuthor ? [parentAuthor] : [])]
        .filter((u) => !mentions.some((m) => m.id === u))
        .map((u) => ({ userId: u, type: "comment.reply", title: `${actor.displayName} commented on ${target.ref}`, body: input.body.slice(0, 200) })),
    ],
  });
  return c;
}

async function loadOwn(access: ProjectAccess, actor: Actor, id: string) {
  const [c] = await db.select().from(comments).where(and(eq(comments.id, id), eq(comments.projectId, access.project.id), isNull(comments.deletedAt)));
  if (!c) throw NotFound("Comment");
  return c;
}

export async function updateComment(actor: Actor, ref: string, id: string, body: string) {
  const access = await requireProject(actor, ref, "project.comment");
  const c = await loadOwn(access, actor, id);
  if (c.authorId !== actor.id) throw Forbidden("You can only edit your own comments");
  const [u] = await db.update(comments).set({ body, editedAt: new Date() }).where(eq(comments.id, id)).returning();
  return u!;
}

export async function deleteComment(actor: Actor, ref: string, id: string) {
  const access = await requireProject(actor, ref, "project.comment");
  const c = await loadOwn(access, actor, id);
  if (c.authorId !== actor.id && access.role !== "admin") throw Forbidden();
  // Soft delete keeps thread structure intact.
  await db.update(comments).set({ deletedAt: new Date(), body: "" }).where(eq(comments.id, id));
}

export async function toggleReaction(actor: Actor, ref: string, id: string, emoji: string) {
  const access = await requireProject(actor, ref, "project.comment");
  await loadOwn(access, actor, id);
  const [existing] = await db
    .select()
    .from(commentReactions)
    .where(and(eq(commentReactions.commentId, id), eq(commentReactions.userId, actor.id), eq(commentReactions.emoji, emoji)));
  if (existing)
    await db.delete(commentReactions).where(and(eq(commentReactions.commentId, id), eq(commentReactions.userId, actor.id), eq(commentReactions.emoji, emoji)));
  else await db.insert(commentReactions).values({ commentId: id, userId: actor.id, emoji });
  return { active: !existing };
}
