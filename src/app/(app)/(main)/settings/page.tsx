import { requireUser } from "@/server/auth/current";
import { Panel } from "@/components/ui/misc";
import { ResourceForm } from "@/components/forms/resource-form";
import { Avatar } from "@/components/ui/avatar";

export const metadata = { title: "Profile" };

const ZONES = ["UTC", "America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York", "America/Sao_Paulo", "Europe/London", "Europe/Berlin", "Europe/Paris", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo", "Asia/Shanghai", "Australia/Sydney"];

export default async function ProfilePage() {
  const user = await requireUser();
  return (
    <Panel title="Profile" bodyClassName="p-5">
      <div className="mb-5 flex items-center gap-3">
        <Avatar user={user} size={48} />
        <div>
          <div className="font-medium">{user.displayName}</div>
          <div className="font-mono text-xs text-fg-subtle">@{user.username}</div>
        </div>
      </div>
      {user.isDemo ? <p className="mb-4 rounded-md bg-amber-soft px-3 py-2 text-xs text-amber">This is the shared demo account — profile edits are disabled.</p> : null}
      <ResourceForm
        method="PATCH"
        action="/api/v1/me"
        submitLabel="Save profile"
        layout="grid"
        initial={{
          displayName: user.displayName,
          username: user.username,
          bio: user.bio ?? "",
          company: user.company ?? "",
          location: user.location ?? "",
          website: user.website ?? "",
          timezone: user.timezone,
          avatarUrl: user.avatarUrl ?? "",
        }}
        transform={(p) => ({ ...p, bio: p.bio ?? null, timezone: p.timezone ?? "UTC" })}
        fields={[
          { name: "displayName", label: "Display name", type: "text", required: true },
          { name: "username", label: "Username", type: "text", mono: true, hint: "Used for @mentions" },
          { name: "company", label: "Organization / school", type: "text" },
          { name: "location", label: "Location", type: "text" },
          { name: "website", label: "Website", type: "text", placeholder: "https://" },
          { name: "timezone", label: "Timezone", type: "select", options: [...new Set([user.timezone, ...ZONES])].map((z) => ({ value: z, label: z })) },
          { name: "avatarUrl", label: "Avatar URL", type: "text", placeholder: "https://…", hint: "Leave empty for generated initials", span: 2 },
          { name: "bio", label: "Bio", type: "markdown", rows: 3 },
        ]}
      />
    </Panel>
  );
}
