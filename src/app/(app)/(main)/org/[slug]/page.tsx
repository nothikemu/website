import Link from "next/link";
import { Plus } from "lucide-react";
import { sql, eq } from "drizzle-orm";
import { requireUser } from "@/server/auth/current";
import { orgForPage } from "@/server/services/page-access";
import { listProjects } from "@/server/services/projects";
import { orgActivity } from "@/server/services/activity";
import { db } from "@/server/db";
import { projects } from "@/server/db/schema";
import { Content } from "@/components/app/page-header";
import { Panel, EmptyState } from "@/components/ui/misc";
import { ActivityList } from "@/components/app/activity-feed";
import { ProjectGlyph } from "@/components/app/project-glyph";
import { StatusBadge } from "@/components/app/status";
import { buttonClass } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Time } from "@/components/app/time";
import { PROJECT_STATUS } from "@/lib/status";
import { orgRoleAllows } from "@/server/authz";
import { Lock } from "lucide-react";

export default async function OrgPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const { org, role } = await orgForPage(user, slug);
  const [list, activity, stats] = await Promise.all([
    listProjects(user, org.id),
    orgActivity(user, org.id, { limit: 20 }),
    db
      .select({
        id: projects.id,
        issues: sql<number>`(select count(*)::int from issues i where i.project_id = ${projects.id} and i.status in ('open','in_progress','blocked'))`,
        failing: sql<number>`(select count(*)::int from tests t where t.project_id = ${projects.id} and t.status = 'failed')`,
        files: sql<number>`(select count(*)::int from files f where f.project_id = ${projects.id} and f.deleted_at is null)`,
        last: sql<Date | null>`(select max(a.created_at) from activities a where a.project_id = ${projects.id})`,
      })
      .from(projects)
      .where(eq(projects.organizationId, org.id)),
  ]);
  const s = new Map(stats.map((x) => [x.id, x]));
  const canCreate = orgRoleAllows(role, "project.create");
  return (
    <Content wide>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Panel
          title="Projects"
          count={list.length}
          action={canCreate ? <Link href={`/project/new?org=${org.slug}`} className={buttonClass("ghost", "xs")}><Plus className="size-3" /> New</Link> : null}
        >
          {list.length ? (
            <ul className="divide-y divide-border">
              {list.map((p) => {
                const st = s.get(p.id);
                return (
                  <li key={p.id}>
                    <Link href={`/project/${p.slug}`} className="flex items-center gap-3 px-3 py-3 hover:bg-surface-2/60">
                      <ProjectGlyph type={p.type} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">{p.name}</span>
                          {p.visibility === "private" ? <Lock className="size-3 text-fg-subtle" /> : null}
                          <StatusBadge map={PROJECT_STATUS} value={p.status} />
                        </div>
                        <p className="truncate text-xs text-fg-muted">{p.description ?? "No description"}</p>
                      </div>
                      <div className="hidden shrink-0 items-center gap-4 font-mono text-2xs text-fg-subtle md:flex">
                        <span>{st?.files ?? 0} files</span>
                        <span>{st?.issues ?? 0} open</span>
                        {st?.failing ? <Badge tone="red">{st.failing} failing</Badge> : null}
                        <span className="w-16 text-right">{st?.last ? <Time date={st.last} /> : "—"}</span>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              title="No projects yet"
              description="A project holds a system's files, versions, requirements, tests, decisions and notebook."
              action={canCreate ? <Link href={`/project/new?org=${org.slug}`} className={buttonClass("primary")}>Create project</Link> : null}
            />
          )}
        </Panel>
        <Panel title="Activity" bodyClassName="px-3">
          {activity.items.length ? <ActivityList items={activity.items} showProject /> : <p className="py-4 text-sm text-fg-subtle">No activity yet.</p>}
        </Panel>
      </div>
    </Content>
  );
}
