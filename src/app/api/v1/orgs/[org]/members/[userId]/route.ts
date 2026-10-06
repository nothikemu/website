import { route, noContent } from "@/server/http/api";
import { updateMemberSchema } from "@/lib/validation";
import { removeMember, updateMemberRole } from "@/server/services/organizations";

type P = { org: string; userId: string };
export const PATCH = route<P>({ auth: "required" }, async (ctx) => {
  const { role } = await ctx.body(updateMemberSchema);
  await updateMemberRole(ctx.user, ctx.params.org, ctx.params.userId, role);
  return { ok: true };
});
export const DELETE = route<P>({ auth: "required" }, async ({ user, params }) => {
  await removeMember(user, params.org, params.userId);
  return noContent();
});
