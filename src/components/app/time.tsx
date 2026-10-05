"use client";

import { useEffect, useState } from "react";
import { relative, timestamp } from "@/lib/dates";

/** Relative time that stays fresh and shows the exact timestamp on hover. */
export function Time({ date, className }: { date: Date | string; className?: string }) {
  const d = typeof date === "string" ? new Date(date) : date;
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  return (
    <time dateTime={d.toISOString()} title={timestamp(d)} className={className} suppressHydrationWarning>
      {relative(d)}
    </time>
  );
}
