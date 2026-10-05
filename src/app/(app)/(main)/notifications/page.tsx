import Link from "next/link";
import { Bell } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { listNotifications } from "@/server/services/notifications";
import { Content, PageHeader, PageTitle } from "@/components/app/page-header";
import { EmptyState } from "@/components/ui/misc";
import { Avatar } from "@/components/ui/avatar";
import { Time } from "@/components/app/time";
import { ActionButton } from "@/components/forms/actions";
import { NotificationLink } from "@/components/app/notification-link";
import { cn } from "@/lib/utils";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const { filter } = await searchParams;
  const user = await requireUser();
  const items = await listNotifications(user.id, { unreadOnly: filter === "unread", limit: 100 });
  const unread = items.filter((i) => !i.readAt).length;
  return (
    <>
      <PageHeader crumbs={[{ label: "Notifications" }]} actions={<Link href="/settings/notifications" className="text-xs text-fg-muted hover:text-fg">Preferences</Link>} />
      <Content className="max-w-3xl">
        <PageTitle
          title="Notifications"
          actions={
            <>
              <div className="flex rounded-md border border-border p-0.5 text-xs">
                <Link href="/notifications" className={cn("rounded-sm px-2 py-1", filter !== "unread" ? "bg-surface-2 text-fg" : "text-fg-muted")}>
                  All
                </Link>
                <Link href="/notifications?filter=unread" className={cn("rounded-sm px-2 py-1", filter === "unread" ? "bg-surface-2 text-fg" : "text-fg-muted")}>
                  Unread
                </Link>
              </div>
              {unread ? (
                <ActionButton size="sm" url="/api/v1/notifications/read" body={{ ids: "all" }} successMessage="All caught up">
                  Mark all read
                </ActionButton>
              ) : null}
            </>
          }
        />
        <div className="mt-5 overflow-hidden rounded-lg border border-border bg-surface">
          {items.length ? (
            <ul className="divide-y divide-border">
              {items.map((n) => (
                <li key={n.id}>
                  <NotificationLink id={n.id} href={n.url ?? "/notifications"} unread={!n.readAt}>
                    <span className={cn("mt-2 size-1.5 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-accent")} />
                    {n.actor ? <Avatar user={n.actor} size={24} /> : <Bell className="mt-0.5 size-5 text-fg-subtle" />}
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-sm", n.readAt ? "text-fg-muted" : "font-medium text-fg")}>{n.title}</span>
                      {n.body ? <span className="block truncate text-xs text-fg-subtle">{n.body}</span> : null}
                    </span>
                    <Time date={n.createdAt} className="shrink-0 font-mono text-2xs text-fg-subtle" />
                  </NotificationLink>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<Bell className="size-4" />} title={filter === "unread" ? "No unread notifications" : "No notifications yet"} description="Assignments, mentions, failed tests and completed milestones will show up here." />
          )}
        </div>
      </Content>
    </>
  );
}
