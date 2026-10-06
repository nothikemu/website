import "server-only";
import { and, count, desc, eq, sql } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/server/db";
import { fileVersions, folders, labels, organizationMembers, projectMembers, projects, users } from "@/server/db/schema";
import {
  accessibleProjectsCondition,
  requireOrg,
  requireProject,
  type Actor,
  type ProjectRole,
} from "@/server/authz";
import { BadRequest, Conflict, NotFound, PlanLimit } from "@/server/http/errors";
import { emit } from "@/server/events";
import { indexDocument } from "@/server/search";
import { storage } from "@/server/storage";
import { logger } from "@/server/observability/logger";
import { PLANS } from "@/lib/plans";
import { RESERVED_SLUGS, type createProjectSchema, type updateProjectSchema } from "@/lib/validation";
import { audit } from "./audit";
import { projectPeople, userSummary } from "./shared";

export const DEFAULT_FOLDERS = ["cad", "electronics", "firmware", "simulation", "documentation", "tests", "media"];
export const DEFAULT_LABELS: [string, string][] = [
  ["mechanical", "#d9822b"],
  ["electrical", "#d4b106"],
  ["firmware", "#3fb68b"],
  ["software", "#4c8bf5"],
  ["safety", "#e5484d"],
  ["testing", "#a371f7"],
  ["documentation", "#8a8f98"],
];

function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

async function availableSlug(base: string) {
  let s = slugify(base) || "project";
  if (s.length < 2 || RESERVED_SLUGS.has(s)) s = `${s}-project`;
  let candidate = s;
  for (let i = 2; ; i++) {
    const [row] = await db.select({ id: projects.id }).from(projects).where(eq(projects.slug, candidate));
    if (!row) return candidate;
    candidate = `${s}-${i}`;
  }
}

export async function listProjects(actor: Actor, orgRef?: string) {
  let orgId: string | undefined;
  if (orgRef) orgId = (await requireOrg(actor, orgRef, "org.read")).org.id;
  return db
    .select()
    .from(projects)
    .where(and(accessibleProjectsCondition(actor.id), orgId ? eq(projects.organizationId, orgId) : undefined))
    .orderBy(desc(projects.updatedAt));
}

export async function createProject(actor: Actor, input: z.infer<typeof createProjectSchema>) {
  const { org } = await requireOrg(actor, input.organization, "project.create");
  const limit = PLANS[org.plan].maxProjects;
  if (limit !== null) {
    const [r] = await db.select({ n: count() }).from(projects).where(eq(projects.organizationId, org.id));
    if ((r?.n ?? 0) >= limit)
      throw PlanLimit(`The ${PLANS[org.plan].name} plan includes ${limit} projects. Upgrade the organization to add more.`);
  }
  if (input.slug) {
    const [taken] = await db.select({ id: projects.id }).from(projects).where(eq(projects.slug, input.slug));
    if (taken) throw Conflict("That project URL is taken");
  }
  const slug = input.slug ?? (await availableSlug(`${input.name}`));
  const project = await db.transaction(async (tx) => {
    const [p] = await tx
      .insert(projects)
      .values({
        organizationId: org.id,
        slug,
        name: input.name,
        description: input.description,
        type: input.type,
        visibility: input.visibility,
        createdBy: actor.id,
      })
      .returning();
    await tx.insert(projectMembers).values({ projectId: p!.id, userId: actor.id, role: "admin" });
    if (input.scaffold) {
      for (const name of DEFAULT_FOLDERS)
        await tx.insert(folders).values({ projectId: p!.id, name, path: `/${name}`, createdBy: actor.id });
      for (const [name, color] of DEFAULT_LABELS) await tx.insert(labels).values({ projectId: p!.id, name, color });
    }
    return p!;
  });
  await indexProject(project);
  await audit("project.created", { actorId: actor.id, organizationId: org.id, targetType: "project", targetId: project.id });
  await emit({
    type: "project.created",
    actorId: actor.id,
    organizationId: org.id,
    projectId: project.id,
    target: { type: "project", id: project.id, label: project.name, url: `/project/${project.slug}` },
  });
  return project;
}

