import { route, noContent } from "@/server/http/api";
import { updateCommentSchema } from "@/lib/validation";
import { deleteComment, updateComment } from "@/server/services/comments";

type P = { project: string; id: string };
export const PATCH = route<P>({ auth: "required" }, async (ctx) => {
  const { body } = await ctx.body(updateCommentSchema);
  return updateComment(ctx.user, ctx.params.project, ctx.params.id, body);
});
export const DELETE = route<P>({ auth: "required" }, async ({ user, params }) => {
  await deleteComment(user, params.project, params.id);
  return noContent();
});
