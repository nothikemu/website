import { cn, initials } from "@/lib/utils";

const PALETTE = ["#d9822b", "#3fb68b", "#4c8bf5", "#a371f7", "#d4b106", "#2bb3c0", "#e5484d", "#8a8f98"];

function hue(seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

export function Avatar({
  user,
  size = 20,
  className,
}: {
  user: { displayName: string; username?: string; avatarUrl?: string | null } | null | undefined;
  size?: number;
  className?: string;
}) {
  if (!user) {
    return (
      <span
        className={cn("inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-border-strong", className)}
        style={{ width: size, height: size }}
        aria-label="Unassigned"
      />
    );
  }
  if (user.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={user.avatarUrl} alt="" width={size} height={size} className={cn("shrink-0 rounded-full object-cover", className)} style={{ width: size, height: size }} />;
  }
  const color = hue(user.username ?? user.displayName);
  return (
    <span
      title={user.displayName}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none", className)}
      style={{ width: size, height: size, background: color, fontSize: Math.max(8, size * 0.42) }}
    >
      {initials(user.displayName)}
    </span>
  );
}

export function AvatarStack({ users, max = 4, size = 20 }: { users: { id: string; displayName: string; username?: string; avatarUrl?: string | null }[]; max?: number; size?: number }) {
  const shown = users.slice(0, max);
  return (
    <span className="flex items-center -space-x-1.5">
      {shown.map((u) => (
        <Avatar key={u.id} user={u} size={size} className="ring-2 ring-surface" />
      ))}
      {users.length > max ? <span className="pl-2.5 text-xs text-fg-subtle">+{users.length - max}</span> : null}
    </span>
  );
}
