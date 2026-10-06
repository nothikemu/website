import { route } from "@/server/http/api";
import { reactionSchema } from "@/lib/validation";
import { toggleReaction } from "@/server/services/comments";

export const POST = route<{ project: string; id: string }>({ auth: "required" }, async (ctx) => {
  const { emoji } = await ctx.body(reactionSchema);
  return toggleReaction(ctx.user, ctx.params.project, ctx.params.id, emoji);
});
