import Link from "next/link";
import { FlaskConical, Plus } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { getRequirement } from "@/server/services/requirements";
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
import { requirementFields } from "@/components/project/field-sets";
import { VerificationBadge } from "@/components/project/verification";
import { StatusBadge } from "@/components/app/status";
import { Markdown } from "@/components/ui/markdown";
import { buttonClass } from "@/components/ui/button";
import { REQ_PRIORITY, REQ_STATUS, TEST_STATUS } from "@/lib/status";
import { titleCase } from "@/lib/utils";

export const metadata = { title: "Requirement" };

export default async function RequirementPage({ params, searchParams }: { params: Promise<{ slug: string; number: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { slug, number } = await params;
  const { edit } = await searchParams;
  const user = await requireUser();
  const { access, requirement: r, children, links } = await load(getRequirement(user, slug, pageNumber(number)));
  const { project, org, role } = access;
  const [people, discussion] = await Promise.all([projectPeople(access), loadDiscussion(user, slug, "requirement", r.id)]);
  const base = `/project/${project.slug}`;
  const api = `/api/v1/projects/${project.slug}/requirements/${r.number}`;
  const canWrite = role !== "viewer";
  const tests = links.filter((l) => l.type === "test");
  return (
    <>
      <ProjectHeader project={project} org={org} crumbs={[{ label: "Requirements", href: `${base}/requirements` }, { label: r.ref }]} />
      <Content wide>
        <DetailLayout
          main={
            edit && canWrite ? (
              <div className="rounded-lg border border-border bg-surface p-5">
                <ResourceForm
                  method="PATCH"
                  action={api}
                  submitLabel="Save requirement"
                  redirectTo={`${base}/requirements/${r.number}`}
                  cancelHref={`${base}/requirements/${r.number}`}
                  layout="grid"
                  initial={{ title: r.title, description: r.description ?? "", rationale: r.rationale ?? "", priority: r.priority, status: r.status, verificationMethod: r.verificationMethod, ownerId: r.ownerId ?? "" }}
                  fields={requirementFields(people)}
                />
              </div>
            ) : (
              <>
                <RecordTitle refLabel={r.ref} title={r.title} badges={<><StatusBadge map={REQ_STATUS} value={r.status} /><VerificationBadge value={r.verification} /></>} author={r.owner} createdAt={r.createdAt} editHref={canWrite ? "?edit=1" : null} />
                {r.parent ? (
                  <p className="mb-3 text-xs text-fg-subtle">
                    Derived from <Link className="text-fg-muted hover:text-fg" href={`${base}/requirements/${r.parent.number}`}>REQ-{String(r.parent.number).padStart(3, "0")} {r.parent.title}</Link>
                  </p>
                ) : null}
                {r.description ? <Markdown projectSlug={project.slug}>{r.description}</Markdown> : null}
                {r.rationale ? (
                  <DocSection title="Rationale">
                    <Markdown projectSlug={project.slug} className="text-fg-muted">{r.rationale}</Markdown>
                  </DocSection>
                ) : null}
                <DocSection
                  title="Verification"
                  action={canWrite ? <Link href={`${base}/tests/new?req=${r.number}`} className={buttonClass("ghost", "xs")}><Plus className="size-3" /> Add test</Link> : null}
                >
                  <div className="rounded-lg border border-border bg-surface">
                    <div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs text-fg-muted">
                      Method: <span className="font-medium text-fg">{titleCase(r.verificationMethod)}</span>
                      <span className="ml-auto">
                        <VerificationBadge value={r.verification} />
                      </span>
                    </div>
                    {tests.length ? (
                      <ul className="divide-y divide-border">
                        {tests.map((t) => (
                          <li key={t.linkId}>
                            <Link href={t.url} className="flex items-center gap-3 px-3 py-2 hover:bg-surface-2/60">
                              <FlaskConical className="size-3.5 text-fg-subtle" />
                              <span className="font-mono text-xs text-fg-subtle">{t.ref}</span>
                              <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                              {t.status ? <StatusBadge map={TEST_STATUS} value={t.status} /> : null}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="px-3 py-3 text-sm text-fg-subtle">{r.verificationMethod === "test" ? "No test verifies this requirement yet." : "Verified by " + r.verificationMethod + " — attach evidence via links or comments."}</p>
                    )}
                  </div>
                </DocSection>
                {children.length ? (
                  <DocSection title="Derived requirements">
                    <ul className="rounded-lg border border-border bg-surface">
                      {children.map((c) => (
                        <li key={c.ref}>
                          <Link href={`${base}/requirements/${c.number}`} className="flex gap-3 px-3 py-2 text-sm hover:bg-surface-2/60">
                            <span className="font-mono text-xs text-fg-subtle">{c.ref}</span> {c.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </DocSection>
                ) : null}
                <Comments project={project.slug} target={{ type: "requirement", id: r.id }} comments={discussion.comments} files={discussion.files} />
              </>
            )
          }
          side={
            <>
              <SideSection title="Properties">
                <Prop label="Status">
                  <PropertySelect url={api} field="status" value={r.status} disabled={!canWrite} options={Object.entries(REQ_STATUS).map(([v, m]) => ({ value: v, label: m.label }))} />
                </Prop>
                <Prop label="Priority">
                  <PropertySelect url={api} field="priority" value={r.priority} disabled={!canWrite} options={Object.entries(REQ_PRIORITY).map(([v, m]) => ({ value: v, label: m.label }))} />
                </Prop>
                <Prop label="Verify by">
                  <PropertySelect url={api} field="verificationMethod" value={r.verificationMethod} disabled={!canWrite} options={["test", "analysis", "inspection", "demonstration"].map((v) => ({ value: v, label: titleCase(v) }))} />
                </Prop>
                <Prop label="Owner">
                  <PropertySelect url={api} field="ownerId" value={r.ownerId} nullable disabled={!canWrite} display="person" people={people} options={people.map((p) => ({ value: p.id, label: p.displayName }))} />
                </Prop>
              </SideSection>
              <LinksPanel project={project.slug} source={{ type: "requirement", id: r.id }} links={links} canEdit={canWrite} />
              {role === "admin" ? (
                <ActionButton variant="ghost" size="xs" method="DELETE" url={api} confirm={`Delete ${r.ref}? Links to it will be removed.`} redirectTo={`${base}/requirements`} className="self-start text-red">
                  Delete requirement
                </ActionButton>
              ) : null}
            </>
          }
        />
      </Content>
    </>
  );
}
