import Link from "next/link";
import { Paperclip } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { getTest } from "@/server/services/tests";
import { projectPeople } from "@/server/services/shared";
import { loadDiscussion } from "@/server/services/comments";
import { load, pageNumber } from "@/server/services/page-access";
import { Content } from "@/components/app/page-header";
import { DetailLayout, DocSection, ProjectHeader, Prop, SideSection } from "@/components/project/shared";
import { RecordTitle } from "@/components/project/detail-header";
import { LinksPanel } from "@/components/project/links-panel";
import { Comments } from "@/components/project/comments";
import { RecordRun } from "@/components/project/record-run";
import { ResourceForm } from "@/components/forms/resource-form";
import { PropertySelect, ActionButton } from "@/components/forms/actions";
import { testFields } from "@/components/project/field-sets";
import { StatusBadge } from "@/components/app/status";
import { Markdown } from "@/components/ui/markdown";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { timestamp } from "@/lib/dates";
import { TEST_STATUS } from "@/lib/status";
import { cn } from "@/lib/utils";

export const metadata = { title: "Test" };

const within = (m: { value: number; min?: number | null; max?: number | null }) => (m.min == null || m.value >= m.min) && (m.max == null || m.value <= m.max);

export default async function TestPage({ params, searchParams }: { params: Promise<{ slug: string; number: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { slug, number } = await params;
  const { edit } = await searchParams;
  const user = await requireUser();
  const { access, test, runs, links } = await load(getTest(user, slug, pageNumber(number)));
  const { project, org, role } = access;
  const [people, discussion] = await Promise.all([projectPeople(access), loadDiscussion(user, slug, "test", test.id)]);
  const base = `/project/${project.slug}`;
  const api = `/api/v1/projects/${project.slug}/tests/${test.number}`;
  const canWrite = role !== "viewer";
  const reqRefs = links.filter((l) => l.type === "requirement").map((l) => l.ref).join(", ");
  return (
    <>
      <ProjectHeader project={project} org={org} crumbs={[{ label: "Tests", href: `${base}/tests` }, { label: test.ref }]} actions={canWrite ? <RecordRun project={project.slug} number={test.number} files={discussion.files} /> : null} />
      <Content wide>
        <DetailLayout
          main={
            edit && canWrite ? (
              <div className="rounded-lg border border-border bg-surface p-5">
                <ResourceForm
                  method="PATCH"
                  action={api}
                  submitLabel="Save test"
                  redirectTo={`${base}/tests/${test.number}`}
                  cancelHref={`${base}/tests/${test.number}`}
                  layout="grid"
                  initial={{ name: test.name, criteria: test.criteria ?? "", expected: test.expected ?? "", requirements: reqRefs, ownerId: test.ownerId ?? "", description: test.description ?? "", procedure: test.procedure ?? "" }}
                  fields={testFields(people)}
                />
              </div>
            ) : (
              <>
                <RecordTitle refLabel={test.ref} title={test.name} badges={<StatusBadge map={TEST_STATUS} value={test.status} />} author={test.owner} createdAt={test.createdAt} editHref={canWrite ? "?edit=1" : null} />
                <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
                  <div className="bg-surface p-3">
                    <div className="text-2xs tracking-wide text-fg-subtle uppercase">Criterion</div>
                    <div className="mt-1 font-mono text-sm">{test.criteria ?? "—"}</div>
                  </div>
                  <div className="bg-surface p-3">
                    <div className="text-2xs tracking-wide text-fg-subtle uppercase">Expected</div>
                    <div className="mt-1 text-sm">{test.expected ?? "—"}</div>
                  </div>
                  <div className="bg-surface p-3">
                    <div className="text-2xs tracking-wide text-fg-subtle uppercase">Latest actual</div>
                    <div className={cn("mt-1 text-sm", runs[0]?.status === "failed" ? "text-red" : runs[0]?.status === "passed" ? "text-green" : "")}>{runs[0]?.actual ?? (runs[0] ? TEST_STATUS[runs[0].status]?.label : "Not run yet")}</div>
                  </div>
                </div>
                {test.description ? <Markdown className="mt-4" projectSlug={project.slug}>{test.description}</Markdown> : null}
                {test.procedure ? (
                  <DocSection title="Procedure">
                    <Markdown projectSlug={project.slug}>{test.procedure}</Markdown>
                  </DocSection>
                ) : null}
                <DocSection title={`Run history · ${runs.length}`}>
                  {runs.length ? (
                    <ol className="flex flex-col gap-2">
                      {runs.map((r) => (
                        <li key={r.id} className={cn("rounded-lg border bg-surface", r.status === "failed" ? "border-red/40" : "border-border")}>
                          <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
                            <span className="font-mono text-xs text-fg-subtle">#{r.number}</span>
                            <StatusBadge map={TEST_STATUS} value={r.status} />
                            <span className="text-sm">{r.actual}</span>
                            <span className="ml-auto flex items-center gap-1.5 text-xs text-fg-subtle">
                              {r.source !== "manual" ? <Badge tone="blue">{r.source}</Badge> : null}
                              <Avatar user={r.by} size={16} /> <span className="font-mono">{timestamp(r.runAt)}</span>
                            </span>
                          </div>
                          {r.measurements.length ? (
                            <table className="w-full font-mono text-xs">
                              <thead className="text-left text-2xs text-fg-subtle">
                                <tr>
                                  <th className="px-3 py-1 font-normal">Measurement</th>
                                  <th className="px-3 py-1 text-right font-normal">Value</th>
                                  <th className="px-3 py-1 text-right font-normal">Limits</th>
                                </tr>
                              </thead>
                              <tbody>
                                {r.measurements.map((m, i) => (
                                  <tr key={i} className="border-t border-border/60">
                                    <td className="px-3 py-1 font-sans text-fg-muted">{m.name}</td>
                                    <td className={cn("px-3 py-1 text-right", within(m) ? "text-fg" : "text-red")}>
                                      {m.value} {m.unit}
                                    </td>
                                    <td className="px-3 py-1 text-right text-fg-subtle">
                                      {m.min != null ? `≥ ${m.min}` : ""} {m.max != null ? `≤ ${m.max}` : ""} {m.min == null && m.max == null ? "—" : m.unit}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : null}
                          {r.notes ? <Markdown className="border-t border-border px-3 py-2 text-fg-muted" projectSlug={project.slug}>{r.notes}</Markdown> : null}
                          {r.attachments.length ? (
                            <div className="flex flex-wrap gap-1.5 border-t border-border px-3 py-2">
                              {r.attachments.map((a) => (
                                <Link key={a.id} href={`${base}/files/${a.id}`} className="flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-0.5 font-mono text-2xs text-fg-muted hover:text-fg">
                                  <Paperclip className="size-3" /> {a.path}
                                </Link>
                              ))}
                            </div>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-sm text-fg-subtle">No runs recorded. Record a result manually, or post one from CI to a project webhook.</p>
                  )}
                </DocSection>
                <Comments project={project.slug} target={{ type: "test", id: test.id }} comments={discussion.comments} files={discussion.files} />
              </>
            )
          }
          side={
            <>
              <SideSection title="Properties">
                <Prop label="Status">
                  <StatusBadge map={TEST_STATUS} value={test.status} className="mx-1.5" />
                </Prop>
                <Prop label="Owner">
                  <PropertySelect url={api} field="ownerId" value={test.ownerId} nullable disabled={!canWrite} display="person" people={people} options={people.map((p) => ({ value: p.id, label: p.displayName }))} />
                </Prop>
                <Prop label="Runs">
                  <span className="px-1.5 font-mono text-xs">{runs.length}</span>
                </Prop>
              </SideSection>
              <LinksPanel project={project.slug} source={{ type: "test", id: test.id }} links={links} canEdit={canWrite} />
              {role === "admin" ? (
                <ActionButton variant="ghost" size="xs" method="DELETE" url={api} confirm={`Delete ${test.ref} and all of its runs?`} redirectTo={`${base}/tests`} className="self-start text-red">
                  Delete test
                </ActionButton>
              ) : null}
            </>
          }
        />
      </Content>
    </>
  );
}
