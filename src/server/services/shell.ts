import "server-only";
import { cache } from "react";
import { and, asc, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { projects } from "@/server/db/schema";
import { accessibleProjectsCondition, getProjectAccess, userOrganizations, type ProjectRole } from "@/server/authz";
import { unreadCount } from "./notifications";
import { forgeStatus } from "@/server/ai/forge";
import { PLANS } from "@/lib/plans";

export type ShellOrg = { id: string; slug: string; name: string; role: string; plan: string };
export type ShellProject = { id: string; slug: string; name: string; type: string; orgSlug: string };

export const getShellData = cache(async (user: { id: string; lastActiveOrgId: string | null }) => {
  const orgRows = await userOrganizations(user.id);
  const orgs: ShellOrg[] = orgRows.map((r) => ({ id: r.org.id, slug: r.org.slug, name: r.org.name, role: r.role, plan: r.org.plan }));
  const active = orgs.find((o) => o.id === user.lastActiveOrgId) ?? orgs[0] ?? null;
  const projectRows = await db
    .select({ id: projects.id, slug: projects.slug, name: projects.name, type: projects.type, orgId: projects.organizationId })
    .from(projects)
    .where(and(accessibleProjectsCondition(user.id), sql`${projects.status} <> 'archived'`))
    .orderBy(asc(projects.name));
  const slugById = new Map(orgs.map((o) => [o.id, o.slug]));
  const allProjects: ShellProject[] = projectRows.map((p) => ({ id: p.id, slug: p.slug, name: p.name, type: p.type, orgSlug: slugById.get(p.orgId) ?? "" }));
  return {
    orgs,
    activeOrg: active,
    projects: allProjects,
    orgProjects: active ? allProjects.filter((p) => p.orgSlug === active.slug) : [],
    unread: await unreadCount(user.id),
  };
});

export type ProjectNavCounts = {
  issues: number;
  tasks: number;
  requirements: number;
  tests: number;
  failingTests: number;
  decisions: number;
  changes: number;
  notebook: number;
  releases: number;
  files: number;
  versions: number;
};

export const getProjectShell = cache(async (user: { id: string }, slug: string) => {
  const access = await getProjectAccess(user, slug);
  if (!access) return null;
  const pid = access.project.id;
  const [counts] = await db.execute<ProjectNavCounts>(sql`
    select
      (select count(*)::int from issues where project_id = ${pid} and status in ('open','in_progress','blocked')) as issues,
      (select count(*)::int from tasks where project_id = ${pid} and status in ('todo','in_progress','review')) as tasks,
      (select count(*)::int from requirements where project_id = ${pid} and status <> 'obsolete') as requirements,
      (select count(*)::int from tests where project_id = ${pid}) as tests,
      (select count(*)::int from tests where project_id = ${pid} and status = 'failed') as "failingTests",
      (select count(*)::int from decisions where project_id = ${pid}) as decisions,
      (select count(*)::int from changes where project_id = ${pid} and status not in ('verified','rejected')) as changes,
      (select count(*)::int from notebook_entries where project_id = ${pid}) as notebook,
      (select count(*)::int from releases where project_id = ${pid}) as releases,
      (select count(*)::int from files where project_id = ${pid} and deleted_at is null) as files,
      (select count(*)::int from snapshots where project_id = ${pid}) as versions`);
  return {
    project: access.project,
    org: { id: access.org.id, slug: access.org.slug, name: access.org.name, plan: access.org.plan },
    role: access.role as ProjectRole,
    counts: counts!,
    forge: { ...forgeStatus(), planAllows: PLANS[access.org.plan].ai },
  };
});


