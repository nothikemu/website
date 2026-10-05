import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, GitCompareArrows, RotateCcw } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { diffVersions, getFileDetail } from "@/server/services/files";
import { linksFor } from "@/server/services/links";
import { loadDiscussion } from "@/server/services/comments";
import { load } from "@/server/services/page-access";
import { Content } from "@/components/app/page-header";
import { DetailLayout, ProjectHeader, SideSection, Prop } from "@/components/project/shared";
import { LinksPanel } from "@/components/project/links-panel";
import { Comments } from "@/components/project/comments";
import { FilePreview } from "@/components/files/file-preview";
import { DiffView } from "@/components/files/diff-view";
import { RevisionUpload } from "@/components/files/revision-upload";
import { FileIcon } from "@/components/files/file-icon";
import { ActionButton } from "@/components/forms/actions";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Mono } from "@/components/ui/misc";
import { Time } from "@/components/app/time";
import { buttonClass } from "@/components/ui/button";
import { formatBytes } from "@/lib/plans";
import { titleCase, cn } from "@/lib/utils";

const META_LABEL: Record<string, string> = {
  applicationProtocol: "STEP protocol",
  schema: "Schema",
  originatingSystem: "Originating system",
  preprocessor: "Preprocessor",
  timestamp: "Exported",
  author: "Author",
  description: "Description",
  entityCount: "Entities",
  solidBodies: "Solid bodies",
  lengthUnit: "Length unit",
  triangles: "Triangles",
  format: "Format",
  formatVersion: "Format version",
  generator: "Generator",
  footprints: "Footprints",
  copperLayers: "Copper layers",
  symbols: "Symbols",
  width: "Width (px)",
  height: "Height (px)",
  pdfVersion: "PDF version",
  pages: "Pages",
  rows: "Rows",
  columns: "Columns",
  lines: "Lines",
};

export async function generateMetadata() {
  return { title: "File" };
}