export async function indexProject(p: typeof projects.$inferSelect) {
  await indexDocument({
    organizationId: p.organizationId,
    projectId: p.id,
    entityType: "project",
    entityId: p.id,
    title: p.name,
    body: `${p.description ?? ""} ${p.type} ${p.repository ?? ""}`,
    url: `/project/${p.slug}`,
    meta: { type: p.type, status: p.status },
  });
}

export async function updateProject(actor: Actor, ref: string, input: z.infer<typeof updateProjectSchema>) {
  const access = await requireProject(actor, ref, "project.admin");
  const [p] = await db.update(projects).set(input).where(eq(projects.id, access.project.id)).returning();
  await indexProject(p!);
  await audit("project.updated", {
    actorId: actor.id,
    organizationId: access.org.id,
    targetType: "project",
    targetId: p!.id,
    metadata: { fields: Object.keys(input) },
  });
  if (input.status && input.status !== access.project.status) {
    await emit({
      type: "project.status_changed",
      actorId: actor.id,
      organizationId: access.org.id,
      projectId: p!.id,
      target: { type: "project", id: p!.id, label: p!.name, url: `/project/${p!.slug}` },
      data: { from: access.project.status, to: input.status },
    });
  }
  return p!;
}

export async function deleteProject(actor: Actor, ref: string, confirm: string) {
  const access = await requireProject(actor, ref, "project.admin");
  if (confirm !== access.project.slug) throw BadRequest("Type the project URL to confirm");
  const versions = await db
    .select({ key: fileVersions.storageKey, size: fileVersions.size })
    .from(fileVersions)
    .where(eq(fileVersions.projectId, access.project.id));
  await db.transaction(async (tx) => {
    await tx.delete(projects).where(eq(projects.id, access.project.id));
    const freed = versions.reduce((s, v) => s + v.size, 0);
    await tx.execute(
      sql`update organizations set storage_used_bytes = greatest(0, storage_used_bytes - ${freed}) where id = ${access.org.id}`,
    );
  });
  await audit("project.deleted", {
    actorId: actor.id,
    organizationId: access.org.id,
    targetType: "project",
    targetId: access.project.id,
    metadata: { slug: access.project.slug, name: access.project.name },
  });
  for (const v of new Set(versions.map((v) => v.key)))
    await storage()
      .delete(v)
      .catch((e) => logger.warn("storage.delete_failed", { key: v, error: (e as Error).message }));
}

export async function listProjectMembers(actor: Actor, ref: string) {
  const access = await requireProject(actor, ref, "project.read");
  return projectPeople(access);
}

export async function setProjectMember(actor: Actor, ref: string, userId: string, role: ProjectRole) {
  const access = await requireProject(actor, ref, "project.admin");
  const [m] = await db
    .select()
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, access.org.id), eq(organizationMembers.userId, userId)));
  if (!m) throw BadRequest("Only organization members can be added to a project");
  await db
    .insert(projectMembers)
    .values({ projectId: access.project.id, userId, role })
    .onConflictDoUpdate({ target: [projectMembers.projectId, projectMembers.userId], set: { role } });
  await audit("project.member_set", {
    actorId: actor.id,
    organizationId: access.org.id,
    targetType: "user",
    targetId: userId,
    metadata: { projectId: access.project.id, role },
  });
}

export async function removeProjectMember(actor: Actor, ref: string, userId: string) {
  const access = await requireProject(actor, ref, "project.admin");
  const r = await db
    .delete(projectMembers)
    .where(and(eq(projectMembers.projectId, access.project.id), eq(projectMembers.userId, userId)))
    .returning();
  if (!r.length) throw NotFound("Project member");
  await audit("project.member_removed", {
    actorId: actor.id,
    organizationId: access.org.id,
    targetType: "user",
    targetId: userId,
    metadata: { projectId: access.project.id },
  });
}

export async function explicitProjectMembers(projectId: string) {
  return db
    .select({ ...userSummary, role: projectMembers.role })
    .from(projectMembers)
    .innerJoin(users, eq(users.id, projectMembers.userId))
    .where(eq(projectMembers.projectId, projectId));
}
