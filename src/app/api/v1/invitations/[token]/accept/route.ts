import { route } from "@/server/http/api";
import { acceptInvitation } from "@/server/services/organizations";
import { RATE_RULES } from "@/server/ratelimit";

export const POST = route<{ token: string }>({ auth: "required", rateLimit: RATE_RULES.invite }, async ({ user, params }) => {
  const org = await acceptInvitation(user, params.token);
  return { organization: org };
});
