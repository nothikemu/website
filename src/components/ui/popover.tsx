"use client";

import { Popover as P } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Popover = P.Root;
export const PopoverTrigger = P.Trigger;
export const PopoverClose = P.Close;

export function PopoverContent({ children, className, align = "start" }: { children: ReactNode; className?: string; align?: "start" | "end" | "center" }) {
  return (
    <P.Portal>
      <P.Content align={align} sideOffset={4} className={cn("z-50 w-64 rounded-md border border-border-strong bg-surface p-1 shadow-[var(--shadow)] data-[state=open]:animate-fade-in", className)}>
        {children}
      </P.Content>
    </P.Portal>
  );
}
