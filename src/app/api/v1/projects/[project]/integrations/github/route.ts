import { z } from "zod";
import { route, created } from "@/server/http/api";
import { connectRepository } from "@/server/services/integrations";

export const POST = route<{ project: string }>({ auth: "required" }, async (ctx) => {
  const { repository } = await ctx.body(z.object({ repository: z.string().trim().max(140).regex(/^[\w.-]+\/[\w.-]+$/, "Use owner/repository") }));
  return created(await connectRepository(ctx.user, ctx.params.project, repository));
});
