"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, FolderPlus, MoreHorizontal, Pencil, Trash2, Upload, MoveRight, UploadCloud } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Avatar } from "@/components/ui/avatar";
import { Time } from "@/components/app/time";
import { formatBytes } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { FileIcon, FolderIcon } from "./file-icon";
import { useUploads } from "./upload-manager";

type FolderRow = { id: string; name: string; path: string; fileCount: number; size: number; updatedAt: string | Date };
type FileRow = { id: string; name: string; path: string; kind: string; size: number; versionCount: number; updatedAt: string | Date; updatedByUser: { id: string; displayName: string; username: string; avatarUrl: string | null } | null };
type TreeFolder = { id: string; path: string };

export function FileBrowser({
  project,
  folderId,
  folders,
  files,
  tree,
  canWrite,
  autoUpload,
}: {
  project: string;
  folderId: string | null;
  folders: FolderRow[];
  files: FileRow[];
  tree: TreeFolder[];
  canWrite: boolean;
  autoUpload?: boolean;
}) {
  const router = useRouter();
  const { upload } = useUploads();
  const input = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [newFolder, setNewFolder] = useState(false);
  const [name, setName] = useState("");
  const [rename, setRename] = useState<{ kind: "file" | "folder"; id: string; name: string } | null>(null);
  const [move, setMove] = useState<{ kind: "file" | "folder"; id: string; path: string } | null>(null);
  const [target, setTarget] = useState<string>("");
  const [highlight, setHighlight] = useState(Boolean(autoUpload));

  useEffect(() => {
    if (autoUpload) {
      const t = setTimeout(() => setHighlight(false), 2500);
      return () => clearTimeout(t);
    }
  }, [autoUpload]);

  const base = `/api/v1/projects/${project}`;
  async function call(method: "PATCH" | "DELETE" | "POST", url: string, body?: unknown, ok?: string) {
    try {
      await api(method, url, body);
      if (ok) toast.success(ok);
      router.refresh();
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    }
  }

  return (
    <div
      onDragOver={(e) => {
        if (!canWrite) return;
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDrag(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (!canWrite) return;
        const list = [...e.dataTransfer.files];
        if (list.length) upload(list, { folderId });
      }}
      className={cn("relative rounded-lg border bg-surface transition-colors", drag ? "border-accent bg-accent-soft/30" : "border-border", highlight && "ring-2 ring-accent/50")}
    >
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-xs text-fg-subtle">
          {folders.length} folders · {files.length} files
        </span>
        {canWrite ? (
          <div className="ml-auto flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setNewFolder(true)}>
              <FolderPlus className="size-3.5" /> New folder
            </Button>
            <Button size="sm" variant="primary" onClick={() => input.current?.click()}>
              <Upload className="size-3.5" /> Upload
            </Button>
            <input
              ref={input}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                const list = [...(e.target.files ?? [])];
                if (list.length) upload(list, { folderId });
                e.target.value = "";
              }}
            />
          </div>
        ) : null}
      </div>

      {folders.length + files.length === 0 ? (
        <button
          disabled={!canWrite}
          onClick={() => input.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 px-6 py-16 text-center text-sm text-fg-muted"
        >
          <UploadCloud className="size-8 text-fg-subtle" strokeWidth={1.5} />
          <span className="font-medium text-fg">This folder is empty</span>
          <span className="max-w-sm text-xs">Drop CAD, drawings, schematics, firmware, test data or media here. Uploading a file with an existing name creates a new revision.</span>
        </button>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-2xs tracking-wide text-fg-subtle uppercase">
              <tr className="border-b border-border">
                <th className="px-3 py-1.5 font-medium">Name</th>
                <th className="hidden w-16 px-3 py-1.5 font-medium sm:table-cell">Rev</th>
                <th className="hidden w-24 px-3 py-1.5 text-right font-medium sm:table-cell">Size</th>
                <th className="hidden w-44 px-3 py-1.5 font-medium md:table-cell">Updated by</th>
                <th className="w-24 px-3 py-1.5 text-right font-medium">Updated</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {folders.map((f) => (
                <tr key={f.id} className="group hover:bg-surface-2/60">
                  <td className="px-3 py-1.5">
                    <Link href={`/project/${project}/files?folder=${f.id}`} className="flex items-center gap-2.5">
                      <FolderIcon />
                      <span className="font-medium">{f.name}</span>
                      <span className="text-2xs text-fg-subtle">{f.fileCount ? `${f.fileCount} files` : ""}</span>
                    </Link>
                  </td>
                  <td className="hidden px-3 sm:table-cell" />
                  <td className="hidden px-3 text-right font-mono text-xs text-fg-subtle sm:table-cell">{f.size ? formatBytes(f.size) : "—"}</td>
                  <td className="hidden px-3 md:table-cell" />
                  <td className="px-3 text-right font-mono text-2xs text-fg-subtle">
                    <Time date={f.updatedAt} />
                  </td>
                  <td className="px-2">
                    {canWrite ? (
                      <RowMenu
                        items={[
                          { icon: <Pencil />, label: "Rename", onSelect: () => setRename({ kind: "folder", id: f.id, name: f.name }) },
                          { icon: <MoveRight />, label: "Move", onSelect: () => setMove({ kind: "folder", id: f.id, path: f.path }) },
                          null,
                          { icon: <Trash2 />, label: "Delete folder", danger: true, onSelect: () => confirm(`Delete ${f.path} and move its ${f.fileCount} files to trash?`) && call("DELETE", `${base}/folders/${f.id}`, undefined, "Folder deleted") },
                        ]}
                      />
                    ) : null}
                  </td>
                </tr>
              ))}
              {files.map((f) => (
                <tr key={f.id} className="group hover:bg-surface-2/60">
                  <td className="px-3 py-1.5">
                    <Link href={`/project/${project}/files/${f.id}`} className="flex items-center gap-2.5">
                      <FileIcon kind={f.kind} />
                      <span className="truncate font-mono text-[13px]">{f.name}</span>
                    </Link>
                  </td>
                  <td className="hidden px-3 font-mono text-xs text-fg-muted sm:table-cell">v{f.versionCount}</td>
                  <td className="hidden px-3 text-right font-mono text-xs text-fg-subtle sm:table-cell">{formatBytes(f.size)}</td>
                  <td className="hidden px-3 md:table-cell">
                    {f.updatedByUser ? (
                      <span className="flex items-center gap-1.5 text-xs text-fg-muted">
                        <Avatar user={f.updatedByUser} size={16} /> {f.updatedByUser.displayName}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 text-right font-mono text-2xs text-fg-subtle">
                    <Time date={f.updatedAt} />
                  </td>
                  <td className="px-2">
                    <RowMenu
                      items={[
                        { icon: <Download />, label: "Download", onSelect: () => (window.location.href = `${base}/files/${f.id}/download`) },
                        ...(canWrite
                          ? [
                              { icon: <Pencil />, label: "Rename", onSelect: () => setRename({ kind: "file" as const, id: f.id, name: f.name }) },
                              { icon: <MoveRight />, label: "Move", onSelect: () => setMove({ kind: "file" as const, id: f.id, path: f.path }) },
                              null,
                              { icon: <Trash2 />, label: "Delete", danger: true, onSelect: () => confirm(`Move ${f.name} to trash? Its history is kept and it can be restored.`) && call("DELETE", `${base}/files/${f.id}`, undefined, "Moved to trash") },
                            ]
                          : []),
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {drag ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg">
          <div className="rounded-md border border-accent bg-surface px-4 py-2 text-sm font-medium text-accent shadow-[var(--shadow)]">Drop to upload</div>
        </div>
      ) : null}

      <Dialog open={newFolder} onOpenChange={setNewFolder}>
        <DialogContent title="New folder">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (await call("POST", `${base}/folders`, { name, parentId: folderId }, "Folder created")) {
                setNewFolder(false);
                setName("");
              }
            }}
          >
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="drivetrain" className="font-mono" />
            <DialogFooter>
              <Button type="submit" variant="primary" disabled={!name.trim()}>
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rename} onOpenChange={(o) => !o && setRename(null)}>
        <DialogContent title={`Rename ${rename?.kind}`}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!rename) return;
              if (await call("PATCH", `${base}/${rename.kind === "file" ? "files" : "folders"}/${rename.id}`, { name: rename.name }, "Renamed")) setRename(null);
            }}
          >
            <Input autoFocus value={rename?.name ?? ""} onChange={(e) => setRename((r) => (r ? { ...r, name: e.target.value } : r))} className="font-mono" />
            <DialogFooter>
              <Button type="submit" variant="primary">
                Rename
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!move} onOpenChange={(o) => !o && setMove(null)}>
        <DialogContent title="Move" description={move?.path}>
          <Select value={target} onChange={(e) => setTarget(e.target.value)} autoFocus>
            <option value="">/ (project root)</option>
            {tree
              .filter((t) => !(move?.kind === "folder" && (t.path === move.path || t.path.startsWith(`${move.path}/`))))
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.path}
                </option>
              ))}
          </Select>
          <DialogFooter>
            <Button
              variant="primary"
              onClick={async () => {
                if (!move) return;
                const ok = await call("PATCH", `${base}/${move.kind === "file" ? "files" : "folders"}/${move.id}`, move.kind === "file" ? { folderId: target || null } : { parentId: target || null }, "Moved");
                if (ok) setMove(null);
              }}
            >
              Move here
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RowMenu({ items }: { items: ({ icon: React.ReactNode; label: string; onSelect: () => unknown; danger?: boolean } | null)[] }) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <button className="rounded-sm p-1 text-fg-subtle opacity-60 group-hover:opacity-100 hover:bg-surface-3 hover:text-fg data-[state=open]:opacity-100" aria-label="Actions">
          <MoreHorizontal className="size-4" />
        </button>
      </MenuTrigger>
      <MenuContent>
        {items.map((i, idx) =>
          i ? (
            <MenuItem key={i.label} danger={i.danger} onSelect={() => i.onSelect()}>
              {i.icon} {i.label}
            </MenuItem>
          ) : (
            <MenuSeparator key={idx} />
          ),
        )}
      </MenuContent>
    </Menu>
  );
}
