import Link from "next/link";
import { requireUser } from "@/server/auth/current";
import { orgForPage } from "@/server/services/page-access";
import { listIntegrations } from "@/server/services/integrations";
import { listProjects } from "@/server/services/projects";
import { Content } from "@/components/app/page-header";
import { Panel } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/forms/actions";
import { ProviderIcon } from "@/components/app/provider-icon";
import { Time } from "@/components/app/time";

export const metadata = { title: "Integrations" };

const STATUS = { available: { t: "green", l: "Available" }, mock: { t: "amber", l: "Mock adapter" }, coming_soon: { t: "neutral", l: "Coming soon" }, unavailable: { t: "neutral", l: "Not configured" } } as const;

export default async function IntegrationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const { org } = await orgForPage(user, slug);
  const [data, projects] = await Promise.all([listIntegrations(user, org.id), listProjects(user, org.id)]);
  return (
    <Content wide>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {data.catalog.map((p) => {
          const s = STATUS[p.status];
          return (
            <div key={p.id} className="flex flex-col rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center gap-2.5">
                <ProviderIcon provider={p.id} />
                <h3 className="text-sm font-semibold">{p.name}</h3>
                <Badge tone={s.t} className="ml-auto">
                  {s.l}
                </Badge>
              </div>
              <p className="mt-2 flex-1 text-xs leading-relaxed text-fg-muted">{p.description}</p>
              <ul className="mt-3 flex flex-wrap gap-1">
                {p.capabilities.map((c) => (
                  <li key={c} className="rounded-sm border border-border px-1.5 py-0.5 text-2xs text-fg-subtle">
                    {c}
                  </li>
                ))}
              </ul>
              {p.note ? <p className="mt-3 border-t border-border pt-2 text-2xs text-fg-subtle">{p.note}</p> : null}
            </div>
          );
        })}
      </div>
      <Panel title="Connected" count={data.integrations.length} className="mt-5">
        {data.integrations.length ? (
          <ul className="divide-y divide-border">
            {data.integrations.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <ProviderIcon provider={i.provider} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">
                    {i.provider === "github" ? String(i.config.repository) : `${i.provider === "discord" ? "Discord" : "Slack"} channel ${String(i.config.hint ?? "")}`}
                    {i.config.mock ? <Badge tone="amber" className="ml-2">mock</Badge> : null}
                  </div>
                  <div className="text-xs text-fg-subtle">
                    {i.projectSlug ? (
                      <Link href={`/project/${i.projectSlug}/settings/integrations`} className="hover:text-fg">
                        {i.projectName}
                      </Link>
                    ) : (
                      "Organization-wide"
                    )}
                    {i.lastSyncedAt ? (
                      <>
                        {" "}
                        · synced <Time date={i.lastSyncedAt} />
                      </>
                    ) : null}
                    {i.lastError ? <span className="text-red"> · {i.lastError}</span> : null}
                  </div>
                </div>
                {i.provider !== "github" ? (
                  <ActionButton variant="outline" size="xs" method="PATCH" url={`/api/v1/orgs/${org.slug}/integrations/${i.id}`} body={{ enabled: !i.enabled }}>
                    {i.enabled ? "Pause" : "Resume"}
                  </ActionButton>
                ) : null}
                <ActionButton variant="ghost" size="xs" method="DELETE" url={`/api/v1/orgs/${org.slug}/integrations/${i.id}`} confirm="Disconnect this integration?" successMessage="Disconnected">
                  Disconnect
                </ActionButton>
              </li>
            ))}
          </ul>
        ) : (
          <div className="px-3 py-5 text-sm text-fg-muted">
            Integrations are connected per project. Open a project&apos;s{" "}
            {projects[0] ? (
              <Link className="text-fg underline underline-offset-2" href={`/project/${projects[0].slug}/settings/integrations`}>
                Settings → Integrations
              </Link>
            ) : (
              "Settings → Integrations"
            )}{" "}
            to link a repository or a Discord/Slack channel.
          </div>
        )}
      </Panel>
    </Content>
  );
}
