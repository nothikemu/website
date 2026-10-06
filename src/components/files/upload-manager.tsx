"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, CircleAlert, Upload, X } from "lucide-react";
import { api } from "@/lib/api-client";
import { formatBytes } from "@/lib/plans";
import { cn } from "@/lib/utils";

type Job = { id: string; name: string; size: number; progress: number; status: "uploading" | "processing" | "done" | "error" | "unchanged"; error?: string; revision?: boolean };

type StartResponse =
  | { uploadId: string; mode: "single"; url: string; headers: Record<string, string>; isRevision: boolean }
  | { uploadId: string; mode: "multipart"; partSize: number; parts: { partNumber: number; url: string }[]; isRevision: boolean };

function put(url: string, body: Blob, headers: Record<string, string>, onProgress: (loaded: number) => void): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve(xhr.getResponseHeader("ETag")) : reject(new Error(`Storage rejected the upload (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Network error during upload"));
    xhr.send(body);
  });
}

const Ctx = createContext<{ upload: (files: File[], opts: { folderId: string | null; fileId?: string; message?: string }) => void }>({ upload: () => {} });
export const useUploads = () => useContext(Ctx);

/**
 * Direct-to-storage uploads: the API validates and returns presigned URLs,
 * the browser PUTs bytes straight to S3/R2 (or the local driver), then the API
 * verifies the object and records the revision. Large files go multipart.
 */
export function UploadProvider({ project, children }: { project: string; children: ReactNode }) {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const patch = (id: string, p: Partial<Job>) => setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...p } : j)));

  const uploadOne = useCallback(
    async (file: File, opts: { folderId: string | null; fileId?: string; message?: string }) => {
      const id = crypto.randomUUID();
      setJobs((js) => [...js, { id, name: file.name, size: file.size, progress: 0, status: "uploading" }]);
      try {
        const start = await api<StartResponse>("POST", `/api/v1/projects/${project}/uploads`, {
          fileName: file.name,
          size: file.size,
          contentType: file.type || undefined,
          folderId: opts.folderId,
          fileId: opts.fileId,
          message: opts.message ?? null,
        });
        patch(id, { revision: start.isRevision });
        let parts: { partNumber: number; etag: string }[] | undefined;
        if (start.mode === "single") {
          await put(start.url, file, start.headers, (l) => patch(id, { progress: file.size ? l / file.size : 1 }));
        } else {
          parts = [];
          const loaded = new Map<number, number>();
          for (const p of start.parts) {
            const blob = file.slice((p.partNumber - 1) * start.partSize, p.partNumber * start.partSize);
            const etag = await put(p.url, blob, {}, (l) => {
              loaded.set(p.partNumber, l);
              patch(id, { progress: [...loaded.values()].reduce((a, b) => a + b, 0) / file.size });
            });
            parts.push({ partNumber: p.partNumber, etag: etag ?? "" });
          }
        }
        patch(id, { status: "processing", progress: 1 });
        const done = await api<{ unchanged: boolean }>("POST", `/api/v1/projects/${project}/uploads/${start.uploadId}/complete`, { parts });
        patch(id, { status: done.unchanged ? "unchanged" : "done" });
      } catch (e) {
        patch(id, { status: "error", error: (e as Error).message });
        toast.error(`${file.name}: ${(e as Error).message}`);
      }
    },
    [project],
  );

  const upload = useCallback(
    (files: File[], opts: { folderId: string | null; fileId?: string; message?: string }) => {
      for (const f of files) queue.current = queue.current.then(() => uploadOne(f, opts));
      queue.current = queue.current.then(() => router.refresh());
    },
    [uploadOne, router],
  );

  useEffect(() => {
    if (jobs.length && jobs.every((j) => j.status !== "uploading" && j.status !== "processing")) {
      const t = setTimeout(() => setJobs((js) => js.filter((j) => j.status === "error")), 6000);
      return () => clearTimeout(t);
    }
  }, [jobs]);

  return (
    <Ctx.Provider value={{ upload }}>
      {children}
      {jobs.length ? (
        <div className="fixed right-4 bottom-4 z-40 w-[340px] overflow-hidden rounded-lg border border-border-strong bg-surface shadow-[var(--shadow)] animate-slide-up">
          <div className="flex items-center justify-between border-b border-border px-3 py-2 text-xs font-medium">
            <span className="flex items-center gap-1.5">
              <Upload className="size-3.5" /> Uploads
            </span>
            <button onClick={() => setJobs((js) => js.filter((j) => j.status === "uploading" || j.status === "processing"))} className="text-fg-subtle hover:text-fg" aria-label="Clear">
              <X className="size-3.5" />
            </button>
          </div>
          <ul className="max-h-64 divide-y divide-border overflow-y-auto">
            {jobs.map((j) => (
              <li key={j.id} className="px-3 py-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="min-w-0 flex-1 truncate font-mono">{j.name}</span>
                  {j.status === "done" ? <CheckCircle2 className="size-3.5 text-green" /> : j.status === "error" ? <CircleAlert className="size-3.5 text-red" /> : null}
                  <span className="font-mono text-2xs text-fg-subtle">{formatBytes(j.size)}</span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-3">
                  <div className={cn("h-full transition-[width]", j.status === "error" ? "bg-red" : j.status === "done" || j.status === "unchanged" ? "bg-green" : "bg-accent")} style={{ width: `${Math.round(j.progress * 100)}%` }} />
                </div>
                <div className="mt-1 text-2xs text-fg-subtle">
                  {j.status === "uploading" ? `${Math.round(j.progress * 100)}%` : j.status === "processing" ? "Verifying & extracting metadata…" : j.status === "unchanged" ? "Identical to current revision — skipped" : j.status === "done" ? (j.revision ? "New revision created" : "Uploaded") : j.error}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Ctx.Provider>
  );
}
