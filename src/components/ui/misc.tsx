import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("rounded-lg border border-border bg-surface", className)}>{children}</div>;
}

export function Panel({ title, action, children, className, bodyClassName, count }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; count?: number }) {
  return (
    <section className={cn("rounded-lg border border-border bg-surface", className)}>
      <header className="flex h-9 items-center justify-between gap-2 border-b border-border px-3">
        <h2 className="flex items-center gap-2 text-xs font-semibold tracking-wide text-fg-muted uppercase">
          {title}
          {count !== undefined ? <span className="font-mono text-2xs font-normal text-fg-subtle tabular">{count}</span> : null}
        </h2>
        {action}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      {icon ? <div className="mb-3 flex size-9 items-center justify-center rounded-md border border-border bg-surface-2 text-fg-subtle">{icon}</div> : null}
      <p className="text-sm font-medium text-fg">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-fg-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Mono({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("font-mono text-[0.92em] tabular", className)}>{children}</span>;
}

export function Progress({ value, className, tone = "accent" }: { value: number; className?: string; tone?: "accent" | "green" }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-500", tone === "green" ? "bg-green" : "bg-accent")} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-surface-2", className)} />;
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-border", className)} />;
}

export function KeyValue({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] items-start gap-2 py-1.5 text-sm">
      <dt className="pt-0.5 text-xs text-fg-subtle">{label}</dt>
      <dd className="min-w-0 text-fg">{children}</dd>
    </div>
  );
}
