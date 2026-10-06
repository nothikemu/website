import Link from "next/link";
import { ListChecks, Plus, Table2, Waypoints } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { listRequirements, requirementSummary, traceabilityMatrix } from "@/server/services/requirements";
import { load } from "@/server/services/page-access";
import { Content, PageTitle } from "@/components/app/page-header";
import { ProjectHeader, TableShell } from "@/components/project/shared";
import { FilterBar } from "@/components/project/filter-bar";
import { StatusBadge, Ref } from "@/components/app/status";
import { VerificationBadge, TestDots } from "@/components/project/verification";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, Progress } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";
import { REQ_PRIORITY, REQ_STATUS } from "@/lib/status";
import { cn } from "@/lib/utils";

export const metadata = { title: "Requirements" };

const COLS = [
  { key: "decision", label: "Decisions" },
  { key: "file", label: "Design (CAD / docs)" },
  { key: "impl", label: "Implementation" },
  { key: "test", label: "Verification" },
  { key: "issue", label: "Issues" },
  { key: "change", label: "Changes" },
] as const;

const chipTone = (s: string | null) =>
  !s ? "border-border text-fg-muted" : ["passed", "verified", "accepted", "done", "resolved", "closed", "implemented"].includes(s) ? "border-green/40 text-green" : ["failed", "blocked", "rejected"].includes(s) ? "border-red/40 text-red bg-red-soft" : ["open", "in_progress", "proposed", "running", "review", "approved"].includes(s) ? "border-amber/40 text-amber" : "border-border text-fg-muted";

