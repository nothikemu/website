import { desc, eq } from "drizzle-orm";
import { requireUser } from "@/server/auth/current";
import { db } from "@/server/db";
import { apiTokens } from "@/server/db/schema";
import { Panel } from "@/components/ui/misc";
import { CreateToken } from "@/components/settings/tokens";
import { ActionButton } from "@/components/forms/actions";
import { shortDate, relative } from "@/lib/dates";

export const metadata = { title: "API tokens" };

export default async function TokensPage() {
  const user = await requireUser();
  const tokens = await db.select().from(apiTokens).where(eq(apiTokens.userId, user.id)).orderBy(desc(apiTokens.createdAt));
  return (
    <div className="flex flex-col gap-5">
      <Panel title="Personal access tokens" bodyClassName="p-4">
        <p className="mb-3 text-xs text-fg-muted">
          Tokens authenticate API requests as you (<code className="font-mono">Authorization: Bearer fbp_…</code>) with your permissions — use them for CI test reporting and scripts.
        </p>
        <CreateToken />
      </Panel>
      <Panel title="Active tokens" count={tokens.length}>
        {tokens.length ? (
          <ul className="divide-y divide-border">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{t.name}</div>
                  <div className="font-mono text-2xs text-fg-subtle">
                    {t.prefix}… · created {shortDate(t.createdAt)} · {t.lastUsedAt ? `last used ${relative(t.lastUsedAt)}` : "never used"} · {t.expiresAt ? `expires ${shortDate(t.expiresAt)}` : "no expiry"}
                  </div>
                </div>
                <ActionButton variant="ghost" size="xs" method="DELETE" url={`/api/v1/me/tokens/${t.id}`} confirm="Revoke this token?" successMessage="Token revoked">
                  Revoke
                </ActionButton>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-4 text-sm text-fg-subtle">No tokens yet.</p>
        )}
      </Panel>
    </div>
  );
}
