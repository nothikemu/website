"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLANS, type PlanId } from "@/lib/plans";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export function PlanPicker({ org, current, canChange }: { org: string; current: PlanId; canChange: boolean }) {
  const router = useRouter();
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {(Object.keys(PLANS) as PlanId[]).map((id) => {
        const p = PLANS[id];
        const active = id === current;
        return (
          <div key={id} className={cn("flex flex-col rounded-lg border bg-surface p-4", active ? "border-accent" : "border-border")}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">{p.name}</h3>
              {active ? <span className="text-2xs font-medium text-accent">CURRENT</span> : null}
            </div>
            <p className="mt-1 font-mono text-xs text-fg-muted">{p.price}</p>
            <ul className="mt-3 flex-1 space-y-1.5 text-xs text-fg-muted">
              {p.highlights.map((h) => (
                <li key={h} className="flex gap-1.5">
                  <Check className="mt-0.5 size-3 shrink-0 text-green" />
                  {h}
                </li>
              ))}
            </ul>
            {canChange && !active && id !== "enterprise" ? (
              <Button
                size="sm"
                variant="outline"
                className="mt-4 justify-center"
                onClick={async () => {
                  try {
                    await api("PATCH", `/api/v1/orgs/${org}/plan`, { plan: id });
                    toast.success(`Switched to ${p.name}`);
                    router.refresh();
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                Switch to {p.name}
              </Button>
            ) : id === "enterprise" && !active ? (
              <a href="mailto:sales@forgebase.dev" className="mt-4 text-center text-xs text-fg-muted hover:text-fg">
                Contact sales →
              </a>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
