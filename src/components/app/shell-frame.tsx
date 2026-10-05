"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Menu, Search, X } from "lucide-react";
import { CommandPalette } from "./command-palette";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { LogoMark } from "./logo";
import type { ShellOrg, ShellProject } from "@/server/services/shell";
import { cn } from "@/lib/utils";

const PaletteContext = createContext<{ open: () => void }>({ open: () => {} });
export const usePalette = () => useContext(PaletteContext);

const GOTO: Record<string, string> = { o: "", f: "/files", i: "/issues", t: "/tasks", r: "/requirements", e: "/tests", d: "/decisions", n: "/notebook", a: "/activity", v: "/versions" };

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
}

export function ShellFrame({
  sidebar,
  children,
  projects,
  orgs,
  activeOrg,
}: {
  sidebar: ReactNode;
  children: ReactNode;
  projects: ShellProject[];
  orgs: ShellOrg[];
  activeOrg: ShellOrg | null;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [help, setHelp] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const pending = useRef<{ key: string; at: number } | null>(null);
  const projectSlug = /^\/project\/([^/]+)/.exec(pathname)?.[1];

  useEffect(() => setDrawer(false), [pathname]);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (isTyping(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (document.querySelector("[role=dialog]")) return;
      const k = e.key.toLowerCase();
      const now = Date.now();
      if (pending.current?.key === "g" && now - pending.current.at < 900) {
        pending.current = null;
        if (k === "h") return router.push("/dashboard");
        if (projectSlug && k in GOTO) return router.push(`/project/${projectSlug}${GOTO[k]}`);
        return;
      }
      if (k === "g") {
        pending.current = { key: "g", at: now };
        return;
      }
      if (k === "/") {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (e.key === "?") {
        setHelp(true);
      } else if (k === "c" && projectSlug) {
        router.push(`/project/${projectSlug}/issues/new`);
      }
    },
    [projectSlug, router],
  );

  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey]);

  return (
    <PaletteContext.Provider value={{ open: () => setPaletteOpen(true) }}>
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-[236px] shrink-0 border-r border-border bg-bg-subtle md:block">{sidebar}</aside>
        {/* Mobile drawer */}
        <div className={cn("fixed inset-0 z-40 md:hidden", drawer ? "" : "pointer-events-none")}>
          <div className={cn("absolute inset-0 bg-black/50 transition-opacity", drawer ? "opacity-100" : "opacity-0")} onClick={() => setDrawer(false)} />
          <aside className={cn("absolute inset-y-0 left-0 w-[272px] border-r border-border bg-bg-subtle transition-transform duration-200", drawer ? "translate-x-0" : "-translate-x-full")}>
            <button className="absolute top-3 right-3 rounded-sm p-1 text-fg-subtle hover:bg-surface-2" onClick={() => setDrawer(false)} aria-label="Close menu">
              <X className="size-4" />
            </button>
            {sidebar}
          </aside>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border bg-bg/90 px-3 backdrop-blur md:hidden">
            <button className="rounded-md p-1.5 text-fg-muted hover:bg-surface-2" onClick={() => setDrawer(true)} aria-label="Open menu">
              <Menu className="size-5" />
            </button>
            <LogoMark />
            <button onClick={() => setPaletteOpen(true)} className="ml-auto flex h-8 items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-sm text-fg-subtle">
              <Search className="size-3.5" /> Search
            </button>
          </div>
          <main className="min-w-0 flex-1">{children}</main>
        </div>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} projects={projects} orgs={orgs} activeOrg={activeOrg} />
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent title="Keyboard shortcuts">
          <div className="grid gap-1.5 text-sm">
            {[
              ["Command palette", ["⌘", "K"]],
              ["Search", ["/"]],
              ["Create issue (in a project)", ["C"]],
              ["Go to dashboard", ["G", "H"]],
              ["Go to overview / files / issues", ["G", "O · F · I"]],
              ["Go to tasks / requirements / tests", ["G", "T · R · E"]],
              ["Go to decisions / notebook / activity", ["G", "D · N · A"]],
              ["Show shortcuts", ["?"]],
            ].map(([label, keys]) => (
              <div key={label as string} className="flex items-center justify-between border-b border-border py-1.5 last:border-0">
                <span className="text-fg-muted">{label}</span>
                <span className="flex gap-1">
                  {(keys as string[]).map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </PaletteContext.Provider>
  );
}

export function SearchButton() {
  const { open } = usePalette();
  return (
    <button
      onClick={open}
      className="flex h-8 w-full items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-sm text-fg-subtle transition-colors hover:border-border-strong hover:text-fg-muted"
    >
      <Search className="size-3.5" />
      <span className="flex-1 text-left">Search…</span>
      <span className="flex gap-0.5">
        <Kbd>⌘</Kbd>
        <Kbd>K</Kbd>
      </span>
    </button>
  );
}
