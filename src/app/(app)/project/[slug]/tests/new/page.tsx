import { requireUser } from "@/server/auth/current";
import { projectPeople } from "@/server/services/shared";
import { projectForPage } from "@/server/services/page-access";
import { Content, PageTitle } from "@/components/app/page-header";
import { ProjectHeader } from "@/components/project/shared";
import { ResourceForm } from "@/components/forms/resource-form";
import { testFields } from "@/components/project/field-sets";

export const metadata = { title: "New test" };

export default async function NewTestPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ req?: string }> }) {
  const { slug } = await params;
  const { req } = await searchParams;
  const user = await requireUser();
  const access = await projectForPage(user, slug);
  const people = await projectPeople(access);
  const base = `/project/${access.project.slug}`;
  return (
    <>
      <ProjectHeader project={access.project} org={access.org} crumbs={[{ label: "Tests", href: `${base}/tests` }, { label: "New" }]} />
      <Content className="max-w-3xl">
        <PageTitle title="New test" description="Define the criterion and procedure once; record every run against it." />
        <div className="mt-5 rounded-lg border border-border bg-surface p-5">
          <ResourceForm
            method="POST"
            action={`/api/v1/projects/${access.project.slug}/tests`}
            submitLabel="Create test"
            onSuccessHref={`${base}/tests/{number}`}
            cancelHref={`${base}/tests`}
            initial={{ ownerId: user.id, requirements: req && /^\d+$/.test(req) ? `REQ-${req.padStart(3, "0")}` : "" }}
            layout="grid"
            fields={testFields(people)}
          />
        </div>
      </Content>
    </>
  );
}
