"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { MarkdownEditor } from "@/components/forms/markdown-editor";
import { api } from "@/lib/api-client";

export function ReleaseForm({ project, snapshots, suggestedTag }: { project: string; snapshots: { id: string; number: number; name: string }[]; suggestedTag: string }) {
  const router = useRouter();
  const [tag, setTag] = useState(suggestedTag);
  const [name, setName] = useState("");
  const [snapshotId, setSnapshotId] = useState(snapshots[0]?.id ?? "");
  const [firmwareCommit, setFirmwareCommit] = useState("");
  const [notes, setNotes] = useState("");
  const [since, setSince] = useState<string | null>(null);
  const [loading, setLoading] = useState<"draft" | "publish" | "notes" | null>(null);

  async function generate() {
    setLoading("notes");
    try {
      const r = await api<{ notes: string; since: { tag: string } | null }>("POST", `/api/v1/projects/${project}/releases/draft-notes`, { snapshotId: snapshotId || null, firmwareCommit: firmwareCommit || null });
      setNotes(r.notes);
      setSince(r.since?.tag ?? "the start of the project");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(null);
    }
  }
  async function submit(publish: boolean) {
    setLoading(publish ? "publish" : "draft");
    try {
      const r = await api<{ tag: string }>("POST", `/api/v1/projects/${project}/releases`, { tag, name, notes: notes || null, snapshotId: snapshotId || null, firmwareCommit: firmwareCommit || null, publish });
      toast.success(publish ? `${r.tag} published` : "Draft saved");
      router.push(`/project/${project}/releases/${encodeURIComponent(r.tag)}`);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
      setLoading(null);
    }
  }
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-[160px_1fr]">
        <Field label="Tag">
          <Input value={tag} onChange={(e) => setTag(e.target.value)} className="font-mono" />
        </Field>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Prototype" autoFocus />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="CAD & files version" hint="Freezes exactly which revision of every file ships">
          <Select value={snapshotId} onChange={(e) => setSnapshotId(e.target.value)}>
            <option value="">No version attached</option>
            {snapshots.map((s) => (
              <option key={s.id} value={s.id}>
                Version {s.number} — {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Firmware commit">
          <Input value={firmwareCommit} onChange={(e) => setFirmwareCommit(e.target.value)} placeholder="a1b2c3d" className="font-mono" />
        </Field>
      </div>
      <Field
        label={
          <span className="flex items-center justify-between">
            Release notes
            <Button type="button" size="xs" variant="outline" onClick={generate} loading={loading === "notes"}>
              <Sparkles className="size-3" /> Generate from project activity
            </Button>
          </span>
        }
        hint={since ? `Generated from requirements, tests, changes, decisions, issues and commits recorded since ${since}.` : "Generated notes use only recorded project data."}
      >
        <MarkdownEditor value={notes} onChange={setNotes} rows={14} />
      </Field>
      <div className="flex gap-2">
        <Button variant="primary" onClick={() => submit(true)} loading={loading === "publish"} disabled={!tag || !name}>
          Publish release
        </Button>
        <Button variant="secondary" onClick={() => submit(false)} loading={loading === "draft"} disabled={!tag || !name}>
          Save draft
        </Button>
      </div>
    </div>
  );
}
