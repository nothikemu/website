import { z } from "zod";
import { route, created } from "@/server/http/api";
import { addChannel } from "@/server/services/integrations";

export const POST = route<{ project: string }>({ auth: "required" }, async (ctx) => {
  const input = await ctx.body(z.object({ provider: z.enum(["discord", "slack"]), webhookUrl: z.string().trim().url().max(500), events: z.array(z.string().max(60)).max(30).optional() }));
  return created(await addChannel(ctx.user, ctx.params.project, input));
});
