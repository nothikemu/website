"use client";

import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Plus, Settings, Users } from "lucide-react";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { api } from "@/lib/api-client";
import type { ShellOrg } from "@/server/services/shell";
import { cn } from "@/lib/utils";

export function OrgSwitcher({ orgs, active }: { orgs: ShellOrg[]; active: ShellOrg | null }) {
  const router = useRouter();
  async function switchTo(slug: string) {
    await api("POST", `/api/v1/orgs/${slug}/switch`).catch(() => {});
    router.push(`/org/${slug}`);
    router.refresh();
  }
  return (
    <Menu>
      <MenuTrigger asChild>
        <button className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-surface-2 data-[state=open]:bg-surface-2">
          <OrgGlyph name={active?.name ?? "?"} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{active?.name ?? "No organization"}</span>
          </span>
          <ChevronsUpDown className="size-3.5 text-fg-subtle" />
        </button>
      </MenuTrigger>
      <MenuContent align="start" className="w-60">
        <MenuLabel>Organizations</MenuLabel>
        {orgs.map((o) => (
          <MenuItem key={o.id} onSelect={() => switchTo(o.slug)}>
            <OrgGlyph name={o.name} small />
            <span className="flex-1 truncate">{o.name}</span>
            {o.id === active?.id ? <Check className="!text-accent" /> : null}
          </MenuItem>
        ))}
        <MenuSeparator />
        {active ? (
          <>
            <MenuItem onSelect={() => router.push(`/org/${active.slug}/members`)}>
              <Users /> Members
            </MenuItem>
            <MenuItem onSelect={() => router.push(`/org/${active.slug}/settings`)}>
              <Settings /> Organization settings
            </MenuItem>
          </>
        ) : null}
        <MenuItem onSelect={() => router.push("/organizations/new")}>
          <Plus /> New organization
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

export function OrgGlyph({ name, small, className }: { name: string; small?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[4px] border border-border-strong bg-surface-3 font-mono font-semibold text-fg",
        small ? "size-4 text-[9px]" : "size-6 text-[11px]",
        className,
      )}
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}
