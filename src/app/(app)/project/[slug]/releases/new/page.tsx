import { requireUser } from "@/server/auth/current";
import { listSnapshots } from "@/server/services/snapshots";
import { listReleases } from "@/server/services/releases";
import { load } from "@/server/services/page-access";
import { Content, PageTitle } from "@/components/app/page-header";
import { ProjectHeader } from "@/components/project/shared";
import { ReleaseForm } from "@/components/project/release-form";

export const metadata = { title: "Draft release" };

function bump(tag: string | undefined) {
  if (!tag) return "v0.1";
  const m = /^(v?)(\d+)\.(\d+)(?:\.(\d+))?$/.exec(tag);
  if (!m) return `${tag}-next`;
  return m[4] !== undefined ? `${m[1]}${m[2]}.${m[3]}.${Number(m[4]) + 1}` : `${m[1]}${m[2]}.${Number(m[3]) + 1}`;
}

export default async function NewReleasePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const [{ access, snapshots }, { releases }] = await Promise.all([load(listSnapshots(user, slug)), load(listReleases(user, slug))]);
  const base = `/project/${access.project.slug}`;
  return (
    <>
      <ProjectHeader project={access.project} org={access.org} crumbs={[{ label: "Releases", href: `${base}/releases` }, { label: "New" }]} />
      <Content className="max-w-3xl">
        <PageTitle title="Draft a release" />
        <div className="mt-5 rounded-lg border border-border bg-surface p-5">
          <ReleaseForm project={access.project.slug} snapshots={snapshots.map((s) => ({ id: s.id, number: s.number, name: s.name }))} suggestedTag={bump(releases[0]?.tag)} />
        </div>
      </Content>
    </>
  );
}
