"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2, Plus, X } from "lucide-react";
import { api } from "@/lib/api-client";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge, type Tone } from "@/components/ui/badge";

type LinkView = { linkId: string; type: string; ref: string; title: string; status: string | null; url: string; relation: string; direction: "incoming" | "outgoing" };

const GROUP: Record<string, string> = {
  requirement: "Requirements",
  decision: "Decisions",
  file: "Files",
  commit: "Commits",
  test: "Tests",
  test_run: "Test runs",
  issue: "Issues",
  task: "Tasks",
  change: "Changes",
  notebook_entry: "Notebook",
  release: "Releases",
  snapshot: "Versions",
};
const ORDER = ["requirement", "decision", "file", "commit", "test", "issue", "task", "change", "notebook_entry", "release", "snapshot", "test_run"];

const tone = (s: string | null): Tone =>
  !s ? "neutral" : ["passed", "verified", "accepted", "done", "resolved", "closed", "published"].includes(s) ? "green" : ["failed", "blocked", "rejected"].includes(s) ? "red" : ["in_progress", "running", "proposed", "review"].includes(s) ? "amber" : "neutral";

const RELATION_LABEL: Record<string, [string, string]> = {
  verifies: ["verifies", "verified by"],
  implements: ["implements", "implemented by"],
  fixes: ["fixes", "fixed by"],
  affects: ["affects", "affected by"],
  blocks: ["blocks", "blocked by"],
  derived_from: ["derived from", "source of"],
  supersedes: ["supersedes", "superseded by"],
  attachment: ["attaches", "attached to"],
  references: ["references", "referenced by"],
};

/** Traceability links for an entity: grouped by type, with "link by reference" input. */
export function LinksPanel({ project, source, links, canEdit }: { project: string; source: { type: string; id: string }; links: LinkView[]; canEdit: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [ref, setRef] = useState("");
  const [relation, setRelation] = useState("references");
  const groups = ORDER.map((t) => [t, links.filter((l) => l.type === t)] as const).filter(([, l]) => l.length);
  return (
    <section className="rounded-lg border border-border bg-surface">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <h3 className="flex items-center gap-1.5 text-2xs font-medium tracking-wide text-fg-subtle uppercase">
          <Link2 className="size-3" /> Traceability
        </h3>
        {canEdit ? (
          <button onClick={() => setAdding((a) => !a)} className="rounded-sm p-0.5 text-fg-subtle hover:bg-surface-2 hover:text-fg" aria-label="Add link">
            <Plus className="size-3.5" />
          </button>
        ) : null}
      </div>
      {adding ? (
        <form
          className="grid gap-2 border-b border-border p-2"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api("POST", `/api/v1/projects/${project}/links`, { sourceType: source.type, sourceId: source.id, targetRef: ref, relation });
              setRef("");
              setAdding(false);
              router.refresh();
            } catch (err) {
              toast.error((err as Error).message);
            }
          }}
        >
          <div className="flex gap-1.5">
            <Select value={relation} onChange={(e) => setRelation(e.target.value)} className="w-32">
              {["references", "verifies", "implements", "fixes", "affects", "blocks", "derived_from"].map((r) => (
                <option key={r} value={r}>
                  {r.replace("_", " ")}
                </option>
              ))}
            </Select>
            <Input autoFocus placeholder="REQ-004" value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} className="font-mono" />
          </div>
          <Button type="submit" size="sm" variant="secondary" disabled={!ref}>
            Link
          </Button>
        </form>
      ) : null}
      <div className="p-1.5">
        {groups.length ? (
          groups.map(([type, list]) => (
            <div key={type} className="mb-1.5 last:mb-0">
              <div className="px-1.5 pt-1 pb-0.5 text-2xs text-fg-subtle">{GROUP[type] ?? type}</div>
              {list.map((l) => (
                <div key={l.linkId} className="group flex items-center gap-2 rounded-md px-1.5 py-1 hover:bg-surface-2">
                  <Link href={l.url} className="flex min-w-0 flex-1 items-center gap-2" {...(l.url.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                    <span className="shrink-0 font-mono text-2xs text-fg-subtle">{l.ref}</span>
                    <span className="truncate text-xs text-fg">{l.title}</span>
                  </Link>
                  <span className="hidden shrink-0 text-2xs text-fg-subtle group-hover:inline">{(RELATION_LABEL[l.relation] ?? [l.relation, l.relation])[l.direction === "outgoing" ? 0 : 1]}</span>
                  {l.status ? (
                    <Badge tone={tone(l.status)} className="group-hover:hidden">
                      {l.status.replace("_", " ")}
                    </Badge>
                  ) : null}
                  {canEdit ? (
                    <button
                      onClick={async () => {
                        try {
                          await api("DELETE", `/api/v1/projects/${project}/links/${l.linkId}`);
                          router.refresh();
                        } catch (err) {
                          toast.error((err as Error).message);
                        }
                      }}
                      className="hidden rounded-sm text-fg-subtle hover:text-red group-hover:block"
                      aria-label="Remove link"
                    >
                      <X className="size-3" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ))
        ) : (
          <p className="px-1.5 py-2 text-xs text-fg-subtle">No links yet. Reference items like REQ-001 in text, or add a link.</p>
        )}
      </div>
    </section>
  );
}
