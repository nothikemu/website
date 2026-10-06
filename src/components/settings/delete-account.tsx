"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";

export function DeleteAccount({ username, hasPassword }: { username: string; hasPassword: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <div className="grid max-w-md gap-3">
      <p className="text-xs text-fg-muted">
        Your engineering history (issues, test runs, notebook entries) stays with your teams, attributed to a deleted user. Organizations where you are the only member are deleted. If you own an organization with other members, transfer ownership first.
      </p>
      <Field label={`Type your username (${username}) to confirm`}>
        <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} className="font-mono" />
      </Field>
      {hasPassword ? (
        <Field label="Password">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
      ) : null}
      <div>
        <Button
          variant="danger"
          disabled={confirm !== username}
          loading={loading}
          onClick={async () => {
            setLoading(true);
            try {
              await api("DELETE", "/api/v1/me", { confirm, password: password || undefined });
              toast.success("Account deleted");
              router.push("/");
              router.refresh();
            } catch (e) {
              toast.error((e as Error).message);
              setLoading(false);
            }
          }}
        >
          Delete my account
        </Button>
      </div>
    </div>
  );
}
