import { z } from "zod";
import { route } from "@/server/http/api";
import { orgActivity } from "@/server/services/activity";

export const GET = route<{ org: string }>({ auth: "required" }, async (ctx) => {
  const q = ctx.query(z.object({ cursor: z.string().max(64).optional(), limit: z.coerce.number().int().min(1).max(100).optional() }));
  return orgActivity(ctx.user, ctx.params.org, q);
});
