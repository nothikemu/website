import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/current";
import { orgForPage } from "@/server/services/page-access";
import { Content } from "@/components/app/page-header";
import { Panel } from "@/components/ui/misc";
import { ResourceForm } from "@/components/forms/resource-form";
import { DangerConfirm } from "@/components/forms/actions";

export const metadata = { title: "Organization settings" };

export default async function OrgSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const { org, role } = await orgForPage(user, slug);
  if (role !== "owner" && role !== "admin") notFound();
  return (
    <Content className="max-w-3xl">
      <div className="flex flex-col gap-5">
        <Panel title="General" bodyClassName="p-4">
          <ResourceForm
            method="PATCH"
            action={`/api/v1/orgs/${org.slug}`}
            submitLabel="Save changes"
            onSuccessHref="/org/{slug}/settings"
            initial={{ name: org.name, slug: org.slug, description: org.description ?? "", website: org.website ?? "" }}
            fields={[
              { name: "name", label: "Name", type: "text", required: true },
              { name: "slug", label: "URL slug", type: "text", mono: true, hint: "Changing this breaks existing links to the organization page." },
              { name: "website", label: "Website", type: "text" },
              { name: "description", label: "Description", type: "markdown", rows: 4 },
            ]}
          />
        </Panel>
        {role === "owner" ? (
          <Panel title="Danger zone" className="border-red/40" bodyClassName="flex items-center justify-between gap-4 p-4">
            <div>
              <p className="text-sm font-medium">Delete organization</p>
              <p className="text-xs text-fg-muted">Permanently deletes every project, file, version and record in {org.name}. This cannot be undone.</p>
            </div>
            <DangerConfirm title={`Delete ${org.name}`} description="All projects, files and history will be permanently deleted." confirmWord={org.slug} url={`/api/v1/orgs/${org.slug}`} redirectTo="/organizations" label="Delete organization" />
          </Panel>
        ) : null}
      </div>
    </Content>
  );
}
