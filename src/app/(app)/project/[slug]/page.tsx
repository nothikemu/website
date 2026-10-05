import Link from "next/link";
import { ArrowRight, CircleAlert, CircleCheck, CircleDashed, FileUp, GitCommitHorizontal, Lock, Plus, Tag, TriangleAlert } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { projectOverview } from "@/server/services/dashboard";
import { projectActivity } from "@/server/services/activity";
import { load } from "@/server/services/page-access";
import { Content } from "@/components/app/page-header";
import { ProjectHeader } from "@/components/project/shared";
import { Panel, Progress, EmptyState, Mono } from "@/components/ui/misc";
import { ActivityList } from "@/components/app/activity-feed";
import { IssueStatusIcon, PriorityIcon, TaskStatusIcon, StatusBadge } from "@/components/app/status";
import { Avatar, AvatarStack } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/ui/markdown";
import { Time } from "@/components/app/time";
import { FileIcon } from "@/components/files/file-icon";
import { buttonClass } from "@/components/ui/button";
import { PROJECT_STATUS, TEST_STATUS } from "@/lib/status";
import { formatBytes } from "@/lib/plans";
import { shortDate } from "@/lib/dates";
import { titleCase, cn } from "@/lib/utils";

export default async function ProjectOverviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const [o, activity] = await Promise.all([load(projectOverview(user, slug)), load(projectActivity(user, slug, { limit: 14 }))]);
  const { project, org, role } = o.access;
  const base = `/project/${project.slug}`;
  const canWrite = role !== "viewer";
  const healthStyle = {
    good: { icon: CircleCheck, cls: "text-green", label: "Healthy" },
    attention: { icon: TriangleAlert, cls: "text-amber", label: "Needs attention" },
    critical: { icon: CircleAlert, cls: "text-red", label: "At risk" },
    unknown: { icon: CircleDashed, cls: "text-fg-subtle", label: "Getting started" },
  }[o.health.level];
  const req = o.requirements;
  return (
    <>
      <ProjectHeader
        project={project}
        org={org}
        crumbs={[{ label: "Overview" }]}
        actions={
          canWrite ? (
            <>
              <Link href={`${base}/files?upload=1`} className={buttonClass("secondary", "sm")}>
                <FileUp className="size-3.5" /> Upload
              </Link>
              <Link href={`${base}/issues/new`} className={buttonClass("primary", "sm")}>
                <Plus className="size-3.5" /> New issue
              </Link>
            </>
          ) : null
        }
      />
      <Content wide>
        {/* Title block */}
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-[-0.02em]">{project.name}</h1>
              <StatusBadge map={PROJECT_STATUS} value={project.status} />
              <Badge>{titleCase(project.type)}</Badge>
              {project.visibility === "private" ? (
                <Badge>
                  <Lock className="size-3" /> Private
                </Badge>
              ) : null}
              {o.access.org.isDemo ? <Badge tone="amber">Demo data</Badge> : null}
            </div>
            {project.description ? <Markdown className="mt-2 text-fg-muted" projectSlug={project.slug}>{project.description}</Markdown> : null}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-fg-subtle">
              {project.repository ? (
                <a href={`https://github.com/${project.repository}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:text-fg">
                  <GitCommitHorizontal className="size-3.5" /> {project.repository}
                </a>
              ) : null}
              <span>{o.counts.files} files · {formatBytes(o.counts.storage)}</span>
              {o.latestRelease ? (
                <Link href={`${base}/releases/${encodeURIComponent(o.latestRelease.tag)}`} className="flex items-center gap-1 hover:text-fg">
                  <Tag className="size-3.5" /> {o.latestRelease.tag}
                </Link>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <AvatarStack users={o.people} max={6} size={24} />
          </div>
        </div>

        {/* Signal strip */}
        <div className="mt-5 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
          <div className="bg-surface p-3.5">
            <div className="flex items-center gap-2 text-xs text-fg-subtle">Project health</div>
            <div className={cn("mt-1 flex items-center gap-1.5 text-sm font-medium", healthStyle.cls)}>
              <healthStyle.icon className="size-4" /> {healthStyle.label}
            </div>
            <ul className="mt-1.5 space-y-0.5 text-xs text-fg-muted">
              {o.health.reasons.slice(0, 3).map((r) => (
                <li key={r}>· {r}</li>
              ))}
            </ul>
          </div>
          <Link href={`${base}/requirements`} className="bg-surface p-3.5 hover:bg-surface-2/60">
            <div className="text-xs text-fg-subtle">Requirements verified</div>
            <div className="mt-1 font-mono text-sm">
              {req.verified}
              <span className="text-fg-subtle">/{req.total}</span>
              {req.failing ? <span className="ml-2 text-red">{req.failing} failing</span> : null}
            </div>
            <Progress value={req.total ? req.verified / req.total : 0} tone="green" className="mt-2" />
            <div className="mt-1.5 text-2xs text-fg-subtle">{req.untested} untested · {req.in_progress} in verification</div>
          </Link>
          <Link href={`${base}/milestones`} className="bg-surface p-3.5 hover:bg-surface-2/60">
            <div className="text-xs text-fg-subtle">Current milestone</div>
            {o.currentMilestone ? (
              <>
                <div className="mt-1 truncate text-sm font-medium">
                  <Mono className="text-fg-subtle">M{o.currentMilestone.number}</Mono> {o.currentMilestone.title}
                </div>
                <Progress value={o.currentMilestone.progress} className="mt-2" />
                <div className="mt-1.5 font-mono text-2xs text-fg-subtle">
                  {o.currentMilestone.done}/{o.currentMilestone.total} tasks · {o.currentMilestone.dueDate ? `due ${shortDate(o.currentMilestone.dueDate)}` : "no due date"}
                </div>
              </>
            ) : (
              <div className="mt-1 text-sm text-fg-muted">No open milestone</div>
            )}
          </Link>
          <Link href={`${base}/tests`} className="bg-surface p-3.5 hover:bg-surface-2/60">
            <div className="text-xs text-fg-subtle">Tests</div>
            <div className="mt-1 font-mono text-sm">
              {o.counts.tests - o.counts.failingTests}
              <span className="text-fg-subtle">/{o.counts.tests} not failing</span>
            </div>
            <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-surface-3">
              {o.counts.tests ? (
                <>
                  <div className="bg-red" style={{ width: `${(o.counts.failingTests / o.counts.tests) * 100}%` }} />
                </>
              ) : null}
            </div>
            <div className="mt-1.5 text-2xs text-fg-subtle">
              {o.counts.openIssues} open issues · {o.counts.blockedIssues} blocked · {o.counts.overdueTasks} overdue tasks
            </div>
          </Link>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="flex min-w-0 flex-col gap-5">
            <div className="grid gap-5 md:grid-cols-2">
              <Panel title="Open issues" count={o.counts.openIssues} action={<Link href={`${base}/issues`} className="text-xs text-fg-subtle hover:text-fg">All</Link>}>
                {o.openIssues.length ? (
                  <ul className="divide-y divide-border">
                    {o.openIssues.map((i) => (
                      <li key={i.id}>
                        <Link href={`${base}/issues/${i.number}`} className="flex items-center gap-2.5 px-3 py-2 hover:bg-surface-2/60">
                          <PriorityIcon priority={i.priority} />
                          <IssueStatusIcon status={i.status} />
                          <span className="min-w-0 flex-1 truncate text-sm">{i.title}</span>
                          <Avatar user={i.assignee} size={18} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState title="No open issues" className="py-8" />
                )}
              </Panel>
              <Panel title="Active tasks" action={<Link href={`${base}/tasks`} className="text-xs text-fg-subtle hover:text-fg">Board</Link>}>
                {o.activeTasks.length ? (
                  <ul className="divide-y divide-border">
                    {o.activeTasks.map((t) => (
                      <li key={t.id}>
                        <Link href={`${base}/tasks/${t.number}`} className="flex items-center gap-2.5 px-3 py-2 hover:bg-surface-2/60">
                          <TaskStatusIcon status={t.status} />
                          <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                          <Avatar user={t.assignee} size={18} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState title="Nothing in progress" className="py-8" />
                )}
              </Panel>
            </div>

            <Panel title="Latest test results" action={<Link href={`${base}/tests`} className="text-xs text-fg-subtle hover:text-fg">All tests</Link>}>
              {o.testRuns.length ? (
                <ul className="divide-y divide-border">
                  {o.testRuns.map((r) => (
                    <li key={r.id}>
                      <Link href={`${base}/tests/${r.testNumber}`} className="flex items-center gap-3 px-3 py-2 hover:bg-surface-2/60">
                        <StatusBadge map={TEST_STATUS} value={r.status} className="w-16 justify-center" />
                        <Mono className="w-20 shrink-0 text-xs text-fg-subtle">{r.testRef}</Mono>
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {r.testName}
                          {r.actual ? <span className="text-fg-subtle"> — {r.actual}</span> : null}
                        </span>
                        <Time date={r.runAt} className="shrink-0 font-mono text-2xs text-fg-subtle" />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No test runs yet" description="Define tests against requirements and record results — manually or from CI." className="py-8" />
              )}
            </Panel>

            <div className="grid gap-5 md:grid-cols-2">
              <Panel title="Recent file changes" action={<Link href={`${base}/files`} className="text-xs text-fg-subtle hover:text-fg">Files</Link>}>
                {o.files.length ? (
                  <ul className="divide-y divide-border">
                    {o.files.map((f) => (
                      <li key={f.id}>
                        <Link href={`${base}/files/${f.id}`} className="flex items-center gap-2.5 px-3 py-2 hover:bg-surface-2/60">
                          <FileIcon name={f.name} kind={f.kind} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-mono text-xs">{f.path}</span>
                            <span className="text-2xs text-fg-subtle">
                              v{f.versionCount} · {f.user?.displayName ?? "—"}
                            </span>
                          </span>
                          <Time date={f.updatedAt} className="shrink-0 font-mono text-2xs text-fg-subtle" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState title="No files yet" className="py-8" action={canWrite ? <Link href={`${base}/files?upload=1`} className={buttonClass("secondary", "sm")}>Upload files</Link> : null} />
                )}
              </Panel>
              <Panel title="Recent commits">
                {o.commits.length ? (
                  <ul className="divide-y divide-border">
                    {o.commits.map((c) => (
                      <li key={c.id}>
                        <a href={c.url ?? "#"} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 px-3 py-2 hover:bg-surface-2/60">
                          <GitCommitHorizontal className="size-3.5 shrink-0 text-fg-subtle" />
                          <Mono className="shrink-0 text-xs text-accent">{c.sha.slice(0, 7)}</Mono>
                          <span className="min-w-0 flex-1 truncate text-sm">{c.message.split("\n")[0]}</span>
                          <Time date={c.committedAt} className="shrink-0 font-mono text-2xs text-fg-subtle" />
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState
                    title="No repository linked"
                    description="Link a GitHub repository to see commits and connect them to issues."
                    className="py-8"
                    action={role === "admin" ? <Link href={`${base}/settings/integrations`} className={buttonClass("secondary", "sm")}>Link repository <ArrowRight className="size-3.5" /></Link> : null}
                  />
                )}
              </Panel>
            </div>
          </div>

          <div className="flex flex-col gap-5">
            {o.latestRelease ? (
              <Panel title="Latest release">
                <Link href={`${base}/releases/${encodeURIComponent(o.latestRelease.tag)}`} className="block px-3 py-3 hover:bg-surface-2/60">
                  <div className="flex items-center gap-2">
                    <Tag className="size-4 text-accent" />
                    <span className="font-mono text-sm font-medium">{o.latestRelease.tag}</span>
                    <span className="truncate text-sm text-fg-muted">{o.latestRelease.name}</span>
                  </div>
                  <div className="mt-1 text-xs text-fg-subtle">
                    Published <Time date={o.latestRelease.publishedAt!} />
                    {o.latestRelease.manifest ? ` · ${o.latestRelease.manifest.tests.passed}/${o.latestRelease.manifest.tests.total} tests passing at release` : ""}
                  </div>
                </Link>
              </Panel>
            ) : null}
            <Panel title="Milestones" action={<Link href={`${base}/milestones`} className="text-xs text-fg-subtle hover:text-fg">All</Link>}>
              {o.milestones.length ? (
                <ul className="divide-y divide-border">
                  {o.milestones.slice(0, 6).map((m) => (
                    <li key={m.id} className="px-3 py-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Mono className="text-xs text-fg-subtle">M{m.number}</Mono>
                        <span className={cn("min-w-0 flex-1 truncate", m.status === "closed" && "text-fg-muted line-through decoration-fg-subtle")}>{m.title}</span>
                        <span className="font-mono text-2xs text-fg-subtle">{Math.round(m.progress * 100)}%</span>
                      </div>
                      <Progress value={m.progress} tone={m.status === "closed" ? "green" : "accent"} className="mt-1.5 h-1" />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-3 py-4 text-sm text-fg-subtle">No milestones yet.</p>
              )}
            </Panel>
            <Panel title="Activity" bodyClassName="px-3" action={<Link href={`${base}/activity`} className="text-xs text-fg-subtle hover:text-fg">All</Link>}>
              {activity.items.length ? <ActivityList items={activity.items} /> : <p className="py-4 text-sm text-fg-subtle">No activity yet.</p>}
            </Panel>
            <Panel title="Team" count={o.people.length}>
              <ul className="divide-y divide-border">
                {o.people.slice(0, 8).map((p) => (
                  <li key={p.id} className="flex items-center gap-2.5 px-3 py-2">
                    <Avatar user={p} size={22} />
                    <span className="min-w-0 flex-1 truncate text-sm">{p.displayName}</span>
                    <span className="text-xs text-fg-subtle">{titleCase(p.role)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      </Content>
    </>
  );
}
