import Link from "next/link";
import { History, Tag } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { getRelease } from "@/server/services/releases";
import { loadDiscussion } from "@/server/services/comments";
import { load } from "@/server/services/page-access";
import { Content } from "@/components/app/page-header";
import { DetailLayout, DocSection, ProjectHeader, Prop, SideSection } from "@/components/project/shared";
import { Comments } from "@/components/project/comments";
import { ActionButton } from "@/components/forms/actions";
import { StatusBadge } from "@/components/app/status";
import { Markdown } from "@/components/ui/markdown";
import { Avatar } from "@/components/ui/avatar";
import { RELEASE_STATUS, TEST_STATUS } from "@/lib/status";
import { timestamp } from "@/lib/dates";

export const metadata = { title: "Release" };

export default async function ReleasePage({ params }: { params: Promise<{ slug: string; tag: string }> }) {
  const { slug, tag } = await params;
  const user = await requireUser();
  const { access, release: r, manifest } = await load(getRelease(user, slug, decodeURIComponent(tag)));
  const { project, org, role } = access;
  const discussion = await loadDiscussion(user, slug, "release", r.id);
  const base = `/project/${project.slug}`;
  const api = `/api/v1/projects/${project.slug}/releases/${encodeURIComponent(r.tag)}`;
  return (
    <>
      <ProjectHeader
        project={project}
        org={org}
        crumbs={[{ label: "Releases", href: `${base}/releases` }, { label: r.tag }]}
        actions={
          r.status === "draft" && role !== "viewer" ? (
            <ActionButton size="sm" variant="primary" method="PATCH" url={api} body={{ publish: true }} successMessage={`${r.tag} published`}>
              Publish release
            </ActionButton>
          ) : null
        }
      />
      <Content wide>
        <DetailLayout
          main={
            <>
              <div className="mb-5">
                <div className="flex items-center gap-2">
                  <Tag className="size-5 text-accent" />
                  <span className="font-mono text-lg">{r.tag}</span>
                  <StatusBadge map={RELEASE_STATUS} value={r.status} />
                </div>
                <h1 className="mt-1 text-xl font-semibold tracking-[-0.02em]">{r.name}</h1>
              </div>
              {manifest ? (
                <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
                  {[
                    ["Requirements verified", `${manifest.requirements.verified}/${manifest.requirements.total}`, manifest.requirements.failed ? "text-red" : ""],
                    ["Tests passing", `${manifest.tests.passed}/${manifest.tests.total}`, manifest.tests.failed ? "text-red" : "text-green"],
                    ["Changes", String(manifest.changes.length), ""],
                    ["Issues resolved", String(manifest.issuesClosed.length), ""],
                  ].map(([l, v, c]) => (
                    <div key={l} className="bg-surface p-3">
                      <div className="text-2xs text-fg-subtle">{l}</div>
                      <div className={`font-mono text-lg ${c}`}>{v}</div>
                    </div>
                  ))}
                </div>
              ) : null}
              {r.status === "draft" ? <p className="mt-2 text-xs text-fg-subtle">Draft — numbers reflect the live project state and will be frozen at publish.</p> : null}
              <DocSection title="Release notes">{r.notes ? <Markdown projectSlug={project.slug}>{r.notes}</Markdown> : <p className="text-sm text-fg-subtle">No notes.</p>}</DocSection>
              {manifest?.tests.items.length ? (
                <DocSection title="Test state at release">
                  <div className="overflow-hidden rounded-lg border border-border bg-surface">
                    <ul className="divide-y divide-border">
                      {manifest.tests.items.map((t) => (
                        <li key={t.ref} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                          <span className="font-mono text-xs text-fg-subtle">{t.ref}</span>
                          <span className="flex-1 truncate">{t.name}</span>
                          <StatusBadge map={TEST_STATUS} value={t.status} />
                        </li>
                      ))}
                    </ul>
                  </div>
                </DocSection>
              ) : null}
              <Comments project={project.slug} target={{ type: "release", id: r.id }} comments={discussion.comments} files={discussion.files} />
            </>
          }
          side={
            <>
              <SideSection title="Contents">
                <Prop label="Files">
                  {r.snapshot ? (
                    <Link href={`${base}/versions/${r.snapshot.number}`} className="flex items-center gap-1 px-1.5 text-sm hover:text-accent">
                      <History className="size-3.5" /> Version {r.snapshot.number}
                    </Link>
                  ) : (
                    <span className="px-1.5 text-fg-subtle">—</span>
                  )}
                </Prop>
                <Prop label="Firmware">
                  <span className="px-1.5 font-mono text-xs">{r.firmwareCommit?.slice(0, 12) ?? "—"}</span>
                </Prop>
                <Prop label="Author">
                  <span className="flex items-center gap-1.5 px-1.5">
                    <Avatar user={r.author} size={16} /> {r.author?.displayName}
                  </span>
                </Prop>
                <Prop label="Published">
                  <span className="px-1.5 font-mono text-xs">{r.publishedAt ? timestamp(r.publishedAt) : "Draft"}</span>
                </Prop>
              </SideSection>
              {role === "admin" ? (
                <ActionButton variant="ghost" size="xs" method="DELETE" url={api} confirm={`Delete release ${r.tag}?`} redirectTo={`${base}/releases`} className="self-start text-red">
                  Delete release
                </ActionButton>
              ) : null}
            </>
          }
        />
      </Content>
    </>
  );
}
