"use client";

import { useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, Bot, FileText } from "lucide-react";
import { api } from "@/lib/api-client";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type Answer = { answer: string; sources: { ref: string; title: string; url: string }[]; mode: "ai" | "digest"; provider?: string; model?: string; note?: string };
type Turn = { q: string; label: string; a?: Answer; error?: string };

const ACTIONS = [
  { action: "summarize_activity", label: "Summarize recent activity" },
  { action: "failing_requirements", label: "Explain failing requirements" },
  { action: "test_failures", label: "Summarize test failures" },
  { action: "summarize_decisions", label: "Summarize engineering decisions" },
  { action: "unresolved_issues", label: "Identify unresolved issues" },
  { action: "release_notes", label: "Draft release notes" },
] as const;

export function ForgeChat({ project }: { project: string }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  async function ask(action: string, question: string, label: string) {
    setBusy(true);
    const idx = turns.length;
    setTurns((t) => [...t, { q: question, label }]);
    try {
      const a = await api<Answer>("POST", `/api/v1/projects/${project}/forge`, { action, question });
      setTurns((t) => t.map((x, i) => (i === idx ? { ...x, a } : x)));
    } catch (e) {
      setTurns((t) => t.map((x, i) => (i === idx ? { ...x, error: (e as Error).message } : x)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {turns.length === 0 ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {ACTIONS.map((a) => (
            <button key={a.action} disabled={busy} onClick={() => ask(a.action, a.label, a.label)} className="rounded-lg border border-border bg-surface px-3 py-3 text-left text-sm transition-colors hover:border-border-strong hover:bg-surface-2/60">
              {a.label}
            </button>
          ))}
        </div>
      ) : null}
      {turns.map((t, i) => (
        <div key={i} className="flex flex-col gap-3">
          <div className="self-end rounded-lg bg-surface-2 px-3 py-2 text-sm">{t.label}</div>
          <div className="flex gap-3">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-accent">
              <Bot className="size-3.5" />
            </span>
            <div className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-4 py-3">
              {t.error ? (
                <p className="text-sm text-red">{t.error}</p>
              ) : !t.a ? (
                <span className="flex items-center gap-2 text-sm text-fg-muted">
                  <Spinner className="size-3.5" /> Reading project records…
                </span>
              ) : (
                <>
                  {t.a.note ? <p className="mb-2 rounded-md bg-amber-soft px-2 py-1 text-xs text-amber">{t.a.note}</p> : null}
                  <div className="prose-forge">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
                      {t.a.answer}
                    </ReactMarkdown>
                  </div>
                  {t.a.sources.length ? (
                    <div className="mt-3 border-t border-border pt-2">
                      <div className="mb-1 text-2xs tracking-wide text-fg-subtle uppercase">Sources</div>
                      <div className="flex flex-wrap gap-1.5">
                        {t.a.sources.slice(0, 12).map((s) => (
                          <Link key={s.url + s.ref} href={s.url} className="flex max-w-64 items-center gap-1 truncate rounded-sm border border-border px-1.5 py-0.5 text-2xs text-fg-muted hover:text-fg">
                            <FileText className="size-3 shrink-0" />
                            <span className="font-mono">{s.ref}</span> <span className="truncate">{s.title}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="mt-2 font-mono text-2xs text-fg-subtle">{t.a.mode === "ai" ? `${t.a.provider} · ${t.a.model}` : "retrieval only"}</div>
                </>
              )}
            </div>
          </div>
        </div>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim() && !busy) {
            ask("ask", q, q);
            setQ("");
          }
        }}
        className="sticky bottom-4 flex items-center gap-2 rounded-lg border border-border-strong bg-surface p-1.5 pl-3 shadow-[var(--shadow)]"
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask about this project — e.g. why did the bracket fail?" className="flex-1 bg-transparent text-sm outline-none placeholder:text-fg-subtle" />
        <button disabled={busy || !q.trim()} className={cn("flex size-7 items-center justify-center rounded-md bg-accent text-accent-fg disabled:opacity-40")} aria-label="Ask">
          {busy ? <Spinner className="size-3.5" /> : <ArrowUp className="size-4" />}
        </button>
      </form>
    </div>
  );
}
