"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

/** Safe error boundary: shows a reference, never internals. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="flex min-h-[60dvh] flex-col items-center justify-center px-6 text-center">
      <p className="font-mono text-xs text-fg-subtle">500</p>
      <h1 className="mt-1 text-lg font-semibold">Something went wrong</h1>
      <p className="mt-1 max-w-sm text-sm text-fg-muted">The error was logged. Try again, and if it keeps happening, share this reference with your admin.</p>
      {error.digest ? <code className="mt-3 rounded-sm bg-surface-2 px-2 py-1 font-mono text-xs">{error.digest}</code> : null}
      <Button className="mt-5" size="sm" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
