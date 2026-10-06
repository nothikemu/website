import { Bot, Cpu, FlaskConical, Code2, Rocket, Cog, Box } from "lucide-react";
import { cn } from "@/lib/utils";

const MAP: Record<string, { icon: typeof Bot; color: string }> = {
  robotics: { icon: Bot, color: "text-accent" },
  mechanical: { icon: Cog, color: "text-amber" },
  electrical: { icon: Cpu, color: "text-green" },
  software: { icon: Code2, color: "text-blue" },
  aerospace: { icon: Rocket, color: "text-violet" },
  research: { icon: FlaskConical, color: "text-blue" },
  other: { icon: Box, color: "text-fg-muted" },
};

export function ProjectGlyph({ type, small, className }: { type: string; small?: boolean; className?: string }) {
  const m = MAP[type] ?? MAP.other!;
  const Icon = m.icon;
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-[4px] border border-border bg-surface", small ? "size-4" : "size-6", className)}>
      <Icon className={cn(m.color, small ? "!size-2.5" : "size-3.5")} strokeWidth={2.2} />
    </span>
  );
}
