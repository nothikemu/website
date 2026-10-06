import Link from "next/link";
import { NotebookPen, Plus } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { listEntries } from "@/server/services/notebook";
import { load } from "@/server/services/page-access";
import { Content, PageTitle } from "@/components/app/page-header";
import { ProjectHeader } from "@/components/project/shared";
import { FilterBar } from "@/components/project/filter-bar";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/misc";
import { Markdown } from "@/components/ui/markdown";
import { buttonClass } from "@/components/ui/button";
import { dayLabel, timestamp } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const metadata = { title: "Notebook" };

export default async function NotebookPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tag?: string; author?: string; q?: string; before?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const { access, entries, hasMore, tags } = await load(listEntries(user, slug, sp));
  const { project, org, role } = access;
  const base = `/project/${project.slug}`;
  const byDay = new Map<string, typeof entries>();
  for (const e of entries) byDay.set(e.entryDate, [...(byDay.get(e.entryDate) ?? []), e]);
  const last = entries[entries.length - 1];
  return (
    <>
      <ProjectHeader project={project} org={org} crumbs={[{ label: "Notebook" }]} actions={role !== "viewer" ? <Link href={`${base}/notebook/new`} className={buttonClass("primary", "sm")}><Plus className="size-3.5" /> New entry</Link> : null} />
      <Content wide>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_220px]">
          <div className="min-w-0">
            <PageTitle title="Engineering notebook" description="Dated, attributed entries. Timestamps and authorship are immutable; amendments are kept as revisions." />
            <div className="mt-4 mb-4">
              <FilterBar searchPlaceholder="Search the notebook…" filters={[]} />
            </div>
            {entries.length ? (
              <div className="flex flex-col gap-6">
                {[...byDay].map(([day, list]) => (
                  <section key={day} className="grid gap-3 md:grid-cols-[130px_minmax(0,1fr)]">
                    <div className="md:sticky md:top-16 md:self-start">
                      <div className="text-xs font-medium text-fg">{dayLabel(day)}</div>
                      <div className="font-mono text-2xs text-fg-subtle">{day}</div>
                    </div>
                    <div className="flex flex-col gap-3">
                      {list.map((e) => (
                        <article key={e.id} className="rounded-lg border border-border bg-surface">
                          <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
                            <span className="font-mono text-2xs text-fg-subtle">{e.ref}</span>
                            <Link href={`${base}/notebook/${e.number}`} className="text-sm font-semibold hover:text-accent">
                              {e.title}
                            </Link>
                            <span className="ml-auto flex items-center gap-1.5 text-xs text-fg-muted">
                              <Avatar user={e.author} size={16} /> {e.author?.displayName}
                              <span className="font-mono text-2xs text-fg-subtle">{timestamp(e.createdAt).slice(11)}</span>
                            </span>
                          </header>
                          <div className="relative max-h-64 overflow-hidden px-4 py-3">
                            <Markdown projectSlug={project.slug}>{e.body}</Markdown>
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-surface" />
                          </div>
                          <footer className="flex flex-wrap items-center gap-1.5 border-t border-border px-4 py-2 text-xs">
                            {e.tags.map((t) => (
                              <Link key={t} href={`${base}/notebook?tag=${encodeURIComponent(t)}`} className="rounded-sm bg-surface-2 px-1.5 py-0.5 font-mono text-2xs text-fg-muted hover:text-fg">
                                #{t}
                              </Link>
                            ))}
                            {e.revisionCount > 1 ? <span className="text-fg-subtle">· amended ({e.revisionCount - 1})</span> : null}
                            <Link href={`${base}/notebook/${e.number}`} className="ml-auto text-fg-subtle hover:text-fg">
                              Read entry →
                            </Link>
                          </footer>
                        </article>
                      ))}
                    </div>
                  </section>
                ))}
                {hasMore && last ? (
                  <Link href={`${base}/notebook?${new URLSearchParams({ ...(sp.tag ? { tag: sp.tag } : {}), before: String(last.number) })}`} className={buttonClass("secondary", "sm", "self-center")}>
                    Older entries
                  </Link>
                ) : null}
              </div>
            ) : (
              <EmptyState icon={<NotebookPen className="size-4" />} title="The notebook is empty" description="Record what you tried, what you measured and what you learned — every day you work on the robot." className="rounded-lg border border-dashed border-border" />
            )}
          </div>
          <aside className="flex flex-col gap-2 lg:sticky lg:top-16 lg:self-start">
            <h3 className="text-2xs font-medium tracking-wide text-fg-subtle uppercase">Tags</h3>
            <div className="flex flex-wrap gap-1 lg:flex-col">
              <Link href={`${base}/notebook`} className={cn("flex justify-between rounded-md px-2 py-1 text-xs", !sp.tag ? "bg-surface-2 text-fg" : "text-fg-muted hover:text-fg")}>
                All entries
              </Link>
              {tags.map((t) => (
                <Link key={t.tag} href={`${base}/notebook?tag=${encodeURIComponent(t.tag)}`} className={cn("flex justify-between gap-3 rounded-md px-2 py-1 font-mono text-xs", sp.tag === t.tag ? "bg-surface-2 text-fg" : "text-fg-muted hover:text-fg")}>
                  #{t.tag} <span className="text-fg-subtle">{t.count}</span>
                </Link>
              ))}
            </div>
          </aside>
        </div>
      </Content>
    </>
  );
}
