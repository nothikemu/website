import { cn } from "@/lib/utils";

/**
 * Forgebase mark: a machined bracket — a solid base plate with an offset
 * upright, the simplest structural part on any robot.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={cn("size-5", className)} aria-hidden>
      <rect x="2" y="13" width="16" height="5" rx="1" fill="currentColor" />
      <rect x="2" y="2" width="5" height="9.5" rx="1" fill="currentColor" />
      <rect x="9" y="7.5" width="5" height="4" rx="1" fill="var(--accent)" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-fg", className)}>
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-[-0.02em]">forgebase</span>
    </span>
  );
}
