import Link from "next/link";
import { CircleDot, MessageSquare, Plus } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { listIssues } from "@/server/services/issues";
import { listMilestones } from "@/server/services/milestones";
import { listLabels } from "@/server/services/labels";
import { projectPeople } from "@/server/services/shared";
import { load } from "@/server/services/page-access";
import { Content } from "@/components/app/page-header";
import { FilterTabs, ProjectHeader, TableShell } from "@/components/project/shared";
import { FilterBar } from "@/components/project/filter-bar";
import { IssueStatusIcon, PriorityIcon, Ref } from "@/components/app/status";
import { Avatar } from "@/components/ui/avatar";
import { LabelChip } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { Time } from "@/components/app/time";
import { buttonClass } from "@/components/ui/button";
import { PRIORITY } from "@/lib/status";

export const metadata = { title: "Issues" };

type SP = { state?: string; assignee?: string; label?: string; milestone?: string; priority?: string; q?: string };

export default async function IssuesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<SP> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const state = sp.state === "closed" || sp.state === "all" ? sp.state : "open";
  const data = await load(listIssues(user, slug, { ...sp, state }));
  const { project, org, role } = data.access;
  const [people, ms, labels] = await Promise.all([projectPeople(data.access), listMilestones(user, slug), listLabels(user, slug)]);
  const base = `/project/${project.slug}`;
  const qs = (s: string) => {
    const p = new URLSearchParams(Object.entries({ ...sp, state: s }).filter(([, v]) => v) as [string, string][]);
    return `${base}/issues?${p.toString()}`;
  };
  return (
    <>
      <ProjectHeader project={project} org={org} crumbs={[{ label: "Issues" }]} actions={role !== "viewer" ? <Link href={`${base}/issues/new`} className={buttonClass("primary", "sm")}><Plus className="size-3.5" /> New issue</Link> : null} />
      <Content wide>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <FilterTabs
            active={state}
            items={[
              { key: "open", label: "Open", href: qs("open"), count: data.counts.open },
              { key: "closed", label: "Closed", href: qs("closed"), count: data.counts.closed },
              { key: "all", label: "All", href: qs("all"), count: data.counts.open + data.counts.closed },
            ]}
          />
          <FilterBar
            searchPlaceholder="Search issues…"
            filters={[
              { key: "assignee", label: "Assignee", options: [{ value: "none", label: "Unassigned" }, ...people.map((p) => ({ value: p.username, label: p.displayName }))] },
              { key: "priority", label: "Priority", options: Object.entries(PRIORITY).map(([v, m]) => ({ value: v, label: m.label })) },
              { key: "label", label: "Label", options: labels.map((l) => ({ value: l.name, label: l.name })) },
              { key: "milestone", label: "Milestone", options: ms.milestones.map((m) => ({ value: String(m.number), label: `M${m.number} ${m.title}` })) },
            ]}
          />
        </div>
        <TableShell>
          {data.issues.length ? (
            <ul className="divide-y divide-border">
              {data.issues.map((i) => (
                <li key={i.id}>
                  <Link href={`${base}/issues/${i.number}`} className="flex items-center gap-3 px-3 py-2 hover:bg-surface-2/60">
                    <PriorityIcon priority={i.priority} />
                    <Ref className="hidden w-16 sm:block">{i.ref}</Ref>
                    <IssueStatusIcon status={i.status} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{i.title}</span>
                    </span>
                    <span className="hidden items-center gap-1 lg:flex">
                      {i.labels.slice(0, 3).map((l) => (
                        <LabelChip key={l.name} {...l} />
                      ))}
                    </span>
                    {i.milestone ? <span className="hidden font-mono text-2xs text-fg-subtle md:inline">M{i.milestone.number}</span> : null}
                    {i.commentCount ? (
                      <span className="flex items-center gap-1 font-mono text-2xs text-fg-subtle">
                        <MessageSquare className="size-3" /> {i.commentCount}
                      </span>
                    ) : null}
                    <Time date={i.updatedAt} className="hidden w-14 text-right font-mono text-2xs text-fg-subtle sm:block" />
                    <Avatar user={i.assignee} size={20} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={<CircleDot className="size-4" />}
              title={state === "open" ? "No open issues" : "No issues match"}
              description="Issues track problems with the physical system — failures, defects, integration problems — and link to the requirements, tests and decisions they affect."
              action={role !== "viewer" ? <Link href={`${base}/issues/new`} className={buttonClass("secondary", "sm")}>New issue</Link> : null}
            />
          )}
        </TableShell>
      </Content>
    </>
  );
}
