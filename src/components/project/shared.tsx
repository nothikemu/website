import type { ReactNode } from "react";
import { PageHeader, type Crumb } from "@/components/app/page-header";
import { cn } from "@/lib/utils";

export function ProjectHeader({ project, org, crumbs, actions }: { project: { slug: string; name: string }; org: { slug: string; name: string }; crumbs: Crumb[]; actions?: ReactNode }) {
  return <PageHeader crumbs={[{ label: org.name, href: `/org/${org.slug}` }, { label: project.name, href: `/project/${project.slug}` }, ...crumbs]} actions={actions} />;
}

/** Two-column detail layout: document on the left, properties on the right. */
export function DetailLayout({ main, side }: { main: ReactNode; side: ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="min-w-0">{main}</div>
      <aside className="flex flex-col gap-4 lg:sticky lg:top-16 lg:self-start">{side}</aside>
    </div>
  );
}

export function SideSection({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-lg border border-border bg-surface", className)}>
      <h3 className="border-b border-border px-3 py-2 text-2xs font-medium tracking-wide text-fg-subtle uppercase">{title}</h3>
      <div className="px-2 py-1.5">{children}</div>
    </section>
  );
}

export function Prop({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[88px_1fr] items-center gap-1 py-0.5">
      <span className="px-1 text-xs text-fg-subtle">{label}</span>
      <div className="min-w-0 text-sm">{children}</div>
    </div>
  );
}

export function DocSection({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-wide text-fg-muted uppercase">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Filter chip row rendered as links (server-side filtering via search params). */
export function FilterTabs({ items, active }: { items: { key: string; label: string; href: string; count?: number }[]; active: string }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      {items.map((i) => (
        <a
          key={i.key}
          href={i.href}
          className={cn(
            "flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors",
            active === i.key ? "border-border-strong bg-surface-2 font-medium text-fg" : "border-transparent text-fg-muted hover:bg-surface-2/60 hover:text-fg",
          )}
        >
          {i.label}
          {i.count !== undefined ? <span className="font-mono text-2xs text-fg-subtle">{i.count}</span> : null}
        </a>
      ))}
    </div>
  );
}

export function TableShell({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("overflow-hidden rounded-lg border border-border bg-surface", className)}>{children}</div>;
}
