import { z } from "zod";
import { route } from "@/server/http/api";
import { projectActivity } from "@/server/services/activity";

export const GET = route<{ project: string }>({ auth: "required" }, async (ctx) => {
  const q = ctx.query(z.object({ cursor: z.string().max(64).optional(), limit: z.coerce.number().int().min(1).max(100).optional() }));
  return projectActivity(ctx.user, ctx.params.project, q);
});
