import Link from "next/link";
import { ArrowRight, Plus, Wrench } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { listChanges } from "@/server/services/changes";
import { load } from "@/server/services/page-access";
import { Content, PageTitle } from "@/components/app/page-header";
import { ProjectHeader } from "@/components/project/shared";
import { FilterBar } from "@/components/project/filter-bar";
import { StatusBadge } from "@/components/app/status";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/misc";
import { Time } from "@/components/app/time";
import { buttonClass } from "@/components/ui/button";
import { CHANGE_STATUS } from "@/lib/status";

export const metadata = { title: "Engineering changes" };

export default async function ChangesPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ status?: string; q?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const { access, changes } = await load(listChanges(user, slug, sp));
  const { project, org, role } = access;
  const base = `/project/${project.slug}`;
  return (
    <>
      <ProjectHeader project={project} org={org} crumbs={[{ label: "Changes" }]} actions={role !== "viewer" ? <Link href={`${base}/changes/new`} className={buttonClass("primary", "sm")}><Plus className="size-3.5" /> File change</Link> : null} />
      <Content>
        <PageTitle title="Engineering change log" description="Every physical change with its reason, the exact parameters that moved, and the result — tied to the failure that caused it and the test that proved it." />
        <div className="mt-4 mb-3">
          <FilterBar searchPlaceholder="Search changes…" filters={[{ key: "status", label: "Status", options: Object.entries(CHANGE_STATUS).map(([v, m]) => ({ value: v, label: m.label })) }]} />
        </div>
        {changes.length ? (
          <div className="flex flex-col gap-2">
            {changes.map((c) => (
              <Link key={c.id} href={`${base}/changes/${c.number}`} className="group rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-fg-subtle">{c.ref}</span>
                  <h2 className="text-sm font-semibold group-hover:text-accent">{c.title}</h2>
                  <StatusBadge map={CHANGE_STATUS} value={c.status} />
                  <span className="ml-auto flex items-center gap-1.5 text-xs text-fg-subtle">
                    <Avatar user={c.author} size={16} /> <Time date={c.createdAt} />
                  </span>
                </div>
                <p className="mt-1 text-sm text-fg-muted">
                  <span className="text-fg-subtle">Reason: </span>
                  {c.reason}
                </p>
                {c.items.length ? (
                  <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs">
                    {c.items.slice(0, 4).map((i) => (
                      <li key={i.parameter} className="flex items-center gap-1.5">
                        <span className="font-sans text-fg-muted">{i.parameter}</span> <span className="text-red">{i.from}</span>
                        <ArrowRight className="size-3 text-fg-subtle" /> <span className="text-green">{i.to}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState icon={<Wrench className="size-4" />} title="No engineering changes" description="When a part changes — thickness, material, gear ratio — file a change with the reason and result." className="rounded-lg border border-dashed border-border" />
        )}
      </Content>
    </>
  );
}
