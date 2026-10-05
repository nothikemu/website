import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ResetForm } from "@/components/auth/forms";

export const metadata = { title: "Choose a new password" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthCard title="Choose a new password" subtitle="All other sessions will be signed out." footer={<Link href="/login" className="hover:text-fg">← Back to sign in</Link>}>
      {token ? <ResetForm token={token} /> : <p className="text-sm text-fg-muted">This link is missing its token. Request a new reset email.</p>}
    </AuthCard>
  );
}
