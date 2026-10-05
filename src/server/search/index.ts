import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, type DbOrTx } from "@/server/db";
import { organizationMembers, searchDocuments, users } from "@/server/db/schema";
import { accessibleProjectIds } from "@/server/authz";
import type { EntityType } from "@/server/events/types";

/**
 * Search index. Every searchable entity is projected into `search_documents`
 * (PostgreSQL full-text + trigram). Writes happen synchronously in services so
 * results are immediately consistent. Reads are always scoped to projects the
 * caller can access — the index itself is never queried unscoped.
 */
export type IndexInput = {
  organizationId: string;
  projectId: string | null;
  entityType: EntityType;
  entityId: string;
  ref?: string | null;
  title: string;
  body?: string | null;
  url: string;
  meta?: Record<string, unknown>;
};

export async function indexDocument(doc: IndexInput, tx: DbOrTx = db) {
  const values = {
    organizationId: doc.organizationId,
    projectId: doc.projectId,
    entityType: doc.entityType,
    entityId: doc.entityId,
    ref: doc.ref ?? null,
    title: doc.title.slice(0, 500),
    body: (doc.body ?? "").slice(0, 50000),
    url: doc.url,
    meta: doc.meta ?? {},
  };
  await tx
    .insert(searchDocuments)
    .values(values)
    .onConflictDoUpdate({ target: [searchDocuments.entityType, searchDocuments.entityId], set: values });
}

export async function removeDocument(entityType: EntityType, entityId: string, tx: DbOrTx = db) {
  await tx
    .delete(searchDocuments)
    .where(and(eq(searchDocuments.entityType, entityType), eq(searchDocuments.entityId, entityId)));
}

export type SearchHit = {
  id: string;
  entityType: EntityType;
  entityId: string;
  ref: string | null;
  title: string;
  snippet: string | null;
  url: string;
  projectId: string | null;
  meta: Record<string, unknown>;
  score: number;
};

function prefixQuery(q: string): string | null {
  const tokens = q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s.-]/gu, " ")
    .split(/[\s.-]+/)
    .filter(Boolean)
    .slice(0, 8);
  if (!tokens.length) return null;
  return tokens.map((t) => `${t}:*`).join(" & ");
}

export async function search(
  userId: string,
  q: string,
  opts: { projectId?: string; types?: EntityType[]; limit?: number } = {},
): Promise<{ hits: SearchHit[]; people: { id: string; username: string; displayName: string; avatarUrl: string | null }[] }> {
  const query = q.trim().slice(0, 200);
  if (!query) return { hits: [], people: [] };
  let projectIds = await accessibleProjectIds(userId);
  if (opts.projectId) projectIds = projectIds.filter((p) => p === opts.projectId);
  const limit = Math.min(opts.limit ?? 30, 100);
  const tsq = prefixQuery(query);
  const like = `%${query.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;

  const hits = projectIds.length
    ? await db.execute<{
        id: string;
        entity_type: EntityType;
        entity_id: string;
        ref: string | null;
        title: string;
        snippet: string | null;
        url: string;
        project_id: string | null;
        meta: Record<string, unknown>;
        score: number;
      }>(sql`
        select d.id, d.entity_type, d.entity_id, d.ref, d.title, d.url, d.project_id, d.meta,
          case when ${tsq}::text is null then null else
            ts_headline('english', left(d.body, 4000), to_tsquery('english', ${tsq}),
              'MaxFragments=1, MaxWords=18, MinWords=6, StartSel=<<, StopSel=>>')
          end as snippet,
          (case when ${tsq}::text is null then 0 else ts_rank(d.tsv, to_tsquery('english', ${tsq})) end) * 2
            + similarity(d.title, ${query})
            + (case when d.ref ilike ${query} then 5 else 0 end)
            + (case when d.title ilike ${like} then 0.5 else 0 end) as score
        from search_documents d
        where d.project_id in ${projectIds}
          ${opts.types?.length ? sql`and d.entity_type in ${opts.types}` : sql``}
          and (
            (${tsq}::text is not null and d.tsv @@ to_tsquery('english', ${tsq}))
            or d.title ilike ${like}
            or d.ref ilike ${like}
            or d.title % ${query}
          )
        order by score desc, d.updated_at desc
        limit ${limit}
      `)
    : [];

  // People: only users who share an organization with the caller.
  const people = opts.types && !opts.types.includes("user")
    ? []
    : await db
        .selectDistinct({ id: users.id, username: users.username, displayName: users.displayName, avatarUrl: users.avatarUrl })
        .from(users)
        .innerJoin(organizationMembers, eq(organizationMembers.userId, users.id))
        .where(
          and(
            inArray(
              organizationMembers.organizationId,
              db.select({ id: organizationMembers.organizationId }).from(organizationMembers).where(eq(organizationMembers.userId, userId)),
            ),
            sql`(${users.username} ilike ${like} or ${users.displayName} ilike ${like})`,
          ),
        )
        .limit(5);

  return {
    hits: hits.map((h) => ({
      id: h.id,
      entityType: h.entity_type,
      entityId: h.entity_id,
      ref: h.ref,
      title: h.title,
      snippet: h.snippet,
      url: h.url,
      projectId: h.project_id,
      meta: h.meta,
      score: Number(h.score),
    })),
    people: opts.projectId ? [] : people,
  };
}
