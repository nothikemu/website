import { route, created } from "@/server/http/api";
import { createMilestoneSchema } from "@/lib/validation";
import { createMilestone, listMilestones } from "@/server/services/milestones";

type P = { project: string };
export const GET = route<P>({ auth: "required" }, async ({ user, params }) => (await listMilestones(user, params.project)).milestones);
export const POST = route<P>({ auth: "required" }, async (ctx) => created(await createMilestone(ctx.user, ctx.params.project, await ctx.body(createMilestoneSchema))));
