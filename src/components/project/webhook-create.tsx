"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { api } from "@/lib/api-client";

export function WebhookCreate({ project }: { project: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<"generic" | "github">("generic");
  const [description, setDescription] = useState("");
  const [created, setCreated] = useState<{ url: string; secret: string } | null>(null);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <Select value={kind} onChange={(e) => setKind(e.target.value as "generic" | "github")} className="w-48">
          <option value="generic">CI / test results</option>
          <option value="github">GitHub push events</option>
        </Select>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description, e.g. HIL test rig" className="min-w-48 flex-1" />
        <Button
          variant="primary"
          onClick={async () => {
            try {
              const r = await api<{ url: string; secret: string }>("POST", `/api/v1/projects/${project}/webhooks`, { kind, description: description || null });
              setCreated(r);
              setDescription("");
              router.refresh();
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        >
          Create endpoint
        </Button>
      </div>
      {created ? (
        <div className="grid gap-2 rounded-md border border-green/30 bg-green-soft p-3 text-xs">
          <p className="text-green">Endpoint created. Copy the signing secret now — it is shown only once.</p>
          {[
            ["URL", created.url],
            ["Secret", created.secret],
          ].map(([l, v]) => (
            <div key={l} className="flex items-center gap-2">
              <span className="w-12 text-fg-muted">{l}</span>
              <code className="flex-1 truncate rounded-sm bg-surface px-2 py-1 font-mono text-fg">{v}</code>
              <Button size="icon-sm" onClick={() => navigator.clipboard.writeText(v!).then(() => toast.success("Copied"))} aria-label={`Copy ${l}`}>
                <Copy className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
