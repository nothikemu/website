"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FileQuestion } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";

const StlViewer = dynamic(() => import("./stl-viewer").then((m) => m.StlViewer), { ssr: false, loading: () => <div className="flex h-[420px] items-center justify-center"><Spinner /></div> });

function parseCsv(text: string, sep: string) {
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .slice(0, 501)
    .map((l) => l.split(sep).map((c) => c.trim().replace(/^"|"$/g, "")));
}

export function FilePreview({ project, fileId, versionId, kind, name, metadata }: { project: string; fileId: string; versionId: string; kind: string; name: string; metadata: Record<string, unknown> }) {
  const base = `/api/v1/projects/${project}/files/${fileId}`;
  const [text, setText] = useState<{ text: string; truncated: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const textual = kind === "text" || kind === "markdown" || kind === "csv";
  useEffect(() => {
    if (!textual) return;
    setText(null);
    fetch(`${base}/content?version=${versionId}`)
      .then(async (r) => (r.ok ? setText(await r.json()) : setErr((await r.json()).error?.message ?? "Preview failed")))
      .catch(() => setErr("Preview failed"));
  }, [base, versionId, textual]);

  const inline = `${base}/download?inline=1&version=${versionId}`;
  if (kind === "image")
    // eslint-disable-next-line @next/next/no-img-element
    return <div className="bg-grid flex max-h-[560px] items-center justify-center overflow-hidden p-4"><img src={inline} alt={name} className="max-h-[520px] max-w-full rounded-sm object-contain shadow-[var(--shadow)]" /></div>;
  if (kind === "video") return <video src={inline} controls className="max-h-[560px] w-full bg-black" />;
  if (kind === "pdf") return <iframe src={inline} title={name} className="h-[640px] w-full bg-white" />;
  if (kind === "stl") return <StlViewer url={`${base}/download?version=${versionId}`} />;
  if (textual) {
    if (err) return <p className="p-6 text-sm text-red">{err}</p>;
    if (!text) return <div className="flex h-40 items-center justify-center"><Spinner /></div>;
    if (kind === "markdown")
      return (
        <div className="prose-forge max-h-[640px] overflow-auto px-6 py-5">
          <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>{text.text}</ReactMarkdown>
        </div>
      );
    if (kind === "csv") {
      const rows = parseCsv(text.text, name.endsWith(".tsv") ? "\t" : ",");
      return (
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full font-mono text-xs">
            <thead className="sticky top-0 bg-surface-2 text-left">
              <tr>
                <th className="w-10 border-b border-border px-2 py-1 text-fg-subtle">#</th>
                {rows[0]?.map((h, i) => (
                  <th key={i} className="border-b border-border px-2 py-1 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(1).map((r, i) => (
                <tr key={i} className="odd:bg-bg-subtle/50">
                  <td className="px-2 py-0.5 text-fg-subtle">{i + 1}</td>
                  {r.map((c, j) => (
                    <td key={j} className="px-2 py-0.5 tabular">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > 500 ? <p className="p-2 text-xs text-fg-subtle">Showing first 500 rows.</p> : null}
        </div>
      );
    }
    const lines = text.text.split("\n");
    return (
      <div className="max-h-[640px] overflow-auto">
        <pre className="text-xs leading-5">
          {lines.map((l, i) => (
            <div key={i} className="flex hover:bg-surface-2/60">
              <span className="w-12 shrink-0 pr-3 text-right text-fg-subtle select-none">{i + 1}</span>
              <code className="pr-4 whitespace-pre">{l}</code>
            </div>
          ))}
        </pre>
        {text.truncated ? <p className="border-t border-border p-2 text-xs text-fg-subtle">Preview truncated at 2 MB — download for the full file.</p> : null}
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <FileQuestion className="size-8 text-fg-subtle" strokeWidth={1.5} />
      <p className="text-sm font-medium">No in-browser preview for this format</p>
      <p className="max-w-md text-xs text-fg-muted">
        {Object.keys(metadata).length ? "Forgebase extracted the metadata shown below. Revisions are compared by metadata and checksum." : "Download the file to open it in your CAD or EDA tool. Every revision stays available here."}
      </p>
    </div>
  );
}
