"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** URL-driven filters: every change updates search params so views are shareable. */
export function FilterBar({ filters, searchPlaceholder = "Filter…" }: { filters: { key: string; label: string; options: { value: string; label: string }[] }[]; searchPlaceholder?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");
  const set = (k: string, v: string | null) => {
    const next = new URLSearchParams(sp.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    router.push(`${pathname}?${next.toString()}`);
  };
  useEffect(() => {
    const t = setTimeout(() => {
      if ((sp.get("q") ?? "") !== q) set("q", q || null);
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  const active = filters.filter((f) => sp.get(f.key));
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-surface px-2 focus-within:border-accent">
        <Search className="size-3.5 text-fg-subtle" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} className="w-40 bg-transparent text-xs outline-none placeholder:text-fg-subtle" />
      </div>
      {filters.map((f) => (
        <label key={f.key} className={cn("relative flex h-7 items-center gap-1 rounded-md border px-2 text-xs", sp.get(f.key) ? "border-border-strong bg-surface-2 text-fg" : "border-border text-fg-muted hover:bg-surface-2/60")}>
          {f.label}
          {sp.get(f.key) ? <span className="font-medium">: {f.options.find((o) => o.value === sp.get(f.key))?.label ?? sp.get(f.key)}</span> : null}
          <select value={sp.get(f.key) ?? ""} onChange={(e) => set(f.key, e.target.value || null)} className="absolute inset-0 cursor-pointer opacity-0" aria-label={f.label}>
            <option value="">Any {f.label.toLowerCase()}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ))}
      {active.length || sp.get("q") ? (
        <button
          onClick={() => {
            setQ("");
            const next = new URLSearchParams(sp.toString());
            for (const f of filters) next.delete(f.key);
            next.delete("q");
            router.push(`${pathname}?${next.toString()}`);
          }}
          className="flex h-7 items-center gap-1 px-1 text-xs text-fg-subtle hover:text-fg"
        >
          <X className="size-3" /> Clear
        </button>
      ) : null}
    </div>
  );
}
