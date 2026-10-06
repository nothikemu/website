import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/current";
import { orgForPage } from "@/server/services/page-access";
import { listAuditLog } from "@/server/services/audit";
import { Content } from "@/components/app/page-header";
import { Panel } from "@/components/ui/misc";
import { timestamp } from "@/lib/dates";

export const metadata = { title: "Audit log" };

export default async function AuditPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ before?: string }> }) {
  const { slug } = await params;
  const { before } = await searchParams;
  const user = await requireUser();
  const { org, role } = await orgForPage(user, slug);
  if (role !== "owner" && role !== "admin") notFound();
  const rows = await listAuditLog(org.id, { before: before ? new Date(before) : undefined, limit: 100 });
  const last = rows[rows.length - 1];
  return (
    <Content wide>
      <Panel title="Security audit log" count={rows.length}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs text-fg-subtle">
              <tr>
                <th className="px-3 py-2 font-medium">Time (UTC)</th>
                <th className="px-3 py-2 font-medium">Actor</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">Details</th>
                <th className="px-3 py-2 font-medium">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border font-mono text-xs">
              {rows.map(({ log, actor }) => (
                <tr key={log.id} className="align-top">
                  <td className="px-3 py-2 whitespace-nowrap text-fg-subtle">{timestamp(log.createdAt)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{actor?.username ? `@${actor.username}` : "system"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-fg">{log.action}</td>
                  <td className="max-w-[420px] truncate px-3 py-2 text-fg-muted">{Object.keys(log.metadata).length ? JSON.stringify(log.metadata) : (log.targetType ?? "")}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-fg-subtle">{log.ipAddress ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length === 0 ? <p className="px-3 py-6 text-sm text-fg-subtle">No audit events.</p> : null}
        </div>
        {rows.length === 100 && last ? (
          <div className="border-t border-border px-3 py-2 text-right">
            <a href={`?before=${last.log.createdAt.toISOString()}`} className="text-xs text-fg-muted hover:text-fg">
              Older →
            </a>
          </div>
        ) : null}
      </Panel>
    </Content>
  );
}
