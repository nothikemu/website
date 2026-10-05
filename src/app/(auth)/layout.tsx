import Link from "next/link";
import { Logo } from "@/components/app/logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-grid relative flex min-h-dvh flex-col">
      <header className="flex h-14 items-center px-5">
        <Link href="/" aria-label="Forgebase home">
          <Logo />
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-[8vh] pb-16">
        <div className="w-full max-w-[380px]">{children}</div>
      </main>
      <footer className="px-5 py-4 text-center text-2xs text-fg-subtle">
        Forgebase · <Link href="/#security" className="hover:text-fg-muted">Security</Link>
      </footer>
    </div>
  );
}
