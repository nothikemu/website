import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { AcceptInvite } from "@/components/auth/forms";
import { getInvitation } from "@/server/services/organizations";
import { getCurrentUser } from "@/server/auth/current";
import { buttonClass } from "@/components/ui/button";
import { ROLE_LABEL } from "@/lib/status";

export const metadata = { title: "Invitation" };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [invite, user] = await Promise.all([getInvitation(token), getCurrentUser()]);
  if (!invite) {
    return (
      <AuthCard title="Invitation unavailable">
        <p className="text-sm text-fg-muted">This invitation has expired, was revoked, or has already been used. Ask an admin to send a new one.</p>
      </AuthCard>
    );
  }
  const next = `/invite/${token}`;
  return (
    <AuthCard
      title={`Join ${invite.org.name}`}
      subtitle={
        <>
          {invite.inviter ?? "A teammate"} invited <span className="font-mono text-fg">{invite.inv.email}</span> as {ROLE_LABEL[invite.inv.role]}.
        </>
      }
    >
      {user ? (
        user.email === invite.inv.email ? (
          user.emailVerifiedAt ? (
            <AcceptInvite token={token} orgName={invite.org.name} />
          ) : (
            <p className="text-sm text-fg-muted">Verify your email address first — check your inbox, then come back to this link.</p>
          )
        ) : (
          <p className="text-sm text-fg-muted">
            You're signed in as <span className="font-mono text-fg">{user.email}</span>. Sign in with the invited address to accept.
          </p>
        )
      ) : (
        <div className="grid gap-2">
          <Link href={`/signup?next=${encodeURIComponent(next)}`} className={buttonClass("primary", "md", "justify-center")}>
            Create an account
          </Link>
          <Link href={`/login?next=${encodeURIComponent(next)}`} className={buttonClass("secondary", "md", "justify-center")}>
            I already have an account
          </Link>
        </div>
      )}
    </AuthCard>
  );
}
