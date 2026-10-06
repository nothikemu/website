import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/current";
import { getShellData } from "@/server/services/shell";
import { Content, PageHeader, PageTitle } from "@/components/app/page-header";
import { ResourceForm } from "@/components/forms/resource-form";
import { PROJECT_TYPES } from "@/lib/status";
import { titleCase } from "@/lib/utils";

export const metadata = { title: "New project" };

export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ org?: string; first?: string }> }) {
  const { org, first } = await searchParams;
  const user = await requireUser();
  const shell = await getShellData(user);
  const writable = shell.orgs.filter((o) => o.role !== "viewer");
  if (!writable.length) redirect("/organizations/new");
  const selected = writable.find((o) => o.slug === org) ?? writable[0]!;
  return (
    <>
      <PageHeader crumbs={[{ label: selected.name, href: `/org/${selected.slug}` }, { label: "New project" }]} />
      <Content className="max-w-2xl">
        <PageTitle
          title={first ? "Create your first project" : "New project"}
          description="A project is one physical system — a robot, a payload, a test rig. It gets its own file system, version history, requirements, tests and notebook."
        />
        <div className="mt-6 rounded-lg border border-border bg-surface p-5">
          <ResourceForm
            method="POST"
            action="/api/v1/projects"
            submitLabel="Create project"
            onSuccessHref="/project/{slug}"
            initial={{ organization: selected.slug, type: "robotics", visibility: "organization", scaffold: true }}
            fields={[
              { name: "name", label: "Project name", type: "text", required: true, placeholder: "External Cargo Transport Robot" },
              { name: "organization", label: "Organization", type: "select", options: writable.map((o) => ({ value: o.slug, label: o.name })) },
              { name: "type", label: "Type", type: "select", options: PROJECT_TYPES.map((t) => ({ value: t, label: titleCase(t) })) },
              {
                name: "visibility",
                label: "Visibility",
                type: "select",
                options: [
                  { value: "organization", label: "Organization — every member can see it" },
                  { value: "private", label: "Private — only people you add" },
                ],
              },
              { name: "description", label: "Description", type: "markdown", rows: 4, placeholder: "What are you building, and what does done look like?" },
              { name: "scaffold", label: "Create standard folders (/cad, /electronics, /firmware, /simulation, /documentation, /tests, /media) and labels", type: "checkbox" },
            ]}
            layout="grid"
          />
        </div>
      </Content>
    </>
  );
}
