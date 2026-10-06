import Link from "next/link";
import { requireUser } from "@/server/auth/current";
import { compareSnapshots, listSnapshots } from "@/server/services/snapshots";
import { load } from "@/server/services/page-access";
import { Content, PageTitle } from "@/components/app/page-header";
import { ProjectHeader } from "@/components/project/shared";
import { Panel } from "@/components/ui/misc";
import { ChangeList } from "@/components/project/change-list";

export const metadata = { title: "Compare versions" };

export default async function ComparePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ a?: string; b?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const { access, snapshots } = await load(listSnapshots(user, slug));
  const { project, org } = access;
  const base = `/project/${project.slug}`;
  const a = Number(sp.a ?? snapshots[1]?.number ?? 1);
  const b = Number(sp.b ?? snapshots[0]?.number ?? 1);
  const result = snapshots.length >= 1 ? await load(compareSnapshots(user, slug, a, b)) : null;
  return (
    <>
      <ProjectHeader project={project} org={org} crumbs={[{ label: "Versions", href: `${base}/versions` }, { label: "Compare" }]} />
      <Content>
        <PageTitle title="Compare versions" />
        <form className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <select name="a" defaultValue={a} className="h-8 rounded-md border border-border bg-surface px-2 font-mono text-xs">
            {snapshots.map((s) => (
              <option key={s.id} value={s.number}>
                Version {s.number} — {s.name}
              </option>
            ))}
          </select>
          <span className="text-fg-subtle">→</span>
          <select name="b" defaultValue={b} className="h-8 rounded-md border border-border bg-surface px-2 font-mono text-xs">
            {snapshots.map((s) => (
              <option key={s.id} value={s.number}>
                Version {s.number} — {s.name}
              </option>
            ))}
          </select>
          <button className="h-8 rounded-md border border-border bg-surface-2 px-3 text-xs font-medium hover:bg-surface-3">Compare</button>
        </form>
        {result ? (
          <Panel
            title={`Version ${result.a.number} → Version ${result.b.number}`}
            className="mt-5"
            action={
              <span className="font-mono text-2xs">
                <span className="text-green">+{result.summary.added}</span> <span className="text-amber">~{result.summary.modified}</span> <span className="text-red">−{result.summary.removed}</span>
              </span>
            }
          >
            <ChangeList project={project.slug} changes={result.changes} />
          </Panel>
        ) : (
          <p className="mt-6 text-sm text-fg-muted">
            Create at least one <Link href={`${base}/versions`} className="underline">version</Link> to compare.
          </p>
        )}
      </Content>
    </>
  );
}
