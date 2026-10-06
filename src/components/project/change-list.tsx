import Link from "next/link";
import type { EntryChange } from "@/server/services/snapshots";
import { cn } from "@/lib/utils";

const STYLE = {
  added: { l: "A", c: "text-green bg-green-soft" },
  modified: { l: "M", c: "text-amber bg-amber-soft" },
  renamed: { l: "R", c: "text-blue bg-blue-soft" },
  removed: { l: "D", c: "text-red bg-red-soft" },
  unchanged: { l: "·", c: "text-fg-subtle bg-surface-2" },
} as const;

/** Git-style changed-files list for project versions. */
export function ChangeList({ project, changes, showUnchanged }: { project: string; changes: EntryChange[]; showUnchanged?: boolean }) {
  const list = showUnchanged ? changes : changes.filter((c) => c.status !== "unchanged");
  if (!list.length) return <p className="px-3 py-4 text-sm text-fg-subtle">No file changes.</p>;
  return (
    <ul className="divide-y divide-border">
      {list.map((c) => (
        <li key={c.fileId} className="flex items-center gap-3 px-3 py-1.5">
          <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-sm font-mono text-2xs font-semibold", STYLE[c.status].c)}>{STYLE[c.status].l}</span>
          {c.status === "removed" ? (
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-fg-muted line-through">{c.path}</span>
          ) : (
            <Link href={`/project/${project}/files/${c.fileId}`} className="min-w-0 flex-1 truncate font-mono text-xs hover:text-accent">
              {c.status === "renamed" && c.from ? <span className="text-fg-subtle">{c.from.path} → </span> : null}
              {c.path}
            </Link>
          )}
          <span className="font-mono text-2xs text-fg-subtle">
            {c.from && c.to && c.from.number !== c.to.number ? `v${c.from.number} → v${c.to.number}` : c.to ? `v${c.to.number}` : c.from ? `v${c.from.number}` : ""}
          </span>
          {c.status === "modified" && c.from && c.to ? (
            <Link href={`/project/${project}/files/${c.fileId}?compare=${c.from.versionId}&to=${c.to.versionId}`} className="text-2xs text-fg-subtle hover:text-fg">
              diff
            </Link>
          ) : (
            <span className="w-6" />
          )}
        </li>
      ))}
    </ul>
  );
}
