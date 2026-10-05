"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function OrgTabs({ slug, canAdmin }: { slug: string; canAdmin: boolean }) {
  const pathname = usePathname();
  const tabs = [
    { href: `/org/${slug}`, label: "Projects" },
    { href: `/org/${slug}/members`, label: "Members" },
    { href: `/org/${slug}/integrations`, label: "Integrations" },
    ...(canAdmin ? [{ href: `/org/${slug}/audit`, label: "Audit log" }] : []),
    { href: `/org/${slug}/billing`, label: "Plan & usage" },
    ...(canAdmin ? [{ href: `/org/${slug}/settings`, label: "Settings" }] : []),
  ];
  return (
    <nav className="-mb-px flex gap-4 overflow-x-auto border-b border-border">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link key={t.href} href={t.href} className={cn("border-b-2 pb-2 text-sm whitespace-nowrap transition-colors", active ? "border-accent font-medium text-fg" : "border-transparent text-fg-muted hover:text-fg")}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
