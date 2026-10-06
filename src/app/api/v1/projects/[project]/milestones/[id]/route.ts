import { route, noContent } from "@/server/http/api";
import { updateMilestoneSchema } from "@/lib/validation";
import { deleteMilestone, updateMilestone } from "@/server/services/milestones";

type P = { project: string; id: string };
export const PATCH = route<P>({ auth: "required" }, async (ctx) => updateMilestone(ctx.user, ctx.params.project, ctx.params.id, await ctx.body(updateMilestoneSchema)));
export const DELETE = route<P>({ auth: "required" }, async ({ user, params }) => {
  await deleteMilestone(user, params.project, params.id);
  return noContent();
});
