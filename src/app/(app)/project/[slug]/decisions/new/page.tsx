import { requireUser } from "@/server/auth/current";
import { projectPeople } from "@/server/services/shared";
import { projectForPage } from "@/server/services/page-access";
import { Content, PageTitle } from "@/components/app/page-header";
import { ProjectHeader } from "@/components/project/shared";
import { ResourceForm } from "@/components/forms/resource-form";
import { decisionFields } from "@/components/project/field-sets";

export const metadata = { title: "Record decision" };

export default async function NewDecisionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const access = await projectForPage(user, slug);
  const people = await projectPeople(access);
  const base = `/project/${access.project.slug}`;
  return (
    <>
      <ProjectHeader project={access.project} org={access.org} crumbs={[{ label: "Decisions", href: `${base}/decisions` }, { label: "New" }]} />
      <Content className="max-w-3xl">
        <PageTitle title="Record a decision" description="State the decision plainly, list what you considered, and why you chose this." />
        <div className="mt-5 rounded-lg border border-border bg-surface p-5">
          <ResourceForm
            method="POST"
            action={`/api/v1/projects/${access.project.slug}/decisions`}
            submitLabel="Record decision"
            onSuccessHref={`${base}/decisions/{number}`}
            cancelHref={`${base}/decisions`}
            initial={{ status: "proposed", ownerId: user.id, alternatives: [{ name: "", pros: "", cons: "", chosen: false }] }}
            layout="grid"
            transform={(p) => ({ ...p, alternatives: ((p.alternatives as { name: string }[]) ?? []).filter((a) => a.name?.trim()) })}
            fields={decisionFields(people)}
          />
        </div>
      </Content>
    </>
  );
}
