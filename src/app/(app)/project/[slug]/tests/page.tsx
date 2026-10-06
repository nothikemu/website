import Link from "next/link";
import { FlaskConical, Plus } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { listTests } from "@/server/services/tests";
import { load } from "@/server/services/page-access";
import { Content, PageTitle } from "@/components/app/page-header";
import { FilterTabs, ProjectHeader, TableShell } from "@/components/project/shared";
import { StatusBadge, Ref } from "@/components/app/status";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/misc";
import { Time } from "@/components/app/time";
import { buttonClass } from "@/components/ui/button";
import { TEST_STATUS } from "@/lib/status";

export const metadata = { title: "Tests" };

export default async function TestsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ status?: string; q?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const { access, tests, counts } = await load(listTests(user, slug, sp));
  const { project, org, role } = access;
  const base = `/project/${project.slug}`;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <>
      <ProjectHeader project={project} org={org} crumbs={[{ label: "Tests" }]} actions={role !== "viewer" ? <Link href={`${base}/tests/new`} className={buttonClass("primary", "sm")}><Plus className="size-3.5" /> New test</Link> : null} />
      <Content wide>
        <PageTitle title="Tests" description="Each test defines a criterion and records every run — manual or from CI via webhook. A test's status is its latest run." />
        <div className="mt-4 mb-3">
          <FilterTabs
            active={sp.status ?? "all"}
            items={[
              { key: "all", label: "All", href: `${base}/tests`, count: total },
              ...(["failed", "running", "blocked", "passed", "planned"] as const).map((s) => ({ key: s, label: TEST_STATUS[s]!.label, href: `${base}/tests?status=${s}`, count: counts[s] })),
            ]}
          />
        </div>
        <TableShell>
          {tests.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-2xs tracking-wide text-fg-subtle uppercase">
                  <tr>
                    <th className="w-24 px-3 py-2 font-medium">Ref</th>
                    <th className="px-3 py-2 font-medium">Test</th>
                    <th className="hidden px-3 py-2 font-medium md:table-cell">Criterion</th>
                    <th className="hidden px-3 py-2 font-medium lg:table-cell">Verifies</th>
                    <th className="w-24 px-3 py-2 font-medium">Status</th>
                    <th className="hidden w-24 px-3 py-2 text-right font-medium sm:table-cell">Last run</th>
                    <th className="w-10 px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {tests.map((t) => (
                    <tr key={t.id} className="hover:bg-surface-2/60">
                      <td className="px-3 py-2">
                        <Link href={`${base}/tests/${t.number}`}>
                          <Ref className="text-fg-muted">{t.ref}</Ref>
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <Link href={`${base}/tests/${t.number}`} className="hover:text-accent">
                          {t.name}
                        </Link>
                        <span className="ml-2 font-mono text-2xs text-fg-subtle">{t.runCount} runs</span>
                      </td>
                      <td className="hidden px-3 py-2 font-mono text-xs text-fg-muted md:table-cell">{t.criteria ?? "—"}</td>
                      <td className="hidden px-3 py-2 font-mono text-2xs text-fg-subtle lg:table-cell">{t.requirementRefs.join(" ") || "—"}</td>
                      <td className="px-3 py-2">
                        <StatusBadge map={TEST_STATUS} value={t.status} />
                      </td>
                      <td className="hidden px-3 py-2 text-right font-mono text-2xs text-fg-subtle sm:table-cell">{t.lastRunAt ? <Time date={t.lastRunAt} /> : "never"}</td>
                      <td className="px-3 py-2">
                        <Avatar user={t.owner} size={18} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={<FlaskConical className="size-4" />} title="No tests" description="Define how each requirement is verified: load tests, endurance runs, sensor accuracy, field trials." action={role !== "viewer" ? <Link href={`${base}/tests/new`} className={buttonClass("secondary", "sm")}>New test</Link> : null} />
          )}
        </TableShell>
      </Content>
    </>
  );
}
