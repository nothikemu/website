import { Skeleton } from "@/components/ui/misc";

export default function Loading() {
  return (
    <div>
      <div className="hidden h-12 border-b border-border md:block" />
      <div className="mx-auto max-w-[1160px] px-6 py-6">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
        <div className="mt-6 grid gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
