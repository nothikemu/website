import { ArrowRight } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { getChange } from "@/server/services/changes";
import { loadDiscussion } from "@/server/services/comments";
import { load, pageNumber } from "@/server/services/page-access";
import { Content } from "@/components/app/page-header";
import { DetailLayout, DocSection, ProjectHeader, Prop, SideSection } from "@/components/project/shared";
import { RecordTitle } from "@/components/project/detail-header";
import { LinksPanel } from "@/components/project/links-panel";
import { Comments } from "@/components/project/comments";
import { ResourceForm } from "@/components/forms/resource-form";
import { PropertySelect, ActionButton } from "@/components/forms/actions";
import { changeFields } from "@/components/project/field-sets";
import { StatusBadge } from "@/components/app/status";
import { Markdown } from "@/components/ui/markdown";
import { CHANGE_STATUS } from "@/lib/status";
import { shortDate } from "@/lib/dates";

export const metadata = { title: "Engineering change" };

export default async function ChangePage({ params, searchParams }: { params: Promise<{ slug: string; number: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { slug, number } = await params;
  const { edit } = await searchParams;
  const user = await requireUser();
  const { access, change: c, links } = await load(getChange(user, slug, pageNumber(number)));
  const { project, org, role } = access;
  const discussion = await loadDiscussion(user, slug, "change", c.id);
  const base = `/project/${project.slug}`;
  const api = `/api/v1/projects/${project.slug}/changes/${c.number}`;
  const canWrite = role !== "viewer";
  return (
    <>
      <ProjectHeader project={project} org={org} crumbs={[{ label: "Changes", href: `${base}/changes` }, { label: c.ref }]} />
      <Content wide>
        <DetailLayout
          main={
            edit && canWrite ? (
              <div className="rounded-lg border border-border bg-surface p-5">
                <ResourceForm
                  method="PATCH"
                  action={api}
                  submitLabel="Save change"
                  redirectTo={`${base}/changes/${c.number}`}
                  cancelHref={`${base}/changes/${c.number}`}
                  layout="grid"
                  initial={{ title: c.title, reason: c.reason, items: c.items, description: c.description ?? "", result: c.result ?? "", status: c.status }}
                  transform={(p) => ({ ...p, items: ((p.items as { parameter: string }[]) ?? []).filter((i) => i.parameter?.trim()) })}
                  fields={changeFields(false)}
                />
              </div>
            ) : (
              <>
                <RecordTitle refLabel={c.ref} title={c.title} badges={<StatusBadge map={CHANGE_STATUS} value={c.status} />} author={c.author} createdAt={c.createdAt} editHref={canWrite ? "?edit=1" : null} extra={c.implementedAt ? <span>· implemented {shortDate(c.implementedAt)}</span> : null} />
                <div className="rounded-lg border border-border bg-surface px-4 py-3">
                  <div className="text-2xs tracking-wide text-fg-subtle uppercase">Reason</div>
                  <Markdown className="mt-1" projectSlug={project.slug}>{c.reason}</Markdown>
                </div>
                {c.items.length ? (
                  <DocSection title="Changes">
                    <div className="overflow-hidden rounded-lg border border-border bg-surface">
                      <table className="w-full text-sm">
                        <thead className="bg-bg-subtle text-left text-2xs tracking-wide text-fg-subtle uppercase">
                          <tr>
                            <th className="px-3 py-2 font-medium">Parameter</th>
                            <th className="px-3 py-2 font-medium">From</th>
                            <th className="w-6" />
                            <th className="px-3 py-2 font-medium">To</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border font-mono text-[13px]">
                          {c.items.map((i) => (
                            <tr key={i.parameter}>
                              <td className="px-3 py-2 font-sans">{i.parameter}</td>
                              <td className="px-3 py-2 text-red">{i.from}</td>
                              <td>
                                <ArrowRight className="size-3.5 text-fg-subtle" />
                              </td>
                              <td className="px-3 py-2 text-green">{i.to}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </DocSection>
                ) : null}
                {c.description ? (
                  <DocSection title="Description">
                    <Markdown projectSlug={project.slug}>{c.description}</Markdown>
                  </DocSection>
                ) : null}
                <DocSection title="Result">{c.result ? <Markdown projectSlug={project.slug}>{c.result}</Markdown> : <p className="text-sm text-fg-subtle">Not yet recorded.</p>}</DocSection>
                <Comments project={project.slug} target={{ type: "change", id: c.id }} comments={discussion.comments} files={discussion.files} />
              </>
            )
          }
          side={
            <>
              <SideSection title="Properties">
                <Prop label="Status">
                  <PropertySelect url={api} field="status" value={c.status} disabled={!canWrite} options={Object.entries(CHANGE_STATUS).map(([v, m]) => ({ value: v, label: m.label }))} />
                </Prop>
                <Prop label="Author">
                  <span className="px-1.5 text-sm">{c.author?.displayName ?? "—"}</span>
                </Prop>
              </SideSection>
              <LinksPanel project={project.slug} source={{ type: "change", id: c.id }} links={links} canEdit={canWrite} />
              {role === "admin" ? (
                <ActionButton variant="ghost" size="xs" method="DELETE" url={api} confirm={`Delete ${c.ref}?`} redirectTo={`${base}/changes`} className="self-start text-red">
                  Delete change
                </ActionButton>
              ) : null}
            </>
          }
        />
      </Content>
    </>
  );
}
