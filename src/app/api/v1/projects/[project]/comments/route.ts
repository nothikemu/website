import { z } from "zod";
import { route, created } from "@/server/http/api";
import { commentTargetSchema, createCommentSchema } from "@/lib/validation";
import { createComment, listComments } from "@/server/services/comments";

type P = { project: string };
export const GET = route<P>({ auth: "required" }, async (ctx) => {
  const q = ctx.query(z.object({ targetType: commentTargetSchema, targetId: z.string().uuid() }));
  return listComments(ctx.user, ctx.params.project, q.targetType, q.targetId);
});
export const POST = route<P>({ auth: "required" }, async (ctx) => created(await createComment(ctx.user, ctx.params.project, await ctx.body(createCommentSchema))));
