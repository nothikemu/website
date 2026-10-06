import { requireUser } from "@/server/auth/current";
import { projectForPage } from "@/server/services/page-access";
import { Content, PageTitle } from "@/components/app/page-header";
import { ProjectHeader } from "@/components/project/shared";
import { ResourceForm } from "@/components/forms/resource-form";
import { changeFields } from "@/components/project/field-sets";

export const metadata = { title: "File engineering change" };

export default async function NewChangePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const access = await projectForPage(user, slug);
  const base = `/project/${access.project.slug}`;
  return (
    <>
      <ProjectHeader project={access.project} org={access.org} crumbs={[{ label: "Changes", href: `${base}/changes` }, { label: "New" }]} />
      <Content className="max-w-3xl">
        <PageTitle title="File an engineering change" />
        <div className="mt-5 rounded-lg border border-border bg-surface p-5">
          <ResourceForm
            method="POST"
            action={`/api/v1/projects/${access.project.slug}/changes`}
            submitLabel="File change"
            onSuccessHref={`${base}/changes/{number}`}
            cancelHref={`${base}/changes`}
            initial={{ status: "proposed", items: [{ parameter: "", from: "", to: "" }] }}
            layout="grid"
            transform={(p) => ({ ...p, items: ((p.items as { parameter: string }[]) ?? []).filter((i) => i.parameter?.trim()) })}
            fields={changeFields(true)}
          />
        </div>
      </Content>
    </>
  );
}