export default async function RequirementsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ view?: string; status?: string; q?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const view = sp.view === "trace" ? "trace" : "list";
  const { access, requirements } = await load(listRequirements(user, slug, sp));
  const { project, org, role } = access;
  const [summary, matrix] = await Promise.all([requirementSummary(project.id), view === "trace" ? traceabilityMatrix(user, slug) : null]);
  const base = `/project/${project.slug}`;
  return (
    <>
      <ProjectHeader project={project} org={org} crumbs={[{ label: "Requirements" }]} actions={role !== "viewer" ? <Link href={`${base}/requirements/new`} className={buttonClass("primary", "sm")}><Plus className="size-3.5" /> New requirement</Link> : null} />
      <Content wide>
        <PageTitle
          title="Requirements"
          description="What the system must do — each verified by linked tests. Verification status is derived from real test results, never set by hand."
        />
        <div className="mt-4 grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-5">
          {[
            ["Verified", summary.verified, "text-green"],
            ["Failing", summary.failing, "text-red"],
            ["In verification", summary.in_progress, "text-amber"],
            ["Untested", summary.untested, "text-fg-muted"],
            ["By analysis/inspection", summary.not_applicable, "text-blue"],
          ].map(([l, n, c]) => (
            <div key={l as string} className="bg-surface px-3 py-2.5">
              <div className="text-2xs text-fg-subtle">{l}</div>
              <div className={cn("font-mono text-lg", c as string)}>{n as number}</div>
            </div>
          ))}
        </div>
        <Progress value={summary.total ? summary.verified / summary.total : 0} tone="green" className="mt-2 h-1" />
        <div className="mt-4 mb-3 flex flex-wrap items-center gap-3">
          <div className="flex rounded-md border border-border p-0.5">
            <Link href={`${base}/requirements`} className={cn("flex h-6 items-center gap-1.5 rounded-sm px-2 text-xs", view === "list" ? "bg-surface-2 text-fg" : "text-fg-muted")}>
              <Table2 className="size-3.5" /> List
            </Link>
            <Link href={`${base}/requirements?view=trace`} className={cn("flex h-6 items-center gap-1.5 rounded-sm px-2 text-xs", view === "trace" ? "bg-surface-2 text-fg" : "text-fg-muted")}>
              <Waypoints className="size-3.5" /> Traceability matrix
            </Link>
          </div>
          {view === "list" ? <FilterBar searchPlaceholder="Search requirements…" filters={[{ key: "status", label: "Status", options: Object.entries(REQ_STATUS).map(([v, m]) => ({ value: v, label: m.label })) }]} /> : null}
        </div>

        {view === "list" ? (
          <TableShell>
            {requirements.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border text-left text-2xs tracking-wide text-fg-subtle uppercase">
                    <tr>
                      <th className="w-24 px-3 py-2 font-medium">Ref</th>
                      <th className="px-3 py-2 font-medium">Requirement</th>
                      <th className="hidden w-20 px-3 py-2 font-medium md:table-cell">Priority</th>
                      <th className="hidden w-28 px-3 py-2 font-medium sm:table-cell">Status</th>
                      <th className="w-32 px-3 py-2 font-medium">Verification</th>
                      <th className="hidden w-24 px-3 py-2 font-medium lg:table-cell">Tests</th>
                      <th className="w-10 px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {requirements.map((r) => (
                      <tr key={r.id} className="hover:bg-surface-2/60">
                        <td className="px-3 py-2">
                          <Link href={`${base}/requirements/${r.number}`}>
                            <Ref className="text-fg-muted">{r.ref}</Ref>
                          </Link>
                        </td>
                        <td className="px-3 py-2">
                          <Link href={`${base}/requirements/${r.number}`} className={cn("line-clamp-2", r.status === "obsolete" && "text-fg-subtle line-through")}>
                            {r.title}
                          </Link>
                        </td>
                        <td className="hidden px-3 py-2 md:table-cell">
                          <StatusBadge map={REQ_PRIORITY} value={r.priority} />
                        </td>
                        <td className="hidden px-3 py-2 sm:table-cell">
                          <StatusBadge map={REQ_STATUS} value={r.status} />
                        </td>
                        <td className="px-3 py-2">
                          <VerificationBadge value={r.verification} />
                        </td>
                        <td className="hidden px-3 py-2 lg:table-cell">
                          <TestDots tests={r.tests} />
                        </td>
                        <td className="px-3 py-2">
                          <Avatar user={r.owner} size={18} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={<ListChecks className="size-4" />}
                title="No requirements yet"
                description="Start with the few things the robot absolutely must do — payload, speed, runtime, safety. Then link tests that prove them."
                action={role !== "viewer" ? <Link href={`${base}/requirements/new`} className={buttonClass("secondary", "sm")}>Add requirement</Link> : null}
              />
            )}
          </TableShell>
        ) : (
          <TableShell>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] table-fixed border-collapse text-xs">
                <colgroup>
                  <col className="w-[240px]" />
                  {COLS.map((c) => (
                    <col key={c.key} />
                  ))}
                </colgroup>
                <thead>
                  <tr className="border-b border-border bg-bg-subtle text-left text-2xs tracking-wide text-fg-subtle uppercase">
                    <th className="sticky left-0 z-10 bg-bg-subtle px-3 py-2 font-medium">Requirement</th>
                    {COLS.map((c) => (
                      <th key={c.key} className="border-l border-border px-3 py-2 font-medium">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {matrix?.rows.map(({ requirement: r, links }) => {
                    const cell = (k: string) => links.filter((l) => (k === "impl" ? l.type === "commit" || l.type === "task" : l.type === k));
                    return (
                      <tr key={r.id} className="align-top">
                        <td className="sticky left-0 z-10 border-r border-border bg-surface px-3 py-2">
                          <Link href={`${base}/requirements/${r.number}`} className="block hover:text-accent">
                            <span className="font-mono text-fg-subtle">{r.ref}</span> <VerificationBadge value={r.verification} />
                            <span className="mt-1 line-clamp-2 block text-[13px] text-fg">{r.title}</span>
                          </Link>
                        </td>
                        {COLS.map((c) => {
                          const items = cell(c.key);
                          return (
                            <td key={c.key} className={cn("border-l border-border px-2 py-2", !items.length && c.key === "test" && "bg-amber-soft/30")}>
                              <div className="flex flex-col gap-1">
                                {items.map((l) => (
                                  <Link key={l.type + l.ref + l.title} href={l.url} title={l.title} className={cn("flex items-center gap-1.5 truncate rounded-sm border px-1.5 py-0.5 hover:bg-surface-2", chipTone(l.status))}>
                                    <span className="shrink-0 font-mono">{l.type === "file" ? "▱" : l.ref}</span>
                                    <span className="truncate text-fg-muted">{l.type === "file" ? l.title.split("/").pop() : l.title}</span>
                                  </Link>
                                ))}
                                {!items.length ? <span className="text-fg-subtle">{c.key === "test" ? "No verification" : "—"}</span> : null}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </TableShell>
        )}
      </Content>
    </>
  );
}
