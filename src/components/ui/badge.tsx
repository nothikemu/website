import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type Tone = "neutral" | "green" | "red" | "amber" | "blue" | "violet" | "accent";

const tones: Record<Tone, string> = {
  neutral: "bg-surface-2 text-fg-muted border-border",
  green: "bg-green-soft text-green border-transparent",
  red: "bg-red-soft text-red border-transparent",
  amber: "bg-amber-soft text-amber border-transparent",
  blue: "bg-blue-soft text-blue border-transparent",
  violet: "bg-violet-soft text-violet border-transparent",
  accent: "bg-accent-soft text-accent border-transparent",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-5 shrink-0 items-center gap-1 rounded-sm border px-1.5 text-2xs font-medium whitespace-nowrap", tones[tone], className)}>
      {children}
    </span>
  );
}

const dot: Record<Tone, string> = {
  neutral: "bg-fg-subtle",
  green: "bg-green",
  red: "bg-red",
  amber: "bg-amber",
  blue: "bg-blue",
  violet: "bg-violet",
  accent: "bg-accent",
};

export function Dot({ tone = "neutral", className }: { tone?: Tone; className?: string }) {
  return <span className={cn("inline-block size-1.5 shrink-0 rounded-full", dot[tone], className)} />;
}

export function LabelChip({ name, color }: { name: string; color: string }) {
  return (
    <span className="inline-flex h-5 items-center gap-1.5 rounded-full border border-border px-2 text-2xs text-fg-muted">
      <span className="size-1.5 rounded-full" style={{ background: color }} />
      {name}
    </span>
  );
}
