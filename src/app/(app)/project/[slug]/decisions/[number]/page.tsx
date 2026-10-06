import Link from "next/link";
import { Check } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { getDecision } from "@/server/services/decisions";
import { projectPeople } from "@/server/services/shared";
import { loadDiscussion } from "@/server/services/comments";
import { load, pageNumber } from "@/server/services/page-access";
import { Content } from "@/components/app/page-header";
import { DetailLayout, DocSection, ProjectHeader, Prop, SideSection } from "@/components/project/shared";
import { RecordTitle } from "@/components/project/detail-header";
import { LinksPanel } from "@/components/project/links-panel";
import { Comments } from "@/components/project/comments";
import { ResourceForm } from "@/components/forms/resource-form";
import { PropertySelect, ActionButton } from "@/components/forms/actions";
import { decisionFields } from "@/components/project/field-sets";
import { StatusBadge } from "@/components/app/status";
import { Markdown } from "@/components/ui/markdown";
import { DECISION_STATUS } from "@/lib/status";
import { shortDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const metadata = { title: "Decision" };

export default async function DecisionPage({ params, searchParams }: { params: Promise<{ slug: string; number: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { slug, number } = await params;
  const { edit } = await searchParams;
  const user = await requireUser();
  const { access, decision: d, supersededBy, supersedes, links } = await load(getDecision(user, slug, pageNumber(number)));
  const { project, org, role } = access;
  const [people, discussion] = await Promise.all([projectPeople(access), loadDiscussion(user, slug, "decision", d.id)]);
  const base = `/project/${project.slug}`;
  const api = `/api/v1/projects/${project.slug}/decisions/${d.number}`;
  const canWrite = role !== "viewer";
  return (
    <>
      <ProjectHeader project={project} org={org} crumbs={[{ label: "Decisions", href: `${base}/decisions` }, { label: d.ref }]} />
      <Content wide>
        <DetailLayout
          main={
            edit && canWrite ? (
              <div className="rounded-lg border border-border bg-surface p-5">
                <ResourceForm
                  method="PATCH"
                  action={api}
                  submitLabel="Save decision"
                  redirectTo={`${base}/decisions/${d.number}`}
                  cancelHref={`${base}/decisions/${d.number}`}
                  layout="grid"
                  initial={{ title: d.title, decision: d.decision, context: d.context ?? "", alternatives: d.alternatives, rationale: d.rationale ?? "", consequences: d.consequences ?? "", status: d.status, ownerId: d.ownerId ?? "" }}
                  transform={(p) => ({ ...p, alternatives: ((p.alternatives as { name: string }[]) ?? []).filter((a) => a.name?.trim()) })}
                  fields={decisionFields(people)}
                />
              </div>
            ) : (
              <>
                <RecordTitle refLabel={d.ref} title={d.title} badges={<StatusBadge map={DECISION_STATUS} value={d.status} />} author={d.owner} createdAt={d.createdAt} editHref={canWrite ? "?edit=1" : null} extra={d.decidedAt ? <span>· decided {shortDate(d.decidedAt)}</span> : null} />
                {supersededBy ? (
                  <p className="mb-4 rounded-md border border-amber/30 bg-amber-soft px-3 py-2 text-xs text-amber">
                    Superseded by{" "}
                    <Link className="font-medium underline" href={`${base}/decisions/${supersededBy.number}`}>
                      {supersededBy.ref} {supersededBy.title}
                    </Link>
                  </p>
                ) : null}
                <div className="rounded-lg border border-border border-l-2 border-l-accent bg-surface px-4 py-3">
                  <div className="text-2xs tracking-wide text-fg-subtle uppercase">Decision</div>
                  <p className="mt-1 text-[15px] font-medium">{d.decision}</p>
                </div>
                {d.context ? (
                  <DocSection title="Context">
                    <Markdown projectSlug={project.slug}>{d.context}</Markdown>
                  </DocSection>
                ) : null}
                {d.alternatives.length ? (
                  <DocSection title="Alternatives considered">
                    <div className="overflow-hidden rounded-lg border border-border">
                      <table className="w-full text-sm">
                        <thead className="bg-bg-subtle text-left text-2xs tracking-wide text-fg-subtle uppercase">
                          <tr>
                            <th className="px-3 py-2 font-medium">Option</th>
                            <th className="px-3 py-2 font-medium">Pros</th>
                            <th className="px-3 py-2 font-medium">Cons</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border bg-surface">
                          {d.alternatives.map((a) => (
                            <tr key={a.name} className={cn(a.chosen && "bg-green-soft/40")}>
                              <td className="px-3 py-2 font-medium">
                                <span className="flex items-center gap-1.5">
                                  {a.chosen ? <Check className="size-3.5 text-green" /> : <span className="size-3.5" />}
                                  {a.name}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-fg-muted">{a.pros ?? "—"}</td>
                              <td className="px-3 py-2 text-fg-muted">{a.cons ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </DocSection>
                ) : null}
                {d.rationale ? (
                  <DocSection title="Rationale">
                    <Markdown projectSlug={project.slug}>{d.rationale}</Markdown>
                  </DocSection>
                ) : null}
                {d.consequences ? (
                  <DocSection title="Consequences">
                    <Markdown projectSlug={project.slug}>{d.consequences}</Markdown>
                  </DocSection>
                ) : null}
                {supersedes.length ? (
                  <DocSection title="Supersedes">
                    {supersedes.map((s) => (
                      <Link key={s.ref} href={`${base}/decisions/${s.number}`} className="block text-sm text-fg-muted hover:text-fg">
                        <span className="font-mono text-xs">{s.ref}</span> {s.title}
                      </Link>
                    ))}
                  </DocSection>
                ) : null}
                <Comments project={project.slug} target={{ type: "decision", id: d.id }} comments={discussion.comments} files={discussion.files} />
              </>
            )
          }
          side={
            <>
              <SideSection title="Properties">
                <Prop label="Status">
                  <PropertySelect url={api} field="status" value={d.status} disabled={!canWrite} options={Object.entries(DECISION_STATUS).map(([v, m]) => ({ value: v, label: m.label }))} />
                </Prop>
                <Prop label="Owner">
                  <PropertySelect url={api} field="ownerId" value={d.ownerId} nullable disabled={!canWrite} display="person" people={people} options={people.map((p) => ({ value: p.id, label: p.displayName }))} />
                </Prop>
              </SideSection>
              <LinksPanel project={project.slug} source={{ type: "decision", id: d.id }} links={links} canEdit={canWrite} />
              {role === "admin" ? (
                <ActionButton variant="ghost" size="xs" method="DELETE" url={api} confirm={`Delete ${d.ref}?`} redirectTo={`${base}/decisions`} className="self-start text-red">
                  Delete decision
                </ActionButton>
              ) : null}
            </>
          }
        />
      </Content>
    </>
  );
}
