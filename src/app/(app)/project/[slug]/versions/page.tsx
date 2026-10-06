import Link from "next/link";
import { GitCompareArrows, History } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { listSnapshots, pendingChanges } from "@/server/services/snapshots";
import { load } from "@/server/services/page-access";
import { Content, PageTitle } from "@/components/app/page-header";
import { ProjectHeader } from "@/components/project/shared";
import { Panel, EmptyState, Mono } from "@/components/ui/misc";
import { ChangeList } from "@/components/project/change-list";
import { CreateVersion } from "@/components/project/create-version";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Time } from "@/components/app/time";

export const metadata = { title: "Versions" };

export default async function VersionsPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ new?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const [{ access, snapshots }, pending] = await Promise.all([load(listSnapshots(user, slug)), load(pendingChanges(user, slug))]);
  const { project, org, role } = access;
  const base = `/project/${project.slug}`;
  const nothing = pending.summary.added + pending.summary.modified + pending.summary.removed === 0;
  return (
    <>
      <ProjectHeader project={project} org={org} crumbs={[{ label: "Versions" }]} />
      <Content>
        <PageTitle
          title="Versions"
          description="A version is an immutable record of which revision of every file was current — the project-level equivalent of a commit. Restore, compare, and attach them to releases."
          actions={role !== "viewer" ? <CreateVersion project={project.slug} nextNumber={(snapshots[0]?.number ?? 0) + 1} summary={pending.summary} defaultOpen={sp.new === "1"} disabled={nothing} /> : null}
        />
        <Panel title={pending.latest ? `Changes since Version ${pending.latest.number}` : "Uncommitted files"} count={pending.changes.length} className="mt-5">
          <ChangeList project={project.slug} changes={pending.changes} />
        </Panel>
        <Panel title="History" count={snapshots.length} className="mt-5">
          {snapshots.length ? (
            <ol className="divide-y divide-border">
              {snapshots.map((s, i) => (
                <li key={s.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 hover:bg-surface-2/60">
                  <Link href={`${base}/versions/${s.number}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <History className="size-4 shrink-0 text-fg-subtle" />
                    <Mono className="w-20 shrink-0 text-sm font-medium">Version {s.number}</Mono>
                    <span className="min-w-0 flex-1 truncate text-sm">{s.name}</span>
                    {s.tag ? <Badge tone="accent" className="font-mono">{s.tag}</Badge> : null}
                  </Link>
                  <span className="font-mono text-2xs">
                    <span className="text-green">+{s.changeSummary.added}</span> <span className="text-amber">~{s.changeSummary.modified}</span> <span className="text-red">−{s.changeSummary.removed}</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-xs text-fg-muted">
                    <Avatar user={s.author} size={16} /> <Time date={s.createdAt} />
                  </span>
                  {snapshots[i + 1] ? (
                    <Link href={`${base}/versions/compare?a=${snapshots[i + 1]!.number}&b=${s.number}`} className="text-fg-subtle hover:text-fg" aria-label="Compare with previous">
                      <GitCompareArrows className="size-3.5" />
                    </Link>
                  ) : (
                    <span className="w-3.5" />
                  )}
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState title="No versions yet" description="Upload files, then create Version 1 to freeze the baseline design." />
          )}
        </Panel>
      </Content>
    </>
  );
}
