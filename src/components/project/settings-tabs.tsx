"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function SettingsTabs({ base }: { base: string }) {
  const p = usePathname();
  const tabs = [
    [`${base}/settings`, "General"],
    [`${base}/settings/members`, "Members"],
    [`${base}/settings/integrations`, "Integrations"],
    [`${base}/settings/webhooks`, "Webhooks & API"],
  ];
  return (
    <nav className="mb-5 flex gap-4 overflow-x-auto border-b border-border">
      {tabs.map(([href, label]) => (
        <Link key={href} href={href!} className={cn("-mb-px border-b-2 pb-2 text-sm whitespace-nowrap", p === href ? "border-accent font-medium text-fg" : "border-transparent text-fg-muted hover:text-fg")}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