export default async function FileDetailPage({ params, searchParams }: { params: Promise<{ slug: string; id: string }>; searchParams: Promise<{ v?: string; compare?: string; to?: string }> }) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await load(getFileDetail(user, slug, id));
  const { project, org, role } = d.access;
  const base = `/project/${project.slug}`;
  const api = `/api/v1/projects/${project.slug}/files/${d.file.id}`;
  const current = d.versions.find((v) => v.id === d.file.currentVersionId) ?? d.versions[0]!;
  const viewing = d.versions.find((v) => v.id === sp.v) ?? current;
  const compareA = sp.compare ? d.versions.find((v) => v.id === sp.compare) : null;
  const compareB = compareA ? (d.versions.find((v) => v.id === sp.to) ?? current) : null;
  const [diff, links, discussion] = await Promise.all([
    compareA && compareB && compareA.id !== compareB.id ? diffVersions(user, slug, d.file.id, compareA.id, compareB.id) : null,
    linksFor(project.id, project.slug, { type: "file", id: d.file.id }),
    loadDiscussion(user, slug, "file", d.file.id),
  ]);
  const canWrite = role !== "viewer";
  const meta = Object.entries(viewing.metadata).filter(([k]) => k !== "columns");
  return (
    <>
      <ProjectHeader
        project={project}
        org={org}
        crumbs={[{ label: "Files", href: `${base}/files` }, ...d.breadcrumbs.map((b) => ({ label: b.name, href: `${base}/files?folder=${b.id}` })), { label: d.file.name }]}
        actions={
          <>
            <a href={`${api}/download${viewing.id !== current.id ? `?version=${viewing.id}` : ""}`} className={buttonClass("secondary", "sm")}>
              <Download className="size-3.5" /> Download
            </a>
            {canWrite ? <RevisionUpload fileId={d.file.id} folderId={d.file.folderId} name={d.file.name} /> : null}
          </>
        }
      />
      <Content wide>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <FileIcon kind={d.file.kind} className="size-5" />
          <h1 className="font-mono text-base font-medium">{d.file.path}</h1>
          <Badge>{titleCase(d.file.kind)}</Badge>
          <span className="font-mono text-xs text-fg-subtle">
            v{d.file.versionCount} · {formatBytes(d.file.size)}
          </span>
        </div>
        <DetailLayout
          main={
            <>
              {diff ? (
                <section className="overflow-hidden rounded-lg border border-border bg-surface">
                  <div className="flex items-center justify-between border-b border-border bg-bg-subtle px-3 py-2 text-xs">
                    <span className="flex items-center gap-2 font-medium">
                      <GitCompareArrows className="size-3.5" /> Comparing v{compareA!.number} → v{compareB!.number}
                      <span className="font-normal text-fg-subtle">{diff.mode === "metadata" ? "binary file — metadata & checksum comparison" : "line diff"}</span>
                    </span>
                    <Link href={`${base}/files/${d.file.id}`} className="text-fg-subtle hover:text-fg">
                      Close
                    </Link>
                  </div>
                  <DiffView diff={diff} />
                </section>
              ) : (
                <section className="overflow-hidden rounded-lg border border-border bg-surface">
                  {viewing.id !== current.id ? (
                    <div className="flex items-center justify-between border-b border-amber/30 bg-amber-soft px-3 py-1.5 text-xs text-amber">
                      Viewing v{viewing.number} — not the current revision
                      <Link href={`${base}/files/${d.file.id}`} className="font-medium underline">
                        View current
                      </Link>
                    </div>
                  ) : null}
                  <FilePreview project={project.slug} fileId={d.file.id} versionId={viewing.id} kind={d.preview} name={d.file.name} metadata={viewing.metadata} />
                </section>
              )}

              {meta.length ? (
                <section className="mt-4 rounded-lg border border-border bg-surface">
                  <h2 className="border-b border-border px-3 py-2 text-2xs font-medium tracking-wide text-fg-subtle uppercase">Extracted metadata · v{viewing.number}</h2>
                  <dl className="grid gap-x-6 px-3 py-2 sm:grid-cols-2">
                    {meta.map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-4 border-b border-border/60 py-1.5 text-sm last:border-0">
                        <dt className="text-fg-muted">{META_LABEL[k] ?? k}</dt>
                        <dd className="truncate font-mono text-xs">{String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ) : null}

              <section className="mt-4 rounded-lg border border-border bg-surface">
                <h2 className="flex items-center justify-between border-b border-border px-3 py-2 text-2xs font-medium tracking-wide text-fg-subtle uppercase">
                  Revision history <span className="font-mono normal-case">{d.versions.length} revisions</span>
                </h2>
                <ol className="divide-y divide-border">
                  {d.versions.map((v, i) => {
                    const prev = d.versions[i + 1];
                    return (
                      <li key={v.id} className={cn("flex flex-wrap items-center gap-3 px-3 py-2.5", v.id === viewing.id && "bg-surface-2/50")}>
                        <Mono className={cn("w-8 text-sm font-medium", v.id === current.id ? "text-accent" : "text-fg-muted")}>v{v.number}</Mono>
                        <Avatar user={v.uploader} size={20} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm">
                            {v.message ?? <span className="text-fg-subtle">No message</span>}
                            {v.restoredFromVersionId ? <Badge className="ml-2">restore</Badge> : null}
                          </div>
                          <div className="font-mono text-2xs text-fg-subtle">
                            {v.uploader?.displayName ?? "Unknown"} · <Time date={v.createdAt} /> · {formatBytes(v.size)}
                            {v.checksum ? ` · ${v.checksum.slice(0, 10)}` : ""}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {v.id !== viewing.id ? (
                            <Link href={`${base}/files/${d.file.id}?v=${v.id}`} className={buttonClass("ghost", "xs")}>
                              View
                            </Link>
                          ) : null}
                          {prev ? (
                            <Link href={`${base}/files/${d.file.id}?compare=${prev.id}&to=${v.id}`} className={buttonClass("ghost", "xs")}>
                              Diff v{prev.number}
                            </Link>
                          ) : null}
                          {v.id !== current.id ? (
                            <Link href={`${base}/files/${d.file.id}?compare=${v.id}&to=${current.id}`} className={buttonClass("ghost", "xs")}>
                              vs current
                            </Link>
                          ) : null}
                          <a href={`${api}/download?version=${v.id}`} className={buttonClass("ghost", "icon-sm")} aria-label="Download revision">
                            <Download className="size-3.5" />
                          </a>
                          {canWrite && v.id !== current.id ? (
                            <ActionButton size="xs" variant="outline" url={`${api}/restore`} body={{ versionId: v.id }} confirm={`Restore v${v.number}? This creates a new revision with its contents.`} successMessage={`Restored v${v.number}`} redirectTo={`${base}/files/${d.file.id}`}>
                              <RotateCcw className="size-3" /> Restore
                            </ActionButton>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
              <Comments project={project.slug} target={{ type: "file", id: d.file.id }} comments={discussion.comments} files={discussion.files} />
            </>
          }
          side={
            <>
              <SideSection title="Details">
                <Prop label="Path">
                  <span className="font-mono text-xs break-all">{d.file.path}</span>
                </Prop>
                <Prop label="Type">
                  <span className="font-mono text-xs">{d.file.mimeType}</span>
                </Prop>
                <Prop label="Revision">
                  <span className="font-mono text-xs">v{current.number}</span>
                </Prop>
                <Prop label="Size">
                  <span className="font-mono text-xs">{formatBytes(d.file.size)}</span>
                </Prop>
                <Prop label="Created">
                  <Time date={d.file.createdAt} className="text-xs" />
                </Prop>
                <Prop label="Updated">
                  <Time date={d.file.updatedAt} className="text-xs" />
                </Prop>
              </SideSection>
              <LinksPanel project={project.slug} source={{ type: "file", id: d.file.id }} links={links} canEdit={canWrite} />
            </>
          }
        />
      </Content>
    </>
  );
}
