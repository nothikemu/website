import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { listOrganizations } from "@/server/services/organizations";
import { Content, PageHeader, PageTitle } from "@/components/app/page-header";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { OrgGlyph } from "@/components/app/org-switcher";
import { ROLE_LABEL } from "@/lib/status";
import { PLANS } from "@/lib/plans";

export const metadata = { title: "Organizations" };

export default async function OrganizationsPage() {
  const user = await requireUser();
  const orgs = await listOrganizations(user);
  return (
    <>
      <PageHeader crumbs={[{ label: "Organizations" }]} actions={<Link href="/organizations/new" className={buttonClass("primary", "sm")}><Plus className="size-3.5" /> New organization</Link>} />
      <Content>
        <PageTitle title="Organizations" description="Teams you belong to. Each organization has its own projects, members, plan and audit log." />
        <div className="mt-5 overflow-hidden rounded-lg border border-border bg-surface">
          {orgs.length ? (
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-bg-subtle text-left text-xs text-fg-subtle">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-4 py-2 font-medium">Role</th>
                  <th className="hidden px-4 py-2 font-medium sm:table-cell">Projects</th>
                  <th className="hidden px-4 py-2 font-medium sm:table-cell">Members</th>
                  <th className="hidden px-4 py-2 font-medium md:table-cell">Plan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orgs.map((o) => (
                  <tr key={o.id} className="hover:bg-surface-2/60">
                    <td className="px-4 py-2.5">
                      <Link href={`/org/${o.slug}`} className="flex items-center gap-2.5">
                        <OrgGlyph name={o.name} />
                        <span>
                          <span className="block font-medium">{o.name}</span>
                          <span className="font-mono text-2xs text-fg-subtle">{o.slug}</span>
                        </span>
                        {o.isDemo ? <Badge tone="amber">Demo data</Badge> : null}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-fg-muted">{ROLE_LABEL[o.role]}</td>
                    <td className="hidden px-4 py-2.5 font-mono text-fg-muted sm:table-cell">{o.projectCount}</td>
                    <td className="hidden px-4 py-2.5 font-mono text-fg-muted sm:table-cell">{o.memberCount}</td>
                    <td className="hidden px-4 py-2.5 md:table-cell">
                      <Badge>{PLANS[o.plan].name}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <EmptyState title="You're not in any organization yet" description="Create one for your team, or ask a teammate to invite you." action={<Link href="/organizations/new" className={buttonClass("primary")}>Create organization</Link>} />
          )}
        </div>
      </Content>
    </>
  );
}
