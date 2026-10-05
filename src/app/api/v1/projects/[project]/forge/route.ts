import { route } from "@/server/http/api";
import { aiAskSchema } from "@/lib/validation";
import { askForge } from "@/server/ai/forge";
import { RATE_RULES } from "@/server/ratelimit";

export const POST = route<{ project: string }>({ auth: "required", rateLimit: RATE_RULES.ai }, async (ctx) => {
  const { question, action } = await ctx.body(aiAskSchema);
  return askForge(ctx.user, ctx.params.project, action, question);
});
