import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Compact, original status glyphs for work items (16px grid). */
export function IssueStatusIcon({ status, className }: { status: string; className?: string }) {
  const c = cn("size-3.5 shrink-0", className);
  switch (status) {
    case "in_progress":
      return (
        <svg viewBox="0 0 16 16" className={cn(c, "text-amber")} fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 4a4 4 0 0 1 0 8z" fill="currentColor" />
        </svg>
      );
    case "blocked":
      return (
        <svg viewBox="0 0 16 16" className={cn(c, "text-red")} fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5 8h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case "resolved":
      return (
        <svg viewBox="0 0 16 16" className={cn(c, "text-green")} fill="none">
          <circle cx="8" cy="8" r="6.75" fill="currentColor" />
          <path d="m5.2 8.2 1.9 1.9 3.8-4" stroke="var(--surface)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "closed":
      return (
        <svg viewBox="0 0 16 16" className={cn(c, "text-violet")} fill="none">
          <circle cx="8" cy="8" r="6.75" fill="currentColor" />
          <path d="m5.5 5.5 5 5m0-5-5 5" stroke="var(--surface)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 16 16" className={cn(c, "text-fg-muted")} fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
  }
}

export function TaskStatusIcon({ status, className }: { status: string; className?: string }) {
  const c = cn("size-3.5 shrink-0", className);
  switch (status) {
    case "backlog":
      return (
        <svg viewBox="0 0 16 16" className={cn(c, "text-fg-subtle")} fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2.4 2.2" />
        </svg>
      );
    case "in_progress":
      return (
        <svg viewBox="0 0 16 16" className={cn(c, "text-amber")} fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 4a4 4 0 0 1 0 8z" fill="currentColor" />
        </svg>
      );
    case "review":
      return (
        <svg viewBox="0 0 16 16" className={cn(c, "text-blue")} fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 4a4 4 0 1 1-4 4h4z" fill="currentColor" />
        </svg>
      );
    case "done":
      return (
        <svg viewBox="0 0 16 16" className={cn(c, "text-green")} fill="none">
          <circle cx="8" cy="8" r="6.75" fill="currentColor" />
          <path d="m5.2 8.2 1.9 1.9 3.8-4" stroke="var(--surface)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 16 16" className={cn(c, "text-fg-muted")} fill="none">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      );
  }
}

export function PriorityIcon({ priority, className }: { priority: string; className?: string }) {
  const c = cn("size-3.5 shrink-0", className);
  if (priority === "urgent")
    return (
      <svg viewBox="0 0 16 16" className={cn(c, "text-red")} aria-label="Urgent">
        <rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="currentColor" />
        <path d="M8 4.5v4.2" stroke="var(--surface)" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="8" cy="11.2" r="1" fill="var(--surface)" />
      </svg>
    );
  if (priority === "none")
    return (
      <svg viewBox="0 0 16 16" className={cn(c, "text-fg-subtle")} aria-label="No priority">
        <path d="M3 8h2m2 0h2m2 0h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  const level = priority === "high" ? 3 : priority === "medium" ? 2 : 1;
  return (
    <svg viewBox="0 0 16 16" className={cn(c, "text-fg-muted")} aria-label={priority}>
      {[0, 1, 2].map((i) => (
        <rect key={i} x={2.5 + i * 4} y={10 - i * 3.2} width="2.6" height={3.5 + i * 3.2} rx="0.6" fill="currentColor" opacity={i < level ? 1 : 0.25} />
      ))}
    </svg>
  );
}

export function StatusBadge({ map, value, className }: { map: Record<string, { label: string; tone: Parameters<typeof Badge>[0]["tone"] }>; value: string; className?: string }) {
  const m = map[value] ?? { label: value, tone: "neutral" as const };
  return (
    <Badge tone={m.tone} className={className}>
      {m.label}
    </Badge>
  );
}

export function Ref({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("font-mono text-xs text-fg-subtle tabular", className)}>{children}</span>;
}
