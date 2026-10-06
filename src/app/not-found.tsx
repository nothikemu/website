import Link from "next/link";
import { LogoMark } from "@/components/app/logo";
import { buttonClass } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="bg-grid flex min-h-[70dvh] flex-col items-center justify-center px-6 text-center">
      <LogoMark className="size-7 text-fg-subtle" />
      <p className="mt-4 font-mono text-xs text-fg-subtle">404</p>
      <h1 className="mt-1 text-lg font-semibold">Nothing here</h1>
      <p className="mt-1 max-w-sm text-sm text-fg-muted">The page doesn&apos;t exist, or you don&apos;t have access to it.</p>
      <Link href="/dashboard" className={buttonClass("secondary", "sm", "mt-5")}>
        Back to dashboard
      </Link>
    </div>
  );
}
