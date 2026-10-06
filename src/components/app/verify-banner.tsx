"use client";

import { useState } from "react";
import { toast } from "sonner";
import { MailWarning } from "lucide-react";
import { api } from "@/lib/api-client";

export function VerifyBanner({ email }: { email: string }) {
  const [sent, setSent] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-amber/30 bg-amber-soft px-5 py-2 text-xs text-amber">
      <MailWarning className="size-3.5" />
      <span>
        Verify <span className="font-medium">{email}</span> to accept invitations and receive email notifications.
      </span>
      <button
        disabled={sent}
        onClick={async () => {
          try {
            await api("POST", "/api/auth/resend-verification");
            setSent(true);
            toast.success("Verification email sent");
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
        className="font-medium underline underline-offset-2 disabled:no-underline disabled:opacity-70"
      >
        {sent ? "Sent" : "Resend link"}
      </button>
    </div>
  );
}
