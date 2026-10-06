import Link from "next/link";
import { Plus, Tag } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { listReleases } from "@/server/services/releases";
import { load } from "@/server/services/page-access";
import { Content, PageTitle } from "@/components/app/page-header";
import { ProjectHeader } from "@/components/project/shared";
import { StatusBadge } from "@/components/app/status";
import { EmptyState } from "@/components/ui/misc";
import { Markdown } from "@/components/ui/markdown";
import { buttonClass } from "@/components/ui/button";
import { longDate } from "@/lib/dates";
import { RELEASE_STATUS } from "@/lib/status";

export const metadata = { title: "Releases" };

export default async function ReleasesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const { access, releases } = await load(listReleases(user, slug));
  const { project, org, role } = access;
  const base = `/project/${project.slug}`;
  return (
    <>
      <ProjectHeader project={project} org={org} crumbs={[{ label: "Releases" }]} actions={role !== "viewer" ? <Link href={`${base}/releases/new`} className={buttonClass("primary", "sm")}><Plus className="size-3.5" /> Draft release</Link> : null} />
      <Content>
        <PageTitle title="Releases" description="A release pins a CAD/files version and firmware commit, and records the verification state of every requirement and test at that moment." />
        <div className="mt-5 flex flex-col gap-4">
          {releases.length ? (
            releases.map((r) => (
              <article key={r.id} className="grid gap-4 md:grid-cols-[160px_minmax(0,1fr)]">
                <div className="text-xs text-fg-subtle md:pt-4 md:text-right">
                  <div className="font-mono text-sm text-fg">{r.tag}</div>
                  {r.publishedAt ? longDate(r.publishedAt) : "Draft"}
                </div>
                <Link href={`${base}/releases/${encodeURIComponent(r.tag)}`} className="group rounded-lg border border-border bg-surface p-4 transition-colors hover:border-border-strong">
                  <div className="flex items-center gap-2">
                    <Tag className="size-4 text-accent" />
                    <h2 className="text-sm font-semibold group-hover:text-accent">{r.name}</h2>
                    <StatusBadge map={RELEASE_STATUS} value={r.status} />
                    {r.snapshot ? <span className="ml-auto font-mono text-2xs text-fg-subtle">Version {r.snapshot.number}</span> : null}
                  </div>
                  {r.manifest ? (
                    <div className="mt-2 flex flex-wrap gap-4 font-mono text-xs text-fg-muted">
                      <span>
                        req {r.manifest.requirements.verified}/{r.manifest.requirements.total} verified
                      </span>
                      <span className={r.manifest.tests.failed ? "text-red" : ""}>
                        tests {r.manifest.tests.passed}/{r.manifest.tests.total} passing
                      </span>
                      <span>{r.manifest.changes.length} changes</span>
                      <span>{r.manifest.issuesClosed.length} issues closed</span>
                    </div>
                  ) : null}
                  {r.notes ? (
                    <div className="relative mt-3 max-h-40 overflow-hidden">
                      <Markdown projectSlug={project.slug}>{r.notes}</Markdown>
                      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-surface" />
                    </div>
                  ) : null}
                </Link>
              </article>
            ))
          ) : (
            <EmptyState icon={<Tag className="size-4" />} title="No releases yet" description="Cut a release when the robot reaches a milestone — notes are generated from what actually happened in the project." className="rounded-lg border border-dashed border-border" />
          )}
        </div>
      </Content>
    </>
  );
}
