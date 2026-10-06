import { requireUser } from "@/server/auth/current";
import { listMilestones } from "@/server/services/milestones";
import { projectPeople } from "@/server/services/shared";
import { projectForPage } from "@/server/services/page-access";
import { Content, PageTitle } from "@/components/app/page-header";
import { ProjectHeader } from "@/components/project/shared";
import { ResourceForm } from "@/components/forms/resource-form";
import { issueFields } from "@/components/project/field-sets";

export const metadata = { title: "New issue" };

export default async function NewIssuePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const access = await projectForPage(user, slug);
  const [people, ms] = await Promise.all([projectPeople(access), listMilestones(user, slug)]);
  const base = `/project/${access.project.slug}`;
  return (
    <>
      <ProjectHeader project={access.project} org={access.org} crumbs={[{ label: "Issues", href: `${base}/issues` }, { label: "New" }]} />
      <Content className="max-w-3xl">
        <PageTitle title="New issue" description="Describe what's wrong with the system, how it was observed, and what it affects." />
        <div className="mt-5 rounded-lg border border-border bg-surface p-5">
          <ResourceForm
            method="POST"
            action={`/api/v1/projects/${access.project.slug}/issues`}
            submitLabel="Create issue"
            onSuccessHref={`${base}/issues/{number}`}
            cancelHref={`${base}/issues`}
            initial={{ status: "open", priority: "none" }}
            layout="grid"
            fields={issueFields(people, ms.milestones, true)}
          />
        </div>
      </Content>
    </>
  );
}
