import type { DiffResult } from "@/server/services/files";
import { cn } from "@/lib/utils";

/** Unified text diff with context collapsing, or a metadata comparison for binary/CAD files. */
export function DiffView({ diff }: { diff: DiffResult }) {
  if (diff.mode === "metadata") {
    return (
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-bg-subtle text-left text-xs text-fg-subtle">
          <tr>
            <th className="px-3 py-2 font-medium">Property</th>
            <th className="px-3 py-2 font-mono font-medium">v{diff.a.number}</th>
            <th className="px-3 py-2 font-mono font-medium">v{diff.b.number}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border font-mono text-xs">
          {diff.rows.map((r) => (
            <tr key={r.field} className={cn(r.changed && "bg-amber-soft/40")}>
              <td className="px-3 py-1.5 font-sans text-fg-muted">{r.field}</td>
              <td className={cn("px-3 py-1.5 break-all", r.changed && "text-red")}>{r.a}</td>
              <td className={cn("px-3 py-1.5 break-all", r.changed && "text-green")}>{r.b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  type Line = { kind: "add" | "del" | "ctx" | "skip"; a?: number; b?: number; text: string };
  const lines: Line[] = [];
  let a = 1;
  let b = 1;
  diff.hunks.forEach((h, idx) => {
    const parts = h.value.replace(/\n$/, "").split("\n");
    if (h.added) parts.forEach((t) => lines.push({ kind: "add", b: b++, text: t }));
    else if (h.removed) parts.forEach((t) => lines.push({ kind: "del", a: a++, text: t }));
    else {
      const first = idx === 0;
      const last = idx === diff.hunks.length - 1;
      const keepHead = first ? 0 : 3;
      const keepTail = last ? 0 : 3;
      if (parts.length > keepHead + keepTail + 2) {
        parts.slice(0, keepHead).forEach((t) => lines.push({ kind: "ctx", a: a++, b: b++, text: t }));
        const skipped = parts.length - keepHead - keepTail;
        lines.push({ kind: "skip", text: `${skipped} unchanged lines` });
        a += skipped;
        b += skipped;
        parts.slice(parts.length - keepTail).forEach((t) => lines.push({ kind: "ctx", a: a++, b: b++, text: t }));
      } else parts.forEach((t) => lines.push({ kind: "ctx", a: a++, b: b++, text: t }));
    }
  });
  return (
    <div className="overflow-x-auto">
      <div className="flex items-center gap-3 border-b border-border px-3 py-2 font-mono text-xs">
        <span className="text-green">+{diff.stats.added}</span>
        <span className="text-red">−{diff.stats.removed}</span>
        <span className="text-fg-subtle">
          v{diff.a.number} → v{diff.b.number}
        </span>
      </div>
      <pre className="text-xs leading-5">
        {lines.map((l, i) =>
          l.kind === "skip" ? (
            <div key={i} className="bg-blue-soft/40 px-3 py-0.5 text-fg-subtle">
              ⋯ {l.text}
            </div>
          ) : (
            <div key={i} className={cn("flex", l.kind === "add" && "bg-green-soft", l.kind === "del" && "bg-red-soft")}>
              <span className="w-10 shrink-0 pr-2 text-right text-fg-subtle select-none">{l.a ?? ""}</span>
              <span className="w-10 shrink-0 pr-2 text-right text-fg-subtle select-none">{l.b ?? ""}</span>
              <span className={cn("w-4 shrink-0 select-none", l.kind === "add" ? "text-green" : l.kind === "del" ? "text-red" : "text-fg-subtle")}>{l.kind === "add" ? "+" : l.kind === "del" ? "−" : " "}</span>
              <code className="pr-4 whitespace-pre">{l.text}</code>
            </div>
          ),
        )}
      </pre>
    </div>
  );
}
