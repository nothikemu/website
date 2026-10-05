"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { MarkdownEditor } from "@/components/forms/markdown-editor";
import { api } from "@/lib/api-client";

export function CreateVersion({ project, nextNumber, summary, defaultOpen, disabled }: { project: string; nextNumber: number; summary: { added: number; modified: number; removed: number }; defaultOpen?: boolean; disabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(Boolean(defaultOpen) && !disabled);
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="primary" disabled={disabled}>
          <Plus className="size-3.5" /> Create version
        </Button>
      </DialogTrigger>
      <DialogContent title={`Create Version ${nextNumber}`} description={`Captures the current revision of every file: +${summary.added} added · ${summary.modified} modified · ${summary.removed} removed since the last version.`} wide>
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
            <Field label="Name">
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Drive system integration" />
            </Field>
            <Field label="Tag (optional)">
              <Input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="cad-rev-c" className="font-mono" />
            </Field>
          </div>
          <Field label="Description">
            <MarkdownEditor value={description} onChange={setDescription} rows={5} placeholder="What changed and why? Reference CHANGE-012, DEC-004…" />
          </Field>
        </div>
        <DialogFooter>
          <Button
            variant="primary"
            loading={loading}
            disabled={!name.trim()}
            onClick={async () => {
              setLoading(true);
              try {
                const s = await api<{ number: number }>("POST", `/api/v1/projects/${project}/versions`, { name, tag: tag || null, description: description || null });
                toast.success(`Version ${s.number} created`);
                setOpen(false);
                router.push(`/project/${project}/versions/${s.number}`);
                router.refresh();
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setLoading(false);
              }
            }}
          >
            Create version
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
