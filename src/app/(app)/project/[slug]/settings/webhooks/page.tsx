import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/current";
import { projectForPage } from "@/server/services/page-access";
import { listEndpoints } from "@/server/services/webhooks";
import { Panel } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { ActionButton } from "@/components/forms/actions";
import { WebhookCreate } from "@/components/project/webhook-create";
import { Time } from "@/components/app/time";

export const metadata = { title: "Webhooks" };

export default async function WebhooksPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireUser();
  const access = await projectForPage(user, slug);
  if (access.role !== "admin") notFound();
  const endpoints = await listEndpoints(user, slug);
  return (
    <div className="flex flex-col gap-5">
      <Panel title="Inbound webhooks" bodyClassName="p-4">
        <p className="mb-3 text-xs text-fg-muted">
          Let CI pipelines, test rigs and GitHub post results into this project. Requests must be signed with HMAC-SHA256 of the raw body using the endpoint secret, and run with your permissions.
        </p>
        <WebhookCreate project={access.project.slug} />
      </Panel>
      <Panel title="Endpoints" count={endpoints.length}>
        {endpoints.length ? (
          <ul className="divide-y divide-border">
            {endpoints.map((e) => (
              <li key={e.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={e.kind === "github" ? "neutral" : "blue"}>{e.kind}</Badge>
                  <span className="text-sm">{e.description ?? "Untitled endpoint"}</span>
                  <span className="ml-auto text-2xs text-fg-subtle">{e.lastDeliveryAt ? <>last delivery <Time date={e.lastDeliveryAt} /></> : "no deliveries yet"}</span>
                  <ActionButton size="xs" variant="ghost" method="DELETE" url={`/api/v1/projects/${access.project.slug}/webhooks/${e.id}`} confirm="Delete this endpoint? Senders will start receiving 404.">
                    Delete
                  </ActionButton>
                </div>
                <code className="mt-1 block truncate font-mono text-2xs text-fg-muted">{e.url}</code>
                {e.deliveries.length ? (
                  <ul className="mt-2 grid gap-0.5 font-mono text-2xs">
                    {e.deliveries.map((d) => (
                      <li key={d.id} className="flex gap-3 text-fg-subtle">
                        <span className={d.status === "ok" ? "text-green" : d.status === "ignored" ? "text-fg-subtle" : "text-red"}>{d.status}</span>
                        <span>{d.event}</span>
                        <span>{d.error}</span>
                        <span className="ml-auto">
                          <Time date={d.receivedAt} />
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-4 text-sm text-fg-subtle">No endpoints yet.</p>
        )}
      </Panel>
      <Panel title="Example: report a test result from CI" bodyClassName="p-4">
        <pre className="overflow-x-auto rounded-md border border-border bg-bg-subtle p-3 font-mono text-xs leading-5">{`BODY='{"event":"test.run","test":"TEST-004","status":"passed",
       "actual":"IMU drift 0.8°/min",
       "measurements":[{"name":"drift","value":0.8,"unit":"deg/min","max":1.5}]}'
SIG="sha256=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$FORGEBASE_WEBHOOK_SECRET" -hex | sed 's/^.* //')"
curl -X POST "$FORGEBASE_WEBHOOK_URL" \\
  -H "content-type: application/json" -H "x-forgebase-signature: $SIG" -d "$BODY"`}</pre>
        <p className="mt-2 text-xs text-fg-muted">
          Also accepts <code className="font-mono">ci.status</code> and <code className="font-mono">deployment</code> events. For scripted access to the full REST API, create a personal access token in Settings → API tokens.
        </p>
      </Panel>
    </div>
  );
}
