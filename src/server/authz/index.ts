import "server-only";
import { and, eq, sql, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { organizationMembers, organizations, projectMembers, projects } from "@/server/db/schema";
import { Forbidden, NotFound, Unauthorized } from "@/server/http/errors";

/**
 * Authorization service. Every service function resolves access through here.
 *
 * Rules
 *  - Organization data is visible only to members of that organization.
 *  - Org owners/admins are project admins on every project in the org.
 *  - "organization" projects are visible to all members with their org role
 *    (engineer → engineer, viewer → viewer); explicit project membership can raise it.
 *  - "private" projects are visible only to explicit project members (+ owners/admins).
 *  - Missing access is reported as 404 — never 403 — so IDs cannot be probed.
 */
export type OrgRole = "owner" | "admin" | "engineer" | "viewer";
export type ProjectRole = "admin" | "engineer" | "viewer";

export type Actor = { id: string };

const ORG_RANK: Record<OrgRole, number> = { viewer: 1, engineer: 2, admin: 3, owner: 4 };
const PROJECT_RANK: Record<ProjectRole, number> = { viewer: 1, engineer: 2, admin: 3 };

export const ORG_PERMISSIONS = {
  "org.read": "viewer",
  "project.create": "engineer",
  "org.update": "admin",
  "org.members.manage": "admin",
  "org.integrations.manage": "admin",
  "org.audit.read": "admin",
  "org.billing": "owner",
  "org.delete": "owner",
} as const satisfies Record<string, OrgRole>;

export const PROJECT_PERMISSIONS = {
  "project.read": "viewer",
  "project.comment": "viewer",
  "project.write": "engineer",
  "project.admin": "admin",
} as const satisfies Record<string, ProjectRole>;

export type OrgPermission = keyof typeof ORG_PERMISSIONS;
export type ProjectPermission = keyof typeof PROJECT_PERMISSIONS;

export function orgRoleAllows(role: OrgRole, perm: OrgPermission) {
  return ORG_RANK[role] >= ORG_RANK[ORG_PERMISSIONS[perm]];
}

export function projectRoleAllows(role: ProjectRole, perm: ProjectPermission) {
  return PROJECT_RANK[role] >= PROJECT_RANK[PROJECT_PERMISSIONS[perm]];
}

export function effectiveProjectRole(input: {
  orgRole: OrgRole | null;
  visibility: "organization" | "private";
  projectRole: ProjectRole | null;
}): ProjectRole | null {
  const { orgRole, visibility, projectRole } = input;
  if (!orgRole) return null; // must belong to the owning org
  if (orgRole === "owner" || orgRole === "admin") return "admin";
  if (visibility === "private") return projectRole;
  const base: ProjectRole = orgRole === "engineer" ? "engineer" : "viewer";
  if (!projectRole) return base;
  return PROJECT_RANK[projectRole] > PROJECT_RANK[base] ? projectRole : base;
}

export type Org = typeof organizations.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type OrgAccess = { org: Org; role: OrgRole };
export type ProjectAccess = { project: Project; org: Org; role: ProjectRole; orgRole: OrgRole };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID_RE.test(s);

export async function getOrgAccess(actor: Actor | null, ref: string): Promise<OrgAccess | null> {
  if (!actor) return null;
  const [row] = await db
    .select({ org: organizations, role: organizationMembers.role })
    .from(organizations)
    .innerJoin(
      organizationMembers,
      and(eq(organizationMembers.organizationId, organizations.id), eq(organizationMembers.userId, actor.id)),
    )
    .where(isUuid(ref) ? eq(organizations.id, ref) : eq(organizations.slug, ref))
    .limit(1);
  return row ?? null;
}

export async function requireOrg(actor: Actor | null, ref: string, perm: OrgPermission): Promise<OrgAccess> {
  if (!actor) throw Unauthorized();
  const access = await getOrgAccess(actor, ref);
  if (!access) throw NotFound("Organization");
  if (!orgRoleAllows(access.role, perm)) throw Forbidden();
  return access;
}

export async function getProjectAccess(actor: Actor | null, ref: string): Promise<ProjectAccess | null> {
  if (!actor) return null;
  const [row] = await db
    .select({
      project: projects,
      org: organizations,
      orgRole: organizationMembers.role,
      projectRole: projectMembers.role,
    })
    .from(projects)
    .innerJoin(organizations, eq(organizations.id, projects.organizationId))
    .innerJoin(
      organizationMembers,
      and(eq(organizationMembers.organizationId, projects.organizationId), eq(organizationMembers.userId, actor.id)),
    )
    .leftJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, actor.id)))
    .where(isUuid(ref) ? eq(projects.id, ref) : eq(projects.slug, ref))
    .limit(1);
  if (!row) return null;
  const role = effectiveProjectRole({
    orgRole: row.orgRole,
    visibility: row.project.visibility,
    projectRole: row.projectRole,
  });
  if (!role) return null;
  return { project: row.project, org: row.org, role, orgRole: row.orgRole };
}

export async function requireProject(
  actor: Actor | null,
  ref: string,
  perm: ProjectPermission,
): Promise<ProjectAccess> {
  if (!actor) throw Unauthorized();
  const access = await getProjectAccess(actor, ref);
  if (!access) throw NotFound("Project");
  if (!projectRoleAllows(access.role, perm)) throw Forbidden();
  return access;
}

/** SQL predicate: projects the user can read. Use for cross-project queries (dashboard, search). */
export function accessibleProjectsCondition(userId: string) {
  return sql`${projects.id} in (
    select p.id from projects p
    join organization_members om on om.organization_id = p.organization_id and om.user_id = ${userId}
    left join project_members pm on pm.project_id = p.id and pm.user_id = ${userId}
    where p.visibility = 'organization' or om.role in ('owner','admin') or pm.id is not null
  )`;
}

export async function accessibleProjectIds(userId: string, organizationIds?: string[]): Promise<string[]> {
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        accessibleProjectsCondition(userId),
        organizationIds?.length ? inArray(projects.organizationId, organizationIds) : undefined,
      ),
    );
  return rows.map((r) => r.id);
}

export async function userOrganizations(userId: string) {
  return db
    .select({ org: organizations, role: organizationMembers.role })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(eq(organizationMembers.userId, userId))
    .orderBy(organizations.name);
}

/** True if two users share at least one organization (used for profile visibility). */
export async function sharesOrganization(a: string, b: string) {
  if (a === b) return true;
  const rows = await db.execute(sql`
    select 1 from organization_members x join organization_members y on x.organization_id = y.organization_id
    where x.user_id = ${a} and y.user_id = ${b} limit 1`);
  return rows.length > 0;
}


