"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { api } from "@/lib/api-client";

type Repo = { fullName: string; private: boolean; description: string | null };

export function GithubConnect({ project, current }: { project: string; current: string | null }) {
  const router = useRouter();
  const [repos, setRepos] = useState<Repo[] | null>(null);
  const [mock, setMock] = useState(false);
  const [repo, setRepo] = useState(current ?? "");
  const [loading, setLoading] = useState(false);
  async function loadRepos() {
    try {
      const r = await api<{ mock: boolean; repos: Repo[] }>("GET", "/api/v1/github/repos");
      setRepos(r.repos);
      setMock(r.mock);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        {repos ? (
          <Select value={repo} onChange={(e) => setRepo(e.target.value)} className="min-w-64 flex-1">
            <option value="">Select a repository…</option>
            {repos.map((r) => (
              <option key={r.fullName} value={r.fullName}>
                {r.fullName} {r.private ? "(private)" : ""}
              </option>
            ))}
          </Select>
        ) : (
          <Input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/repository" className="min-w-64 flex-1 font-mono" />
        )}
        {!repos ? (
          <Button variant="outline" onClick={loadRepos}>
            Browse my repositories
          </Button>
        ) : null}
        <Button
          variant="primary"
          loading={loading}
          disabled={!repo}
          onClick={async () => {
            setLoading(true);
            try {
              const r = await api<{ imported: number; mock: boolean }>("POST", `/api/v1/projects/${project}/integrations/github`, { repository: repo });
              toast.success(`Linked ${repo} · imported ${r.imported} commits${r.mock ? " (mock adapter)" : ""}`);
              router.refresh();
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setLoading(false);
            }
          }}
        >
          {current ? "Change repository" : "Link repository"}
        </Button>
      </div>
      {mock ? <p className="text-xs text-amber">GitHub OAuth isn&apos;t configured on this server — showing the local mock adapter.</p> : null}
    </div>
  );
}

export function SyncButton({ project }: { project: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  return (
    <Button
      size="sm"
      variant="outline"
      loading={loading}
      onClick={async () => {
        setLoading(true);
        try {
          const r = await api<{ imported: number }>("POST", `/api/v1/projects/${project}/integrations/github/sync`);
          toast.success(r.imported ? `Imported ${r.imported} new commits` : "Up to date");
          router.refresh();
        } catch (e) {
          toast.error((e as Error).message);
        } finally {
          setLoading(false);
        }
      }}
    >
      <RefreshCw className="size-3.5" /> Sync commits
    </Button>
  );
}

export function ChannelForm({ project, events }: { project: string; events: string[] }) {
  const router = useRouter();
  const [provider, setProvider] = useState<"discord" | "slack">("discord");
  const [url, setUrl] = useState("");
  const [selected, setSelected] = useState<string[]>(["test.failed", "release.published", "change.created", "milestone.completed"]);
  const [loading, setLoading] = useState(false);
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-2">
        <Select value={provider} onChange={(e) => setProvider(e.target.value as "discord" | "slack")} className="w-32">
          <option value="discord">Discord</option>
          <option value="slack">Slack</option>
        </Select>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={provider === "discord" ? "https://discord.com/api/webhooks/…" : "https://hooks.slack.com/services/…"} className="min-w-64 flex-1 font-mono text-xs" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {events.map((e) => (
          <label key={e} className="flex cursor-pointer items-center gap-1.5 rounded-sm border border-border px-2 py-1 font-mono text-2xs">
            <input type="checkbox" checked={selected.includes(e)} onChange={() => setSelected((s) => (s.includes(e) ? s.filter((x) => x !== e) : [...s, e]))} className="accent-[var(--accent)]" />
            {e}
          </label>
        ))}
      </div>
      <div>
        <Button
          variant="primary"
          size="sm"
          loading={loading}
          disabled={!url}
          onClick={async () => {
            setLoading(true);
            try {
              const r = await api<{ delivered: boolean }>("POST", `/api/v1/projects/${project}/integrations/channels`, { provider, webhookUrl: url, events: selected });
              toast[r.delivered ? "success" : "warning"](r.delivered ? "Connected — a test message was sent" : "Saved, but the test message could not be delivered");
              setUrl("");
              router.refresh();
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setLoading(false);
            }
          }}
        >
          Connect channel
        </Button>
      </div>
    </div>
  );
}
