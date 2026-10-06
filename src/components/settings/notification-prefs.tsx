"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";

type Pref = { type: string; label: string; inApp: boolean; email: boolean };

export function NotificationPrefs({ initial }: { initial: Pref[] }) {
  const [prefs, setPrefs] = useState(initial);
  async function toggle(type: string, key: "inApp" | "email") {
    const next = prefs.map((p) => (p.type === type ? { ...p, [key]: !p[key] } : p));
    setPrefs(next);
    try {
      await api("PUT", "/api/v1/me/notification-preferences", { preferences: next.map(({ type, inApp, email }) => ({ type, inApp, email })) });
    } catch (e) {
      setPrefs(prefs);
      toast.error((e as Error).message);
    }
  }
  return (
    <table className="w-full text-sm">
      <thead className="border-b border-border text-left text-xs text-fg-subtle">
        <tr>
          <th className="px-4 py-2 font-medium">Event</th>
          <th className="w-20 px-4 py-2 text-center font-medium">In app</th>
          <th className="w-20 px-4 py-2 text-center font-medium">Email</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {prefs.map((p) => (
          <tr key={p.type}>
            <td className="px-4 py-2.5">
              {p.label}
              <div className="font-mono text-2xs text-fg-subtle">{p.type}</div>
            </td>
            {(["inApp", "email"] as const).map((k) => (
              <td key={k} className="px-4 py-2.5 text-center">
                <input type="checkbox" checked={p[k]} onChange={() => toggle(p.type, k)} className="size-4 accent-[var(--accent)]" aria-label={`${p.label} ${k}`} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
