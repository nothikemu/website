import { AuthCard } from "@/components/auth/auth-card";
import { VerifyEmail } from "@/components/auth/forms";

export const metadata = { title: "Verify email" };

// Verification requires an explicit click (POST) so link scanners can't consume the token.
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthCard title="Verify your email">
      {token ? <VerifyEmail token={token} /> : <p className="text-sm text-fg-muted">This link is missing its token.</p>}
    </AuthCard>
  );
}
