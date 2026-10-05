import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthCard, OAuthButtons } from "@/components/auth/auth-card";
import { SignupForm } from "@/components/auth/forms";
import { getCurrentUser } from "@/server/auth/current";
import { oauthEnabled } from "@/server/env";

export const metadata = { title: "Create account" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getCurrentUser()) redirect("/dashboard");
  const providers = oauthEnabled();
  return (
    <AuthCard
      title="Create your account"
      subtitle="Free for small teams. No credit card."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-fg hover:text-accent">
            Sign in
          </Link>
        </>
      }
    >
      <OAuthButtons github={providers.github} google={providers.google} next={next} />
      <SignupForm next={next} />
    </AuthCard>
  );
}
