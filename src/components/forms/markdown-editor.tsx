"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Markdown textarea with a preview tab. References like REQ-001 are linked on save. */
export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  rows = 8,
  id,
  autoFocus,
  onSubmitShortcut,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  id?: string;
  autoFocus?: boolean;
  onSubmitShortcut?: () => void;
}) {
  const [tab, setTab] = useState<"write" | "preview">("write");
  return (
    <div className="overflow-hidden rounded-md border border-border bg-surface focus-within:border-accent focus-within:ring-2 focus-within:ring-ring/40">
      <div className="flex items-center gap-1 border-b border-border bg-bg-subtle px-1.5 py-1">
        {(["write", "preview"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn("rounded-sm px-2 py-0.5 text-xs capitalize", tab === t ? "bg-surface text-fg shadow-[inset_0_0_0_1px_var(--border)]" : "text-fg-subtle hover:text-fg")}
          >
            {t}
          </button>
        ))}
        <span className="ml-auto hidden pr-1 text-2xs text-fg-subtle sm:block">Markdown · link items with REQ-001, TEST-004 · mention @username</span>
      </div>
      {tab === "write" ? (
        <Textarea
          id={id}
          autoFocus={autoFocus}
          value={value}
          rows={rows}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && onSubmitShortcut) {
              e.preventDefault();
              onSubmitShortcut();
            }
          }}
          className="rounded-none border-0 bg-transparent font-mono text-[13px] focus:ring-0"
        />
      ) : (
        <div className="prose-forge min-h-24 px-3 py-2">
          {value.trim() ? <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{value}</ReactMarkdown> : <p className="text-fg-subtle">Nothing to preview.</p>}
        </div>
      )}
    </div>
  );
}
