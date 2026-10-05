import { z } from "zod";
import { route } from "@/server/http/api";
import { listNotifications, unreadCount } from "@/server/services/notifications";

export const GET = route({ auth: "required" }, async (ctx) => {
  const q = ctx.query(z.object({ unread: z.enum(["1", "0"]).optional(), limit: z.coerce.number().int().min(1).max(100).optional() }));
  const [items, unread] = await Promise.all([listNotifications(ctx.user.id, { unreadOnly: q.unread === "1", limit: q.limit }), unreadCount(ctx.user.id)]);
  return { unread, items };
});
