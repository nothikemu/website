import { requireUser } from "@/server/auth/current";
import { orgForPage } from "@/server/services/page-access";
import { Content, PageHeader } from "@/components/app/page-header";
import { OrgTabs } from "@/components/org/org-tabs";
import { OrgGlyph } from "@/components/app/org-switcher";
import { Badge } from "@/components/ui/badge";
import { PLANS } from "@/lib/plans";
import { ROLE_LABEL } from "@/lib/status";

export default async function OrgLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const { org, role } = await orgForPage(user, slug);
  return (
    <>
      <PageHeader crumbs={[{ label: "Organizations", href: "/organizations" }, { label: org.name }]} />
      <Content wide className="pb-0">
        <div className="flex items-center gap-3">
          <OrgGlyph name={org.name} className="size-9 text-sm" />
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-lg font-semibold tracking-[-0.015em]">
              {org.name}
              {org.isDemo ? <Badge tone="amber">Demo data</Badge> : null}
            </h1>
            <p className="text-xs text-fg-subtle">
              <span className="font-mono">{org.slug}</span> · {PLANS[org.plan].name} plan · you are {ROLE_LABEL[role]?.toLowerCase()}
            </p>
          </div>
        </div>
        {org.description ? <p className="mt-3 max-w-3xl text-sm text-fg-muted">{org.description}</p> : null}
        <div className="mt-5">
          <OrgTabs slug={org.slug} canAdmin={role === "owner" || role === "admin"} />
        </div>
      </Content>
      {children}
    </>
  );
}
