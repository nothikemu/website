import { requireUser } from "@/server/auth/current";
import { projectPeople } from "@/server/services/shared";
import { projectForPage } from "@/server/services/page-access";
import { Content, PageTitle } from "@/components/app/page-header";
import { ProjectHeader } from "@/components/project/shared";
import { ResourceForm } from "@/components/forms/resource-form";
import { requirementFields } from "@/components/project/field-sets";

export const metadata = { title: "New requirement" };

export default async function NewRequirementPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const access = await projectForPage(user, slug);
  const people = await projectPeople(access);
  const base = `/project/${access.project.slug}`;
  return (
    <>
      <ProjectHeader project={access.project} org={access.org} crumbs={[{ label: "Requirements", href: `${base}/requirements` }, { label: "New" }]} />
      <Content className="max-w-3xl">
        <PageTitle title="New requirement" description='Write it so it can be verified: "The robot shall transport a 20 kg payload across 30 m of regolith simulant."' />
        <div className="mt-5 rounded-lg border border-border bg-surface p-5">
          <ResourceForm
            method="POST"
            action={`/api/v1/projects/${access.project.slug}/requirements`}
            submitLabel="Create requirement"
            onSuccessHref={`${base}/requirements/{number}`}
            cancelHref={`${base}/requirements`}
            initial={{ priority: "should", status: "draft", verificationMethod: "test", ownerId: user.id }}
            layout="grid"
            fields={requirementFields(people)}
          />
        </div>
      </Content>
    </>
  );
}
