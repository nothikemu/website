"use client";

import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Dialog = D.Root;
export const DialogTrigger = D.Trigger;
export const DialogClose = D.Close;

export function DialogContent({ title, description, children, className, wide }: { title: ReactNode; description?: ReactNode; children: ReactNode; className?: string; wide?: boolean }) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] data-[state=open]:animate-fade-in" />
      <D.Content
        className={cn(
          "fixed top-[12vh] left-1/2 z-50 flex max-h-[80vh] w-[calc(100vw-24px)] -translate-x-1/2 flex-col rounded-lg border border-border-strong bg-surface shadow-[var(--shadow)] data-[state=open]:animate-slide-up",
          wide ? "max-w-2xl" : "max-w-md",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border px-4 py-3">
          <div>
            <D.Title className="text-sm font-semibold">{title}</D.Title>
            {description ? <D.Description className="mt-0.5 text-xs text-fg-muted">{description}</D.Description> : <D.Description className="sr-only">{typeof title === "string" ? title : "Dialog"}</D.Description>}
          </div>
          <D.Close className="rounded-sm p-0.5 text-fg-subtle hover:bg-surface-2 hover:text-fg" aria-label="Close">
            <X className="size-4" />
          </D.Close>
        </div>
        <div className="overflow-y-auto px-4 py-4">{children}</div>
      </D.Content>
    </D.Portal>
  );
}

export function DialogFooter({ children }: { children: ReactNode }) {
  return <div className="-mx-4 -mb-4 mt-4 flex items-center justify-end gap-2 border-t border-border bg-bg-subtle/50 px-4 py-3">{children}</div>;
}
