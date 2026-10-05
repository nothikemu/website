import { route } from "@/server/http/api";
import { projectMemberSchema } from "@/lib/validation";
import { listProjectMembers, setProjectMember } from "@/server/services/projects";

type P = { project: string };
export const GET = route<P>({ auth: "required" }, async ({ user, params }) => listProjectMembers(user, params.project));
export const POST = route<P>({ auth: "required" }, async (ctx) => {
  const { userId, role } = await ctx.body(projectMemberSchema);
  await setProjectMember(ctx.user, ctx.params.project, userId, role);
  return { ok: true };
});
