import { requireUser } from "@/server/auth/current";
import { linkedAccounts } from "@/server/services/auth";
import { oauthEnabled } from "@/server/env";
import { Panel } from "@/components/ui/misc";
import { ProviderIcon } from "@/components/app/provider-icon";
import { ActionButton } from "@/components/forms/actions";
import { buttonClass } from "@/components/ui/button";
import { shortDate } from "@/lib/dates";

export const metadata = { title: "Connected accounts" };

export default async function ConnectionsPage() {
  const user = await requireUser();
  const accounts = await linkedAccounts(user.id);
  const enabled = oauthEnabled();
  return (
    <Panel title="Connected accounts">
      <ul className="divide-y divide-border">
        {(["github", "google"] as const).map((p) => {
          const acct = accounts.find((a) => a.provider === p);
          return (
            <li key={p} className="flex items-center gap-3 px-4 py-3">
              {p === "github" ? <ProviderIcon provider="github" /> : <span className="flex size-7 items-center justify-center rounded-md border border-border bg-surface-2 text-sm font-semibold text-blue">G</span>}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{p === "github" ? "GitHub" : "Google"}</div>
                <div className="text-xs text-fg-subtle">
                  {acct ? (
                    <>
                      Connected as <span className="font-mono">{acct.login}</span> · {shortDate(acct.createdAt)}
                    </>
                  ) : p === "github" ? (
                    "Sign in with GitHub and import repositories into projects"
                  ) : (
                    "Sign in with Google"
                  )}
                </div>
              </div>
              {acct ? (
                <ActionButton variant="outline" size="sm" method="DELETE" url={`/api/v1/me/connections/${p}`} confirm={`Disconnect ${p}?`} successMessage="Disconnected">
                  Disconnect
                </ActionButton>
              ) : enabled[p] ? (
                <a href={`/api/auth/oauth/${p}?intent=connect`} className={buttonClass("secondary", "sm")}>
                  Connect
                </a>
              ) : (
                <span className="text-xs text-fg-subtle">Not configured on this server</span>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
