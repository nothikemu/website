"use client";

import { DropdownMenu as M } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Menu = M.Root;
export const MenuTrigger = M.Trigger;

export function MenuContent({ children, align = "end", className, sideOffset = 4 }: { children: ReactNode; align?: "start" | "end" | "center"; className?: string; sideOffset?: number }) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={sideOffset}
        className={cn("z-50 min-w-48 rounded-md border border-border-strong bg-surface p-1 shadow-[var(--shadow)] data-[state=open]:animate-fade-in", className)}
      >
        {children}
      </M.Content>
    </M.Portal>
  );
}

export function MenuItem({ children, onSelect, danger, className, shortcut, asChild }: { children: ReactNode; onSelect?: (e: Event) => void; danger?: boolean; className?: string; shortcut?: string; asChild?: boolean }) {
  return (
    <M.Item
      asChild={asChild}
      onSelect={onSelect}
      className={cn(
        "flex h-7 cursor-default items-center gap-2 rounded-sm px-2 text-sm outline-none select-none data-[highlighted]:bg-surface-2 [&_svg]:size-3.5 [&_svg]:text-fg-subtle",
        danger ? "text-red data-[highlighted]:bg-red-soft [&_svg]:text-red" : "text-fg",
        className,
      )}
    >
      {asChild ? children : (
        <>
          <span className="flex flex-1 items-center gap-2">{children}</span>
          {shortcut ? <span className="font-mono text-2xs text-fg-subtle">{shortcut}</span> : null}
        </>
      )}
    </M.Item>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <M.Label className="px-2 pt-1.5 pb-1 text-2xs font-medium tracking-wide text-fg-subtle uppercase">{children}</M.Label>;
}

export function MenuSeparator() {
  return <M.Separator className="my-1 h-px bg-border" />;
}
