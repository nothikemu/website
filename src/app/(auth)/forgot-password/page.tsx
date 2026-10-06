import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { ForgotForm } from "@/components/auth/forms";

export const metadata = { title: "Reset password" };

export default function ForgotPage() {
  return (
    <AuthCard
      title="Reset your password"
      subtitle="We'll email you a single-use link."
      footer={
        <Link href="/login" className="hover:text-fg">
          ← Back to sign in
        </Link>
      }
    >
      <ForgotForm />
    </AuthCard>
  );
}
