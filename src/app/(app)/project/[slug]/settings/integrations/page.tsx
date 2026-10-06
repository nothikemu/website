import { requireUser } from "@/server/auth/current";
import { projectForPage } from "@/server/services/page-access";
import { projectIntegrations } from "@/server/services/integrations";
import { DEFAULT_CHANNEL_EVENTS } from "@/server/integrations/catalog";
import { Panel } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { ProviderIcon } from "@/components/app/provider-icon";
import { ActionButton } from "@/components/forms/actions";
import { ChannelForm, GithubConnect, SyncButton } from "@/components/project/integration-forms";
import { Time } from "@/components/app/time";

export const metadata = { title: "Project integrations" };

export default async function ProjectIntegrationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const access = await projectForPage(user, slug);
  const list = await projectIntegrations(user, slug);
  const gh = list.find((i) => i.provider === "github");
  const channels = list.filter((i) => i.provider === "discord" || i.provider === "slack");
  const admin = access.role === "admin";
  const orgApi = `/api/v1/orgs/${access.org.slug}/integrations`;
  return (
    <div className="flex flex-col gap-5">
      <Panel title="GitHub repository" bodyClassName="p-4">
        {gh ? (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-border bg-bg-subtle px-3 py-2">
            <ProviderIcon provider="github" />
            <div className="min-w-0 flex-1">
              <div className="font-mono text-sm">{String(gh.config.repository)}</div>
              <div className="text-xs text-fg-subtle">
                {gh.lastSyncedAt ? (
                  <>
                    Last synced <Time date={gh.lastSyncedAt} />
                  </>
                ) : (
                  "Not synced yet"
                )}
                {gh.config.mock ? <Badge tone="amber" className="ml-2">mock</Badge> : null}
                {gh.lastError ? <span className="text-red"> · {gh.lastError}</span> : null}
              </div>
            </div>
            {access.role !== "viewer" ? <SyncButton project={access.project.slug} /> : null}
            {admin ? (
              <ActionButton size="sm" variant="ghost" method="DELETE" url={`${orgApi}/${gh.id}`} confirm="Unlink this repository? Imported commits are kept.">
                Unlink
              </ActionButton>
            ) : null}
          </div>
        ) : null}
        <p className="mb-3 text-xs text-fg-muted">
          Commits that mention <code className="font-mono">ISS-012</code>, <code className="font-mono">REQ-003</code> or <code className="font-mono">TEST-004</code> are linked automatically; <code className="font-mono">fixes ISS-012</code> records a fix. Add a GitHub webhook (Webhooks tab) to receive pushes in real time.
        </p>
        {admin ? <GithubConnect project={access.project.slug} current={gh ? String(gh.config.repository) : null} /> : null}
      </Panel>
      <Panel title="Channel notifications" count={channels.length} bodyClassName="p-4">
        {channels.length ? (
          <ul className="mb-4 divide-y divide-border rounded-md border border-border">
            {channels.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <ProviderIcon provider={c.provider} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm">
                    {c.provider === "discord" ? "Discord" : "Slack"} <span className="font-mono text-xs text-fg-subtle">{String(c.config.hint ?? "")}</span>
                    {!c.enabled ? <Badge className="ml-2">paused</Badge> : null}
                  </div>
                  <div className="truncate font-mono text-2xs text-fg-subtle">{((c.config.events as string[]) ?? []).join(", ")}</div>
                  {c.lastError ? <div className="text-2xs text-red">Last delivery failed: {c.lastError}</div> : null}
                </div>
                {admin ? (
                  <>
                    <ActionButton size="xs" variant="outline" method="PATCH" url={`${orgApi}/${c.id}`} body={{ enabled: !c.enabled }}>
                      {c.enabled ? "Pause" : "Resume"}
                    </ActionButton>
                    <ActionButton size="xs" variant="ghost" method="DELETE" url={`${orgApi}/${c.id}`} confirm="Disconnect this channel?">
                      Remove
                    </ActionButton>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {admin ? <ChannelForm project={access.project.slug} events={DEFAULT_CHANNEL_EVENTS} /> : <p className="text-sm text-fg-subtle">Only project admins can connect channels.</p>}
      </Panel>
      <Panel title="Google Drive" bodyClassName="p-4 text-sm text-fg-muted">
        Importing from shared drives is on the roadmap. The adapter interface is in place; Drive-scoped OAuth is not yet requested.
      </Panel>
    </div>
  );
}
