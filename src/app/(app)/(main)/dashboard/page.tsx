import Link from "next/link";
import { ArrowUpRight, Bell, CalendarClock, CheckSquare, CircleDot, Plus, Wrench } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { personalDashboard } from "@/server/services/dashboard";
import { getShellData } from "@/server/services/shell";
import { Content, PageHeader } from "@/components/app/page-header";
import { Panel, EmptyState, Mono } from "@/components/ui/misc";
import { ActivityList } from "@/components/app/activity-feed";
import { IssueStatusIcon, PriorityIcon, TaskStatusIcon, StatusBadge } from "@/components/app/status";
import { ProjectGlyph } from "@/components/app/project-glyph";
import { Avatar } from "@/components/ui/avatar";
import { Time } from "@/components/app/time";
import { buttonClass } from "@/components/ui/button";
import { CHANGE_STATUS } from "@/lib/status";
import { shortDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const [data, shell] = await Promise.all([personalDashboard(user), getShellData(user)]);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const work = [
    ...data.issues.map((i) => ({ kind: "issue" as const, id: i.id, ref: i.ref, title: i.title, status: i.status, priority: i.priority, due: null as string | null, project: i.project, url: `/project/${i.project.slug}/issues/${i.number}` })),
    ...data.tasks.map((t) => ({ kind: "task" as const, id: t.id, ref: t.ref, title: t.title, status: t.status, priority: t.priority, due: t.dueDate, project: t.project, url: `/project/${t.project.slug}/tasks/${t.number}` })),
  ];
  const today = new Date().toISOString().slice(0, 10);

  if (!shell.orgs.length) {
    return (
      <>
        <PageHeader crumbs={[{ label: "Dashboard" }]} />
        <Content>
          <EmptyState
            title="Set up your workspace"
            description="Create an organization for your team, then add your first robotics project. Teammates can join with an invite."
            action={
              <Link href="/organizations/new" className={buttonClass("primary")}>
                <Plus className="size-4" /> Create organization
              </Link>
            }
            className="mt-16 rounded-lg border border-dashed border-border"
          />
        </Content>
      </>
    );
  }

  return (
    <>
      <PageHeader crumbs={[{ label: "Dashboard" }]} actions={shell.activeOrg ? <Link href={`/project/new?org=${shell.activeOrg.slug}`} className={buttonClass("secondary", "sm")}><Plus className="size-3.5" /> New project</Link> : null} />
      <Content wide>
        <div className="mb-5 flex items-baseline justify-between">
          <h1 className="text-lg font-semibold tracking-[-0.015em]">
            {greeting}, {user.displayName.split(" ")[0]}
          </h1>
          <span className="hidden font-mono text-xs text-fg-subtle sm:block">
            {work.length} open item{work.length === 1 ? "" : "s"} assigned · {data.deadlines.filter((d) => d.overdue).length} overdue
          </span>
        </div>

        {/* Projects strip */}
        <div className="mb-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {data.projects.slice(0, 8).map((p) => (
            <Link key={p.id} href={`/project/${p.slug}`} className="group flex flex-col gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 transition-colors hover:border-border-strong">
              <div className="flex items-center gap-2">
                <ProjectGlyph type={p.type} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{p.name}</div>
                  <div className="truncate text-2xs text-fg-subtle">{p.org.name}</div>
                </div>
                <ArrowUpRight className="size-3.5 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <div className="flex items-center gap-3 font-mono text-2xs text-fg-subtle">
                <span>{p.openIssues} open issues</span>
                {p.failingTests ? <span className="text-red">{p.failingTests} failing tests</span> : <span>tests green</span>}
                <span className="ml-auto">{p.lastActivity ? <Time date={p.lastActivity} /> : "no activity"}</span>
              </div>
            </Link>
          ))}
          {data.projects.length === 0 ? (
            <Link href={`/project/new?org=${shell.activeOrg?.slug}`} className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border px-3 py-5 text-sm text-fg-muted hover:border-border-strong hover:text-fg">
              <Plus className="size-4" /> Create your first project
            </Link>
          ) : null}
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-5">
            <Panel title="Assigned to you" count={work.length}>
              {work.length ? (
                <ul className="divide-y divide-border">
                  {work.map((w) => (
                    <li key={w.id}>
                      <Link href={w.url} className="flex items-center gap-3 px-3 py-2 hover:bg-surface-2/60">
                        <PriorityIcon priority={w.priority} />
                        {w.kind === "issue" ? <IssueStatusIcon status={w.status} /> : <TaskStatusIcon status={w.status} />}
                        <Mono className="w-[76px] shrink-0 text-xs text-fg-subtle">{w.ref}</Mono>
                        <span className="min-w-0 flex-1 truncate text-sm">{w.title}</span>
                        {w.due ? <span className={cn("font-mono text-2xs", w.due < today ? "text-red" : "text-fg-subtle")}>{shortDate(w.due)}</span> : null}
                        <span className="hidden max-w-36 truncate text-xs text-fg-subtle md:block">{w.project.name}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={<CheckSquare className="size-4" />} title="Nothing assigned" description="Issues and tasks assigned to you across all projects appear here." />
              )}
            </Panel>

            <Panel title="Recent activity" bodyClassName="px-3">
              {data.activity.length ? <ActivityList items={data.activity} showProject /> : <EmptyState title="No activity yet" description="Uploads, test results, decisions and releases from your projects show up here." />}
            </Panel>
          </div>

          <div className="flex flex-col gap-5">
            <Panel title="Upcoming deadlines" count={data.deadlines.length}>
              {data.deadlines.length ? (
                <ul className="divide-y divide-border">
                  {data.deadlines.map((d) => (
                    <li key={d.kind + d.ref + d.project.slug}>
                      <Link href={d.url} className="flex items-center gap-2.5 px-3 py-2 hover:bg-surface-2/60">
                        <CalendarClock className={cn("size-3.5 shrink-0", d.overdue ? "text-red" : "text-fg-subtle")} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{d.title}</span>
                          <span className="font-mono text-2xs text-fg-subtle">
                            {d.ref} · {d.project.name}
                          </span>
                        </span>
                        <span className={cn("font-mono text-xs", d.overdue ? "text-red" : "text-fg-muted")}>{d.overdue ? "overdue" : shortDate(d.due)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-3 py-4 text-sm text-fg-subtle">No due dates in the next two weeks.</p>
              )}
            </Panel>

            <Panel
              title="Notifications"
              count={data.notifications.length}
              action={
                <Link href="/notifications" className="text-xs text-fg-subtle hover:text-fg">
                  View all
                </Link>
              }
            >
              {data.notifications.length ? (
                <ul className="divide-y divide-border">
                  {data.notifications.map((n) => (
                    <li key={n.id}>
                      <Link href={n.url ?? "/notifications"} className="flex gap-2.5 px-3 py-2 hover:bg-surface-2/60">
                        {n.actor ? <Avatar user={n.actor} size={18} /> : <Bell className="size-4 text-fg-subtle" />}
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm leading-5">{n.title}</span>
                          <Time date={n.createdAt} className="font-mono text-2xs text-fg-subtle" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-3 py-4 text-sm text-fg-subtle">You're all caught up.</p>
              )}
            </Panel>

            <Panel title="Engineering changes">
              {data.changes.length ? (
                <ul className="divide-y divide-border">
                  {data.changes.map((c) => (
                    <li key={c.id}>
                      <Link href={`/project/${c.project.slug}/changes/${c.number}`} className="flex flex-col gap-1 px-3 py-2 hover:bg-surface-2/60">
                        <span className="flex items-center gap-2">
                          <Wrench className="size-3.5 text-fg-subtle" />
                          <Mono className="text-xs text-fg-subtle">{c.ref}</Mono>
                          <StatusBadge map={CHANGE_STATUS} value={c.status} className="ml-auto" />
                        </span>
                        <span className="truncate text-sm">{c.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={<CircleDot className="size-4" />} title="No changes recorded" className="py-6" />
              )}
            </Panel>
          </div>
        </div>
      </Content>
    </>
  );
}
