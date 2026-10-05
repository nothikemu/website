"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { api } from "@/lib/api-client";

export function CreateToken() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [days, setDays] = useState("90");
  const [token, setToken] = useState<string | null>(null);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Token name, e.g. CI test reporter" value={name} onChange={(e) => setName(e.target.value)} className="min-w-56 flex-1" />
        <Select value={days} onChange={(e) => setDays(e.target.value)} className="w-36">
          <option value="30">30 days</option>
          <option value="90">90 days</option>
          <option value="365">1 year</option>
          <option value="">No expiry</option>
        </Select>
        <Button
          variant="primary"
          disabled={!name.trim()}
          onClick={async () => {
            try {
              const r = await api<{ token: string }>("POST", "/api/v1/me/tokens", { name, expiresInDays: days ? Number(days) : null });
              setToken(r.token);
              setName("");
              router.refresh();
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        >
          Generate token
        </Button>
      </div>
      {token ? (
        <div className="rounded-md border border-green/30 bg-green-soft p-3 text-xs">
          <p className="mb-2 text-green">Copy this token now — it won&apos;t be shown again.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-sm bg-surface px-2 py-1 font-mono text-fg">{token}</code>
            <Button size="sm" onClick={() => navigator.clipboard.writeText(token).then(() => toast.success("Copied"))}>
              <Copy className="size-3.5" />
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
