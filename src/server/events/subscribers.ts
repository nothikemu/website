import "server-only";
import { db } from "@/server/db";
import { activities } from "@/server/db/schema";
import { deliver } from "@/server/services/notifications";
import { forwardToIntegrations } from "@/server/integrations/outbound";
import { subscribe } from "./bus";

export function registerDefaultSubscribers() {
  subscribe({
    name: "activity-feed",
    async handle(e) {
      if (e.activity === false) return;
      await db.insert(activities).values({
        organizationId: e.organizationId,
        projectId: e.projectId ?? null,
        actorId: e.actorId,
        verb: e.type,
        targetType: e.target?.type ?? null,
        targetId: e.target?.id ?? null,
        targetLabel: e.target?.label ?? null,
        targetTitle: e.target?.title ?? null,
        metadata: e.data ?? {},
      });
    },
  });

  subscribe({
    name: "notifications",
    async handle(e) {
      const seen = new Set<string>();
      for (const n of e.notify ?? []) {
        if (!n.userId || n.userId === e.actorId || seen.has(n.userId)) continue;
        seen.add(n.userId);
        await deliver({
          userId: n.userId,
          type: n.type,
          title: n.title,
          body: n.body,
          url: e.target?.url ?? null,
          actorId: e.actorId,
          projectId: e.projectId ?? null,
          organizationId: e.organizationId,
        });
      }
    },
  });

  subscribe({ name: "integrations-outbound", handle: forwardToIntegrations });
}
