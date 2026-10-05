"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function NavLink({
  href,
  icon,
  children,
  count,
  exact,
  tone,
  shortcut,
}: {
  href: string;
  icon?: ReactNode;
  children: ReactNode;
  count?: number | null;
  exact?: boolean;
  tone?: "danger";
  shortcut?: string;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      prefetch
      className={cn(
        "group flex h-7 items-center gap-2 rounded-md px-2 text-sm transition-colors",
        active ? "bg-surface-2 font-medium text-fg shadow-[inset_0_0_0_1px_var(--border)]" : "text-fg-muted hover:bg-surface-2/70 hover:text-fg",
      )}
    >
      <span className={cn("flex size-4 items-center justify-center [&_svg]:size-[15px]", active ? "text-fg" : "text-fg-subtle group-hover:text-fg-muted")}>{icon}</span>
      <span className="flex-1 truncate">{children}</span>
      {shortcut ? <span className="hidden font-mono text-2xs text-fg-subtle group-hover:inline">{shortcut}</span> : null}
      {count ? (
        <span className={cn("font-mono text-2xs tabular", tone === "danger" ? "rounded-sm bg-red-soft px-1 text-red" : "text-fg-subtle")}>{count}</span>
      ) : null}
    </Link>
  );
}
