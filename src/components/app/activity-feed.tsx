import Link from "next/link";
import { Avatar } from "@/components/ui/avatar";
import { describeVerb, verbTone } from "@/lib/activity-text";
import { dayLabel } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Time } from "./time";

export type FeedItem = {
  id: string;
  verb: string;
  actor: { id: string; username: string; displayName: string; avatarUrl: string | null } | null;
  project?: { slug: string; name: string } | null;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  targetTitle: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

const toneClass = { neutral: "bg-fg-subtle", success: "bg-green", danger: "bg-red", warning: "bg-amber", accent: "bg-accent" } as const;

function targetHref(item: FeedItem): string | null {
  const slug = item.project?.slug;
  if (!slug || !item.targetType) return null;
  const n = item.targetLabel?.match(/-(\d+)$/)?.[1];
  switch (item.targetType) {
    case "issue":
      return n ? `/project/${slug}/issues/${Number(n)}` : null;
    case "task":
      return n ? `/project/${slug}/tasks/${Number(n)}` : null;
    case "requirement":
      return n ? `/project/${slug}/requirements/${Number(n)}` : null;
    case "test":
      return n ? `/project/${slug}/tests/${Number(n)}` : null;
    case "decision":
      return n ? `/project/${slug}/decisions/${Number(n)}` : null;
    case "change":
      return n ? `/project/${slug}/changes/${Number(n)}` : null;
    case "notebook_entry":
      return n ? `/project/${slug}/notebook/${Number(n)}` : null;
    case "file":
      return item.verb === "file.deleted" ? null : `/project/${slug}/files/${item.targetId}`;
    case "snapshot":
      return item.targetLabel ? `/project/${slug}/versions/${item.targetLabel.replace(/\D/g, "")}` : null;
    case "release":
      return item.targetLabel ? `/project/${slug}/releases/${encodeURIComponent(item.targetLabel)}` : null;
    case "milestone":
      return `/project/${slug}/milestones`;
    case "folder":
      return item.verb === "folder.deleted" ? null : `/project/${slug}/files?folder=${item.targetId}`;
    default:
      return `/project/${slug}`;
  }
}

function detail(item: FeedItem): string | null {
  const m = item.metadata ?? {};
  if (item.verb === "file.revised" && m.version) return `v${m.version}${m.message ? ` — ${m.message}` : ""}`;
  if ((item.verb === "test.failed" || item.verb === "test.passed") && m.actual) return String(m.actual);
  if (item.verb === "comment.created" && m.excerpt) return String(m.excerpt);
  if (item.verb === "repository.synced" && m.imported) return `${m.imported} new commits`;
  if (item.verb === "snapshot.created" && typeof m.added === "number") return `+${m.added} added · ${m.modified} modified · ${m.removed} removed`;
  if (item.verb === "link.created" && m.to) return `→ ${m.to} ${m.toTitle ?? ""}`;
  if ((item.verb.endsWith("status_changed") || item.verb === "task.moved") && m.from && m.to) return `${String(m.from).replace("_", " ")} → ${String(m.to).replace("_", " ")}`;
  if (item.verb === "file.renamed" || item.verb === "file.moved" || item.verb.startsWith("folder.")) return m.to ? `${m.from} → ${m.to}` : null;
  return null;
}

export function ActivityRow({ item, showProject }: { item: FeedItem; showProject?: boolean }) {
  const href = targetHref(item);
  const d = detail(item);
  const label = item.targetLabel ?? "";
  const hasRef = /^[A-Z]+-\d+$/.test(label) || /^v[\d.]/.test(label) || /^Version \d+/.test(label);
  return (
    <li className="group relative flex gap-3 py-2 pl-1">
      <div className="relative mt-0.5 flex flex-col items-center">
        <Avatar user={item.actor ?? { displayName: "Forgebase", username: "system" }} size={20} />
        <span className={cn("absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-2 ring-surface", toneClass[verbTone(item.verb)])} />
      </div>
      <div className="min-w-0 flex-1 text-sm leading-5">
        <span className="font-medium text-fg">{item.actor?.displayName ?? "Automation"}</span>{" "}
        <span className="text-fg-muted">{describeVerb(item.verb, item.metadata)}</span>{" "}
        {href ? (
          <Link href={href} className="text-fg hover:text-accent">
            {hasRef ? <span className="font-mono text-[0.92em]">{label}</span> : <span className="font-medium">{label}</span>}
            {item.targetTitle && item.targetTitle !== label && hasRef ? <span className="text-fg-muted"> {item.targetTitle}</span> : null}
          </Link>
        ) : (
          <span className="text-fg">
            {hasRef ? <span className="font-mono text-[0.92em]">{label}</span> : label}
            {item.targetTitle && item.targetTitle !== label && hasRef ? <span className="text-fg-muted"> {item.targetTitle}</span> : null}
          </span>
        )}
        {showProject && item.project ? (
          <>
            {" "}
            <span className="text-fg-subtle">in</span>{" "}
            <Link href={`/project/${item.project.slug}`} className="text-fg-muted hover:text-fg">
              {item.project.name}
            </Link>
          </>
        ) : null}
        {d ? <div className="mt-0.5 truncate font-mono text-xs text-fg-subtle">{d}</div> : null}
      </div>
      <Time date={item.createdAt} className="shrink-0 pt-0.5 font-mono text-2xs text-fg-subtle" />
    </li>
  );
}

export function ActivityList({ items, showProject, grouped }: { items: FeedItem[]; showProject?: boolean; grouped?: boolean }) {
  if (!grouped)
    return (
      <ul className="divide-y divide-border/60">
        {items.map((i) => (
          <ActivityRow key={i.id} item={i} showProject={showProject} />
        ))}
      </ul>
    );
  const groups = new Map<string, FeedItem[]>();
  for (const i of items) {
    const k = new Date(i.createdAt).toISOString().slice(0, 10);
    groups.set(k, [...(groups.get(k) ?? []), i]);
  }
  return (
    <div className="flex flex-col gap-5">
      {[...groups].map(([day, list]) => (
        <section key={day}>
          <h3 className="sticky top-12 z-10 mb-1 bg-bg/90 py-1 text-xs font-medium text-fg-muted backdrop-blur">{dayLabel(day)}</h3>
          <ul className="divide-y divide-border/60 rounded-lg border border-border bg-surface px-3">
            {list.map((i) => (
              <ActivityRow key={i.id} item={i} showProject={showProject} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
