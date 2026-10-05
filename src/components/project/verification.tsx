import { Badge } from "@/components/ui/badge";
import { VERIFICATION } from "@/lib/status";
import { cn } from "@/lib/utils";

export function VerificationBadge({ value }: { value: string }) {
  const m = VERIFICATION[value] ?? VERIFICATION.untested!;
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

const DOT: Record<string, string> = { passed: "bg-green", failed: "bg-red", running: "bg-blue", blocked: "bg-amber", planned: "bg-fg-subtle" };
export function TestDots({ tests }: { tests: { ref: string; status: string; name: string }[] }) {
  return (
    <span className="flex items-center gap-1">
      {tests.map((t) => (
        <span key={t.ref} title={`${t.ref} ${t.name} — ${t.status}`} className={cn("size-2 rounded-[2px]", DOT[t.status] ?? "bg-fg-subtle")} />
      ))}
    </span>
  );
}
