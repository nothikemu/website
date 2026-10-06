"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const ITEMS = [
  ["/settings", "Profile"],
  ["/settings/account", "Account & security"],
  ["/settings/connections", "Connected accounts"],
  ["/settings/notifications", "Notifications"],
  ["/settings/tokens", "API tokens"],
];

export function SettingsNav() {
  const p = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col">
      {ITEMS.map(([href, label]) => (
        <Link key={href} href={href!} className={cn("rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap", p === href ? "bg-surface-2 font-medium text-fg" : "text-fg-muted hover:text-fg")}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
