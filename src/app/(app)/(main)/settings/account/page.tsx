import { requireUser } from "@/server/auth/current";
import { Panel } from "@/components/ui/misc";
import { ResourceForm } from "@/components/forms/resource-form";
import { DeleteAccount } from "@/components/settings/delete-account";

export const metadata = { title: "Account & security" };

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <div className="flex flex-col gap-5">
      <Panel title="Email" bodyClassName="p-5 text-sm">
        <span className="font-mono">{user.email}</span>{" "}
        <span className={user.emailVerifiedAt ? "text-green" : "text-amber"}>{user.emailVerifiedAt ? "· verified" : "· not verified"}</span>
      </Panel>
      <Panel title={user.passwordHash ? "Change password" : "Set a password"} bodyClassName="p-5">
        <p className="mb-4 text-xs text-fg-muted">Changing your password signs out every other session.</p>
        <ResourceForm
          method="POST"
          action="/api/v1/me/password"
          submitLabel={user.passwordHash ? "Update password" : "Set password"}
          redirectTo="/settings/account"
          fields={[
            ...(user.passwordHash ? [{ name: "currentPassword", label: "Current password", type: "text" as const, inputType: "password" }] : []),
            { name: "newPassword", label: "New password", type: "text", inputType: "password", hint: "10+ characters, mixing letters with numbers or symbols" },
          ]}
          transform={(p) => ({ currentPassword: p.currentPassword ?? undefined, newPassword: p.newPassword })}
        />
      </Panel>
      <Panel title="Delete account" className="border-red/40" bodyClassName="p-5">
        <DeleteAccount username={user.username} hasPassword={Boolean(user.passwordHash)} />
      </Panel>
    </div>
  );
}
