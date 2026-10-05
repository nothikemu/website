import Link from "next/link";
import { Lock } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { getEntry } from "@/server/services/notebook";
import { loadDiscussion } from "@/server/services/comments";
import { load, pageNumber } from "@/server/services/page-access";
import { Content } from "@/components/app/page-header";
import { DetailLayout, ProjectHeader, Prop, SideSection } from "@/components/project/shared";
import { LinksPanel } from "@/components/project/links-panel";
import { Comments } from "@/components/project/comments";
import { ResourceForm } from "@/components/forms/resource-form";
import { ActionButton } from "@/components/forms/actions";
import { Markdown } from "@/components/ui/markdown";
import { Avatar } from "@/components/ui/avatar";
import { buttonClass } from "@/components/ui/button";
import { longDate, timestamp } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const metadata = { title: "Notebook entry" };

export default async function EntryPage({ params, searchParams }: { params: Promise<{ slug: string; number: string }>; searchParams: Promise<{ edit?: string; rev?: string }> }) {
  const { slug, number } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const { access, entry: e, revisions, links } = await load(getEntry(user, slug, pageNumber(number)));
  const { project, org, role } = access;
  const discussion = await loadDiscussion(user, slug, "notebook_entry", e.id);
  const base = `/project/${project.slug}`;
  const api = `/api/v1/projects/${project.slug}/notebook/${e.number}`;
  const isAuthor = e.authorId === user.id && role !== "viewer";
  const rev = sp.rev ? revisions.find((r) => r.revision === Number(sp.rev)) : null;
  return (
    <>
      <ProjectHeader project={project} org={org} crumbs={[{ label: "Notebook", href: `${base}/notebook` }, { label: e.ref }]} />
      <Content wide>
        <DetailLayout
          main={
            sp.edit && isAuthor ? (
              <div className="rounded-lg border border-border bg-surface p-5">
                <p className="mb-4 text-xs text-fg-muted">Saving creates revision {e.revisionCount + 1}. The original text stays in the history.</p>
                <ResourceForm
                  method="PATCH"
                  action={api}
                  submitLabel="Save amendment"
                  redirectTo={`${base}/notebook/${e.number}`}
                  cancelHref={`${base}/notebook/${e.number}`}
                  initial={{ title: e.title, body: e.body, tags: e.tags.join(", ") }}
                  fields={[
                    { name: "title", label: "Title", type: "text", required: true },
                    { name: "body", label: "Entry", type: "markdown", rows: 16 },
                    { name: "tags", label: "Tags", type: "tags" },
                  ]}
                />
              </div>
            ) : (
              <article>
                <div className="mb-1 font-mono text-sm text-fg-subtle">
                  {e.ref} · {longDate(e.entryDate)}
                </div>
                <div className="flex items-start justify-between gap-3">
                  <h1 className="text-xl font-semibold tracking-[-0.02em]">{rev ? rev.title : e.title}</h1>
                  {isAuthor && !rev ? (
                    <Link href="?edit=1" className={buttonClass("ghost", "sm")}>
                      Amend
                    </Link>
                  ) : null}
                </div>
                <div className="mt-2 mb-5 flex items-center gap-2 text-xs text-fg-subtle">
                  <Avatar user={e.author} size={16} /> <span className="text-fg-muted">{e.author?.displayName}</span>
                  <Lock className="size-3" /> <span className="font-mono">{timestamp(e.createdAt)} UTC</span>
                  {e.editedAt ? <span>· amended {timestamp(e.editedAt)}</span> : null}
                </div>
                {rev ? (
                  <p className="mb-4 rounded-md border border-amber/30 bg-amber-soft px-3 py-2 text-xs text-amber">
                    Viewing revision {rev.revision} of {e.revisionCount}.{" "}
                    <Link href={`${base}/notebook/${e.number}`} className="font-medium underline">
                      Current version
                    </Link>
                  </p>
                ) : null}
                <Markdown projectSlug={project.slug}>{rev ? rev.body : e.body}</Markdown>
                <div className="mt-5 flex flex-wrap gap-1.5">
                  {e.tags.map((t) => (
                    <Link key={t} href={`${base}/notebook?tag=${encodeURIComponent(t)}`} className="rounded-sm bg-surface-2 px-1.5 py-0.5 font-mono text-2xs text-fg-muted hover:text-fg">
                      #{t}
                    </Link>
                  ))}
                </div>
                <Comments project={project.slug} target={{ type: "notebook_entry", id: e.id }} comments={discussion.comments} files={discussion.files} />
              </article>
            )
          }
          side={
            <>
              <SideSection title="Record">
                <Prop label="Author">
                  <span className="px-1.5">{e.author?.displayName ?? "Deleted user"}</span>
                </Prop>
                <Prop label="Work date">
                  <span className="px-1.5 font-mono text-xs">{e.entryDate}</span>
                </Prop>
                <Prop label="Recorded">
                  <span className="px-1.5 font-mono text-xs">{timestamp(e.createdAt)}</span>
                </Prop>
              </SideSection>
              <SideSection title={`Revisions · ${revisions.length}`}>
                <ol>
                  {revisions.map((r) => (
                    <li key={r.id}>
                      <Link href={r.revision === e.revisionCount ? `${base}/notebook/${e.number}` : `?rev=${r.revision}`} className={cn("flex items-center gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-surface-2", (rev?.revision ?? e.revisionCount) === r.revision && "bg-surface-2")}>
                        <span className="font-mono text-fg-subtle">r{r.revision}</span>
                        <span className="flex-1 truncate">{r.by?.displayName}</span>
                        <span className="font-mono text-2xs text-fg-subtle">{timestamp(r.createdAt).slice(5)}</span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </SideSection>
              <LinksPanel project={project.slug} source={{ type: "notebook_entry", id: e.id }} links={links} canEdit={role !== "viewer"} />
              {role === "admin" ? (
                <ActionButton variant="ghost" size="xs" method="DELETE" url={api} confirm="Delete this notebook entry permanently?" redirectTo={`${base}/notebook`} className="self-start text-red">
                  Delete entry
                </ActionButton>
              ) : null}
            </>
          }
        />
      </Content>
    </>
  );
}
