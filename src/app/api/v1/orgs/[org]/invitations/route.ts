import { route, created } from "@/server/http/api";
import { inviteSchema } from "@/lib/validation";
import { createInvitations, listInvitations } from "@/server/services/organizations";
import { RATE_RULES } from "@/server/ratelimit";

type P = { org: string };
export const GET = route<P>({ auth: "required" }, async ({ user, params }) => listInvitations(user, params.org));
export const POST = route<P>({ auth: "required", rateLimit: RATE_RULES.invite }, async (ctx) => {
  const { emails, role } = await ctx.body(inviteSchema);
  return created(await createInvitations(ctx.user, ctx.params.org, emails, role));
});
