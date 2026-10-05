import Link from "next/link";
import { Plus, Scale } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { listDecisions } from "@/server/services/decisions";
import { load } from "@/server/services/page-access";
import { Content, PageTitle } from "@/components/app/page-header";
import { ProjectHeader } from "@/components/project/shared";
import { FilterBar } from "@/components/project/filter-bar";
import { StatusBadge } from "@/components/app/status";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";
import { shortDate } from "@/lib/dates";
import { DECISION_STATUS } from "@/lib/status";
import { cn } from "@/lib/utils";

export const metadata = { title: "Decisions" };

export default async function DecisionsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ status?: string; q?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const { access, decisions } = await load(listDecisions(user, slug, sp));
  const { project, org, role } = access;
  const base = `/project/${project.slug}`;
  return (
    <>
      <ProjectHeader project={project} org={org} crumbs={[{ label: "Decisions" }]} actions={role !== "viewer" ? <Link href={`${base}/decisions/new`} className={buttonClass("primary", "sm")}><Plus className="size-3.5" /> Record decision</Link> : null} />
      <Content>
        <PageTitle title="Engineering decisions" description="Why the system is the way it is. Each record captures the options considered and the reasoning, so nobody has to re-litigate it next season." />
        <div className="mt-4 mb-3">
          <FilterBar searchPlaceholder="Search decisions…" filters={[{ key: "status", label: "Status", options: Object.entries(DECISION_STATUS).map(([v, m]) => ({ value: v, label: m.label })) }]} />
        </div>
        {decisions.length ? (
          <div className="flex flex-col gap-2">
            {decisions.map((d) => (
              <Link key={d.id} href={`${base}/decisions/${d.number}`} className={cn("group rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong", (d.status === "superseded" || d.status === "deprecated") && "opacity-70")}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-fg-subtle">{d.ref}</span>
                  <h2 className="text-sm font-semibold group-hover:text-accent">{d.title}</h2>
                  <StatusBadge map={DECISION_STATUS} value={d.status} />
                  <span className="ml-auto flex items-center gap-1.5 text-xs text-fg-subtle">
                    <Avatar user={d.owner} size={16} /> {shortDate(d.decidedAt ?? d.createdAt)}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-fg">
                  <span className="text-fg-subtle">Decision: </span>
                  {d.decision}
                </p>
                {d.alternatives.length ? (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-fg-subtle">Considered</span>
                    {d.alternatives.map((a) => (
                      <span key={a.name} className={cn("rounded-sm border px-1.5 py-0.5", a.chosen ? "border-green/40 bg-green-soft text-green" : "border-border text-fg-muted")}>
                        {a.name}
                      </span>
                    ))}
                  </div>
                ) : null}
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState icon={<Scale className="size-4" />} title="No decisions recorded" description='Record choices like "differential drive vs mecanum" with alternatives and reasoning. They become searchable project knowledge.' className="rounded-lg border border-dashed border-border" />
        )}
      </Content>
    </>
  );
}
