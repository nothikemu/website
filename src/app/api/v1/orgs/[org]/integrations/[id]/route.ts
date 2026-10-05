import { z } from "zod";
import { route, noContent } from "@/server/http/api";
import { removeIntegration, updateIntegration } from "@/server/services/integrations";

type P = { org: string; id: string };
export const PATCH = route<P>({ auth: "required" }, async (ctx) => {
  const input = await ctx.body(z.object({ enabled: z.boolean().optional(), events: z.array(z.string().max(60)).max(30).optional() }));
  return updateIntegration(ctx.user, ctx.params.org, ctx.params.id, input);
});
export const DELETE = route<P>({ auth: "required" }, async ({ user, params }) => {
  await removeIntegration(user, params.org, params.id);
  return noContent();
});
