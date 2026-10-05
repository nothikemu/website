import { Box, Cpu, FileCode2, FileText, FileSpreadsheet, Image as ImageIcon, Film, Waypoints, Archive, File, PencilRuler, Folder } from "lucide-react";
import { cn } from "@/lib/utils";

const MAP: Record<string, { icon: typeof File; cls: string }> = {
  cad: { icon: Box, cls: "text-accent" },
  drawing: { icon: PencilRuler, cls: "text-amber" },
  electronics: { icon: Cpu, cls: "text-green" },
  code: { icon: FileCode2, cls: "text-blue" },
  document: { icon: FileText, cls: "text-fg-muted" },
  data: { icon: FileSpreadsheet, cls: "text-green" },
  image: { icon: ImageIcon, cls: "text-violet" },
  video: { icon: Film, cls: "text-violet" },
  simulation: { icon: Waypoints, cls: "text-blue" },
  archive: { icon: Archive, cls: "text-fg-muted" },
  other: { icon: File, cls: "text-fg-subtle" },
};

export function FileIcon({ kind, className }: { name?: string; kind: string; className?: string }) {
  const m = MAP[kind] ?? MAP.other!;
  const I = m.icon;
  return <I className={cn("size-4 shrink-0", m.cls, className)} strokeWidth={1.8} />;
}

export function FolderIcon({ className }: { className?: string }) {
  return <Folder className={cn("size-4 shrink-0 fill-fg-subtle/20 text-fg-subtle", className)} strokeWidth={1.8} />;
}
