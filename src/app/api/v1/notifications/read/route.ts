import { z } from "zod";
import { route } from "@/server/http/api";
import { markRead } from "@/server/services/notifications";

export const POST = route({ auth: "required" }, async (ctx) => {
  const { ids } = await ctx.body(z.object({ ids: z.union([z.literal("all"), z.array(z.string().uuid()).max(200)]) }));
  await markRead(ctx.user.id, ids);
  return { ok: true };
});
