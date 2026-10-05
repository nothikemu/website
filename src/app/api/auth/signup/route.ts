import { route, jsonWithCookies, publicUser } from "@/server/http/api";
import { signupSchema } from "@/lib/validation";
import { signup } from "@/server/services/auth";
import { sessionCookie } from "@/server/auth/session";
import { RATE_RULES } from "@/server/ratelimit";

export const POST = route({ auth: "optional", rateLimit: RATE_RULES.signup }, async (ctx) => {
  const input = await ctx.body(signupSchema);
  const { user, session } = await signup(input, { ip: ctx.ip, userAgent: ctx.userAgent });
  return jsonWithCookies({ user: publicUser(user) }, [sessionCookie(session.token, session.expiresAt)], 201);
});
