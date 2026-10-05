"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <TooltipProvider delayDuration={300}>
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            className: "!bg-surface !text-fg !border !border-border-strong !shadow-[var(--shadow)] !rounded-md !text-sm !font-sans",
          }}
        />
      </TooltipProvider>
    </ThemeProvider>
  );
}
