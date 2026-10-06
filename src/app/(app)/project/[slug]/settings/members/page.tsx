import { requireUser } from "@/server/auth/current";
import { projectForPage } from "@/server/services/page-access";
import { explicitProjectMembers } from "@/server/services/projects";
import { listMembers } from "@/server/services/organizations";
import { projectPeople } from "@/server/services/shared";
import { Panel } from "@/components/ui/misc";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/forms/actions";
import { AddProjectMember } from "@/components/project/project-members";
import { titleCase } from "@/lib/utils";

export const metadata = { title: "Project members" };

export default async function ProjectMembersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const access = await projectForPage(user, slug);
  const [people, explicit, orgMembers] = await Promise.all([projectPeople(access), explicitProjectMembers(access.project.id), listMembers(user, access.org.id)]);
  const admin = access.role === "admin";
  const explicitIds = new Set(explicit.map((e) => e.id));
  return (
    <div className="flex flex-col gap-5">
      <Panel title="People with access" count={people.length}>
        <ul className="divide-y divide-border">
          {people.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2">
              <Avatar user={p} size={24} />
              <div className="min-w-0 flex-1">
                <div className="text-sm">{p.displayName}</div>
                <div className="font-mono text-2xs text-fg-subtle">@{p.username}</div>
              </div>
              {explicitIds.has(p.id) ? <Badge>project member</Badge> : <Badge>via organization</Badge>}
              <span className="w-20 text-right text-sm text-fg-muted">{titleCase(p.role)}</span>
              {admin && explicitIds.has(p.id) && p.id !== user.id ? (
                <ActionButton variant="ghost" size="xs" method="DELETE" url={`/api/v1/projects/${access.project.slug}/members/${p.id}`} confirm="Remove explicit project membership?">
                  Remove
                </ActionButton>
              ) : (
                <span className="w-14" />
              )}
            </li>
          ))}
        </ul>
      </Panel>
      {admin ? (
        <Panel title="Add or change a project role" bodyClassName="p-4">
          <p className="mb-3 text-xs text-fg-muted">
            {access.project.visibility === "private" ? "This project is private: only people added here (plus organization owners and admins) can see it." : "Everyone in the organization can see this project with their organization role. Add someone here to give them a higher role on this project."}
          </p>
          <AddProjectMember project={access.project.slug} candidates={orgMembers.map((m) => ({ id: m.id, displayName: m.displayName, username: m.username }))} />
        </Panel>
      ) : null}
    </div>
  );
}
