import Link from "next/link";
import { CalendarClock, Milestone } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { listMilestones } from "@/server/services/milestones";
import { load } from "@/server/services/page-access";
import { Content, PageTitle } from "@/components/app/page-header";
import { ProjectHeader } from "@/components/project/shared";
import { EmptyState, Progress } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/forms/actions";
import { NewMilestone } from "@/components/project/new-milestone";
import { Markdown } from "@/components/ui/markdown";
import { shortDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const metadata = { title: "Milestones" };

export default async function MilestonesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const { access, milestones } = await load(listMilestones(user, slug));
  const { project, org, role } = access;
  const base = `/project/${project.slug}`;
  const today = new Date().toISOString().slice(0, 10);
  const canWrite = role !== "viewer";
  return (
    <>
      <ProjectHeader project={project} org={org} crumbs={[{ label: "Milestones" }]} actions={canWrite ? <NewMilestone project={project.slug} /> : null} />
      <Content>
        <PageTitle title="Milestones" description="Progress is computed only from linked tasks. A milestone closes automatically when its last task is done." />
        <div className="mt-5 flex flex-col">
          {milestones.length ? (
            <ol className="relative ml-2 border-l border-border">
              {milestones.map((m) => {
                const overdue = m.status === "open" && m.dueDate && m.dueDate < today;
                return (
                  <li key={m.id} className="relative mb-4 pl-6">
                    <span className={cn("absolute top-3 -left-[7px] size-3.5 rounded-full border-2 border-bg", m.status === "closed" ? "bg-green" : m.progress > 0 ? "bg-accent" : "bg-surface-3")} />
                    <div className="rounded-lg border border-border bg-surface p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm text-fg-subtle">M{m.number}</span>
                        <h2 className="text-sm font-semibold">{m.title}</h2>
                        {m.status === "closed" ? <Badge tone="green">Completed</Badge> : overdue ? <Badge tone="red">Overdue</Badge> : null}
                        <span className="ml-auto flex items-center gap-1 font-mono text-xs text-fg-subtle">
                          <CalendarClock className="size-3.5" /> {m.dueDate ? shortDate(m.dueDate) : "no date"}
                        </span>
                      </div>
                      {m.description ? <Markdown className="mt-2 text-fg-muted" projectSlug={project.slug}>{m.description}</Markdown> : null}
                      <div className="mt-3 flex items-center gap-3">
                        <Progress value={m.progress} tone={m.status === "closed" ? "green" : "accent"} />
                        <span className="w-10 text-right font-mono text-xs">{Math.round(m.progress * 100)}%</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-fg-muted">
                        <Link href={`${base}/tasks?milestone=${m.number}&view=list`} className="hover:text-fg">
                          {m.done}/{m.total} tasks done
                        </Link>
                        <Link href={`${base}/issues?milestone=${m.number}`} className="hover:text-fg">
                          {m.openIssues} open issues
                        </Link>
                        {canWrite ? (
                          <span className="ml-auto flex gap-1">
                            <ActionButton size="xs" variant="ghost" method="PATCH" url={`/api/v1/projects/${project.slug}/milestones/${m.id}`} body={{ status: m.status === "closed" ? "open" : "closed" }}>
                              {m.status === "closed" ? "Reopen" : "Close"}
                            </ActionButton>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <EmptyState icon={<Milestone className="size-4" />} title="No milestones" description="Plan the build in stages — Prototype, Drive System, Arm, Integration, Testing, Competition." action={canWrite ? <NewMilestone project={project.slug} /> : null} />
          )}
        </div>
      </Content>
    </>
  );
}
