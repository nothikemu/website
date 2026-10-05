import Link from "next/link";
import { GitCompareArrows, RotateCcw } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { getSnapshot } from "@/server/services/snapshots";
import { loadDiscussion } from "@/server/services/comments";
import { load } from "@/server/services/page-access";
import { intParam } from "@/server/http/api";
import { Content } from "@/components/app/page-header";
import { DetailLayout, ProjectHeader, Prop, SideSection } from "@/components/project/shared";
import { Panel } from "@/components/ui/misc";
import { ChangeList } from "@/components/project/change-list";
import { Comments } from "@/components/project/comments";
import { Markdown } from "@/components/ui/markdown";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/forms/actions";
import { buttonClass } from "@/components/ui/button";
import { timestamp } from "@/lib/dates";

export const metadata = { title: "Version" };

export default async function VersionPage({ params, searchParams }: { params: Promise<{ slug: string; number: string }>; searchParams: Promise<{ all?: string }> }) {
  const { slug, number } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const n = await load(Promise.resolve().then(() => intParam(number, "Version")));
  const { access, snapshot, previous, changes } = await load(getSnapshot(user, slug, n));
  const discussion = await loadDiscussion(user, slug, "snapshot", snapshot.id);
  const { project, org, role } = access;
  const base = `/project/${project.slug}`;
  return (
    <>
      <ProjectHeader
        project={project}
        org={org}
        crumbs={[{ label: "Versions", href: `${base}/versions` }, { label: `Version ${snapshot.number}` }]}
        actions={
          <>
            {previous ? (
              <Link href={`${base}/versions/compare?a=${previous.number}&b=${snapshot.number}`} className={buttonClass("ghost", "sm")}>
                <GitCompareArrows className="size-3.5" /> Compare
              </Link>
            ) : null}
            {role !== "viewer" ? (
              <ActionButton
                size="sm"
                url={`/api/v1/projects/${project.slug}/versions/${snapshot.number}/restore`}
                confirm={`Restore all files to Version ${snapshot.number}? Changed files get a new revision; files added later move to trash. Nothing is lost.`}
                successMessage={`Project restored to Version ${snapshot.number}`}
                redirectTo={`${base}/files`}
              >
                <RotateCcw className="size-3.5" /> Restore
              </ActionButton>
            ) : null}
          </>
        }
      />
      <Content wide>
        <DetailLayout
          main={
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold tracking-[-0.02em]">
                  <span className="font-mono text-fg-subtle">Version {snapshot.number}</span> {snapshot.name}
                </h1>
                {snapshot.tag ? <Badge tone="accent" className="font-mono">{snapshot.tag}</Badge> : null}
              </div>
              {snapshot.description ? <Markdown className="mt-3" projectSlug={project.slug}>{snapshot.description}</Markdown> : null}
              <Panel
                title={previous ? `Changed since Version ${previous.number}` : "Files in this version"}
                count={changes.filter((c) => sp.all || c.status !== "unchanged").length}
                className="mt-5"
                action={
                  <Link href={sp.all ? "?" : "?all=1"} className="text-xs text-fg-subtle hover:text-fg">
                    {sp.all ? "Changed only" : "Show all files"}
                  </Link>
                }
              >
                <ChangeList project={project.slug} changes={changes} showUnchanged={Boolean(sp.all)} />
              </Panel>
              <Comments project={project.slug} target={{ type: "snapshot", id: snapshot.id }} comments={discussion.comments} files={discussion.files} />
            </>
          }
          side={
            <SideSection title="Details">
              <Prop label="Author">
                <span className="flex items-center gap-1.5">
                  <Avatar user={snapshot.author} size={16} /> {snapshot.author?.displayName ?? "—"}
                </span>
              </Prop>
              <Prop label="Created">
                <span className="font-mono text-xs">{timestamp(snapshot.createdAt)}</span>
              </Prop>
              <Prop label="Files">
                <span className="font-mono text-xs">{snapshot.fileCount}</span>
              </Prop>
              <Prop label="Changes">
                <span className="font-mono text-xs">
                  <span className="text-green">+{snapshot.changeSummary.added}</span> <span className="text-amber">~{snapshot.changeSummary.modified}</span> <span className="text-red">−{snapshot.changeSummary.removed}</span>
                </span>
              </Prop>
            </SideSection>
          }
        />
      </Content>
    </>
  );
}
