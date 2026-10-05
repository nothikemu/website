import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { AuthCard, OAuthButtons } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/forms";
import { getCurrentUser } from "@/server/auth/current";
import { oauthEnabled } from "@/server/env";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";

export const metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  oauth_unavailable: "That sign-in provider isn't configured on this server.",
  oauth_state: "The sign-in session expired. Please try again.",
  oauth_failed: "We couldn't complete sign-in with that provider.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; message?: string }> }) {
  const sp = await searchParams;
  if (await getCurrentUser()) redirect(sp.next?.startsWith("/") ? sp.next : "/dashboard");
  const providers = oauthEnabled();
  const [demo] = await db.select({ id: users.id }).from(users).where(eq(users.email, "demo@forgebase.dev")).limit(1);
  const error = sp.error ? (sp.message ?? ERRORS[sp.error] ?? "Sign-in failed") : null;
  return (
    <AuthCard
      title="Sign in to Forgebase"
      subtitle="Your team's requirements, CAD, firmware and test history — in one place."
      footer={
        <>
          New to Forgebase?{" "}
          <Link href="/signup" className="font-medium text-fg hover:text-accent">
            Create an account
          </Link>
        </>
      }
    >
      {error ? <p className="mb-4 rounded-md border border-red/30 bg-red-soft px-3 py-2 text-xs text-red">{error}</p> : null}
      <OAuthButtons github={providers.github} google={providers.google} next={sp.next} />
      <LoginForm next={sp.next} demo={Boolean(demo)} />
    </AuthCard>
  );
}
