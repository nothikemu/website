import { requireUser } from "@/server/auth/current";
import { orgForPage } from "@/server/services/page-access";
import { listInvitations, listMembers } from "@/server/services/organizations";
import { Content } from "@/components/app/page-header";
import { Panel } from "@/components/ui/misc";
import { InviteDialog, MembersTable } from "@/components/org/members";
import { ActionButton } from "@/components/forms/actions";
import { ROLE_LABEL } from "@/lib/status";
import { shortDate } from "@/lib/dates";

export const metadata = { title: "Members" };

export default async function MembersPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ invite?: string }> }) {
  const { slug } = await params;
  const { invite } = await searchParams;
  const user = await requireUser();
  const { org, role } = await orgForPage(user, slug);
  const canManage = role === "owner" || role === "admin";
  const [members, invites] = await Promise.all([listMembers(user, org.id), canManage ? listInvitations(user, org.id) : Promise.resolve([])]);
  return (
    <Content wide>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Panel title="Members" count={members.length} action={canManage ? <InviteDialog org={org.slug} defaultOpen={invite === "1"} /> : null}>
          <MembersTable org={org.slug} members={members} me={user.id} myRole={role} />
        </Panel>
        <div className="flex flex-col gap-5">
          {canManage ? (
            <Panel title="Pending invitations" count={invites.length}>
              {invites.length ? (
                <ul className="divide-y divide-border">
                  {invites.map((i) => (
                    <li key={i.id} className="flex items-center gap-2 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-xs">{i.email}</div>
                        <div className="text-2xs text-fg-subtle">
                          {ROLE_LABEL[i.role]} · expires {shortDate(i.expiresAt)}
                        </div>
                      </div>
                      <ActionButton variant="ghost" size="xs" method="DELETE" url={`/api/v1/orgs/${org.slug}/invitations/${i.id}`} successMessage="Invitation revoked">
                        Revoke
                      </ActionButton>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-3 py-4 text-sm text-fg-subtle">No pending invitations.</p>
              )}
            </Panel>
          ) : null}
          <Panel title="Roles">
            <dl className="divide-y divide-border text-sm">
              {[
                ["Owner", "Everything, including billing, ownership and deleting the organization."],
                ["Admin", "Manage members, integrations and settings. Admin on every project."],
                ["Engineer", "Create and edit files, issues, requirements, tests and notebook entries."],
                ["Viewer", "Read everything they can see, comment and react."],
              ].map(([r, d]) => (
                <div key={r} className="px-3 py-2">
                  <dt className="font-medium">{r}</dt>
                  <dd className="text-xs text-fg-muted">{d}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </div>
      </div>
    </Content>
  );
}
