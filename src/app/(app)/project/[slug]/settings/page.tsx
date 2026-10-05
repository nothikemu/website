import { requireUser } from "@/server/auth/current";
import { projectForPage } from "@/server/services/page-access";
import { Panel } from "@/components/ui/misc";
import { ResourceForm } from "@/components/forms/resource-form";
import { DangerConfirm } from "@/components/forms/actions";
import { PROJECT_STATUS, PROJECT_TYPES } from "@/lib/status";
import { titleCase } from "@/lib/utils";

export const metadata = { title: "Project settings" };

export default async function ProjectSettingsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const { project, org, role } = await projectForPage(user, slug);
  const admin = role === "admin";
  return (
    <div className="flex flex-col gap-5">
      <Panel title="General" bodyClassName="p-5">
        {admin ? (
          <ResourceForm
            method="PATCH"
            action={`/api/v1/projects/${project.slug}`}
            submitLabel="Save"
            redirectTo={`/project/${project.slug}/settings`}
            layout="grid"
            initial={{ name: project.name, type: project.type, status: project.status, visibility: project.visibility, repository: project.repository ?? "", description: project.description ?? "" }}
            fields={[
              { name: "name", label: "Name", type: "text", required: true },
              { name: "type", label: "Type", type: "select", options: PROJECT_TYPES.map((t) => ({ value: t, label: titleCase(t) })) },
              { name: "status", label: "Status", type: "select", options: Object.entries(PROJECT_STATUS).map(([v, m]) => ({ value: v, label: m.label })) },
              { name: "visibility", label: "Visibility", type: "select", options: [{ value: "organization", label: `Everyone in ${org.name}` }, { value: "private", label: "Private — project members only" }] },
              { name: "description", label: "Description", type: "markdown", rows: 5 },
            ]}
          />
        ) : (
          <p className="text-sm text-fg-muted">Only project admins can edit settings.</p>
        )}
      </Panel>
      {admin ? (
        <Panel title="Danger zone" className="border-red/40" bodyClassName="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-sm font-medium">Delete project</p>
            <p className="text-xs text-fg-muted">Permanently deletes all files, versions, requirements, tests, notebook entries and history.</p>
          </div>
          <DangerConfirm title={`Delete ${project.name}`} description="This cannot be undone." confirmWord={project.slug} url={`/api/v1/projects/${project.slug}`} redirectTo={`/org/${org.slug}`} label="Delete project" />
        </Panel>
      ) : null}
    </div>
  );
}
