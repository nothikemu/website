import { requireUser } from "@/server/auth/current";
import { projectForPage } from "@/server/services/page-access";
import { Content, PageTitle } from "@/components/app/page-header";
import { ProjectHeader } from "@/components/project/shared";
import { ResourceForm } from "@/components/forms/resource-form";

export const metadata = { title: "New notebook entry" };

export default async function NewEntryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const access = await projectForPage(user, slug);
  const base = `/project/${access.project.slug}`;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: user.timezone }).format(new Date());
  return (
    <>
      <ProjectHeader project={access.project} org={access.org} crumbs={[{ label: "Notebook", href: `${base}/notebook` }, { label: "New entry" }]} />
      <Content className="max-w-3xl">
        <PageTitle title="New notebook entry" description="Your name and the creation time are recorded permanently with the entry." />
        <div className="mt-5 rounded-lg border border-border bg-surface p-5">
          <ResourceForm
            method="POST"
            action={`/api/v1/projects/${access.project.slug}/notebook`}
            submitLabel="Add entry"
            onSuccessHref={`${base}/notebook/{number}`}
            cancelHref={`${base}/notebook`}
            initial={{ entryDate: today, body: "## Goal\n\n\n## What we did\n\n\n## Measurements\n\n| Quantity | Value | Unit |\n|---|---|---|\n|  |  |  |\n\n## Result & next steps\n\n" }}
            layout="grid"
            fields={[
              { name: "title", label: "Title", type: "text", required: true, placeholder: "Arm test at 50% motor power" },
              { name: "entryDate", label: "Work date", type: "date" },
              { name: "body", label: "Entry", type: "markdown", rows: 16 },
              { name: "tags", label: "Tags", type: "tags", placeholder: "arm, testing", span: 2 },
            ]}
          />
        </div>
      </Content>
    </>
  );
}
