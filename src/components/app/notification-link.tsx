"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { api } from "@/lib/api-client";

export function NotificationLink({ id, href, unread, children }: { id: string; href: string; unread: boolean; children: ReactNode }) {
  const router = useRouter();
  return (
    <a
      href={href}
      onClick={async (e) => {
        e.preventDefault();
        if (unread) await api("POST", "/api/v1/notifications/read", { ids: [id] }).catch(() => {});
        router.push(href);
        router.refresh();
      }}
      className="flex items-start gap-3 px-4 py-3 hover:bg-surface-2/60"
    >
      {children}
    </a>
  );
}
