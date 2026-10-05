import { count, eq } from "drizzle-orm";
import { requireUser } from "@/server/auth/current";
import { orgForPage } from "@/server/services/page-access";
import { db } from "@/server/db";
import { organizationMembers, projects } from "@/server/db/schema";
import { Content } from "@/components/app/page-header";
import { Panel, Progress } from "@/components/ui/misc";
import { PlanPicker } from "@/components/org/plan-picker";
import { PLANS, formatBytes } from "@/lib/plans";

export const metadata = { title: "Plan & usage" };

export default async function BillingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const { org, role } = await orgForPage(user, slug);
  const plan = PLANS[org.plan];
  const [[p], [m]] = await Promise.all([
    db.select({ n: count() }).from(projects).where(eq(projects.organizationId, org.id)),
    db.select({ n: count() }).from(organizationMembers).where(eq(organizationMembers.organizationId, org.id)),
  ]);
  return (
    <Content wide>
      <div className="flex flex-col gap-5">
        <div className="grid gap-3 md:grid-cols-3">
          <Panel title="Storage" bodyClassName="p-4">
            <div className="flex items-baseline justify-between font-mono text-sm">
              <span>{formatBytes(org.storageUsedBytes)}</span>
              <span className="text-xs text-fg-subtle">of {formatBytes(plan.storageBytes)}</span>
            </div>
            <Progress value={org.storageUsedBytes / plan.storageBytes} className="mt-2" />
            <p className="mt-2 text-xs text-fg-subtle">Max file size {formatBytes(plan.maxFileBytes)}</p>
          </Panel>
          <Panel title="Projects" bodyClassName="p-4">
            <div className="flex items-baseline justify-between font-mono text-sm">
              <span>{p?.n ?? 0}</span>
              <span className="text-xs text-fg-subtle">of {plan.maxProjects ?? "unlimited"}</span>
            </div>
            <Progress value={plan.maxProjects ? (p?.n ?? 0) / plan.maxProjects : 0.05} className="mt-2" />
          </Panel>
          <Panel title="Members" bodyClassName="p-4">
            <div className="font-mono text-sm">{m?.n ?? 0}</div>
            <p className="mt-2 text-xs text-fg-subtle">Forge assistant: {plan.ai ? "included" : "Pro and above"}</p>
          </Panel>
        </div>
        <div>
          <PlanPicker org={org.slug} current={org.plan} canChange={role === "owner"} />
          <p className="mt-3 text-xs text-fg-subtle">
            Payments are not yet connected — during the beta, owners can switch self-serve plans freely. Limits are enforced server-side on project creation and uploads.
          </p>
        </div>
      </div>
    </Content>
  );
}
