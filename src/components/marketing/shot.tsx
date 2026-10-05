import Image from "next/image";
import { cn } from "@/lib/utils";

/** Real product screenshot in a minimal window frame. */
export function Shot({ src, alt, className, priority, url }: { src: string; alt: string; className?: string; priority?: boolean; url?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-lg border border-border-strong bg-surface shadow-[0_30px_80px_-30px_rgb(0_0_0/0.6)]", className)}>
      <div className="flex h-7 items-center gap-1.5 border-b border-border bg-bg-subtle px-3">
        <span className="size-2 rounded-full bg-surface-3" />
        <span className="size-2 rounded-full bg-surface-3" />
        <span className="size-2 rounded-full bg-surface-3" />
        {url ? <span className="ml-3 truncate font-mono text-2xs text-fg-subtle">{url}</span> : null}
      </div>
      <Image src={src} alt={alt} width={2160} height={1350} priority={priority} className="block h-auto w-full" sizes="(max-width: 1200px) 100vw, 1200px" />
    </div>
  );
}
