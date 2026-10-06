import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Crumb = { label: ReactNode; href?: string };

/** Sticky page header: breadcrumbs on the left, actions on the right. */
export function PageHeader({ crumbs, actions, className }: { crumbs: Crumb[]; actions?: ReactNode; className?: string }) {
  return (
    <header className={cn("sticky top-0 z-20 hidden h-12 items-center justify-between gap-3 border-b border-border bg-bg/85 px-5 backdrop-blur-md md:flex", className)}>
      <nav className="flex min-w-0 items-center gap-1 text-sm">
        {crumbs.map((c, i) => (
          <span key={i} className="flex min-w-0 items-center gap-1">
            {i > 0 ? <ChevronRight className="size-3.5 shrink-0 text-fg-subtle" /> : null}
            {c.href ? (
              <Link href={c.href} className="truncate text-fg-muted hover:text-fg">
                {c.label}
              </Link>
            ) : (
              <span className="truncate font-medium text-fg">{c.label}</span>
            )}
          </span>
        ))}
      </nav>
      <div className="flex shrink-0 items-center gap-2">{actions}</div>
    </header>
  );
}

/** Page title block used at the top of content (also visible on mobile where the header is hidden). */
export function PageTitle({ title, description, actions, meta }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; meta?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-[-0.015em] text-fg">{title}</h1>
        {description ? <p className="mt-0.5 max-w-2xl text-sm text-fg-muted">{description}</p> : null}
        {meta ? <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-subtle">{meta}</div> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Content({ children, className, wide }: { children: ReactNode; className?: string; wide?: boolean }) {
  return <div className={cn("mx-auto w-full px-4 py-5 md:px-6 md:py-6", wide ? "max-w-[1400px]" : "max-w-[1160px]", className)}>{children}</div>;
}
