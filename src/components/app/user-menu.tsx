"use client";

import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Bell, KeyRound, LogOut, Monitor, Moon, Settings, Sun, User } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { api } from "@/lib/api-client";

export function UserMenu({ user }: { user: { displayName: string; username: string; email: string; avatarUrl: string | null } }) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  async function logout() {
    await api("POST", "/api/auth/logout").catch(() => {});
    router.push("/login");
    router.refresh();
  }
  return (
    <Menu>
      <MenuTrigger asChild>
        <button className="flex h-9 w-full items-center gap-2 rounded-md px-2 text-left hover:bg-surface-2 data-[state=open]:bg-surface-2">
          <Avatar user={user} size={22} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{user.displayName}</span>
          </span>
        </button>
      </MenuTrigger>
      <MenuContent align="start" className="w-60">
        <MenuLabel>
          <span className="block truncate font-mono normal-case tracking-normal">{user.email}</span>
        </MenuLabel>
        <MenuItem onSelect={() => router.push("/settings")}>
          <User /> Profile
        </MenuItem>
        <MenuItem onSelect={() => router.push("/settings/account")}>
          <Settings /> Account & security
        </MenuItem>
        <MenuItem onSelect={() => router.push("/settings/notifications")}>
          <Bell /> Notification settings
        </MenuItem>
        <MenuItem onSelect={() => router.push("/settings/tokens")}>
          <KeyRound /> API tokens
        </MenuItem>
        <MenuSeparator />
        <MenuLabel>Theme</MenuLabel>
        <div className="grid grid-cols-3 gap-1 px-1 pb-1">
          {[
            { v: "light", icon: <Sun className="size-3.5" />, l: "Light" },
            { v: "dark", icon: <Moon className="size-3.5" />, l: "Dark" },
            { v: "system", icon: <Monitor className="size-3.5" />, l: "Auto" },
          ].map((t) => (
            <button
              key={t.v}
              onClick={() => setTheme(t.v)}
              className={`flex h-7 items-center justify-center gap-1 rounded-sm border text-xs ${theme === t.v ? "border-border-strong bg-surface-2 text-fg" : "border-transparent text-fg-muted hover:bg-surface-2"}`}
            >
              {t.icon}
              {t.l}
            </button>
          ))}
        </div>
        <MenuSeparator />
        <MenuItem onSelect={logout}>
          <LogOut /> Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
