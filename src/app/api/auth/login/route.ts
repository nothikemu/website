import { route, jsonWithCookies, publicUser } from "@/server/http/api";
import { loginSchema } from "@/lib/validation";
import { login } from "@/server/services/auth";
import { sessionCookie } from "@/server/auth/session";
import { enforce, RATE_RULES } from "@/server/ratelimit";

export const POST = route({ auth: "optional", rateLimit: false }, async (ctx) => {
  const input = await ctx.body(loginSchema);
  // Limit per IP and per account to slow credential stuffing and targeted guessing.
  await enforce(`login:ip:${ctx.ip ?? "unknown"}`, { limit: 30, windowSec: 15 * 60 });
  await enforce(`login:acct:${input.email}`, RATE_RULES.login);
  const { user, session } = await login(input.email, input.password, { ip: ctx.ip, userAgent: ctx.userAgent });
  return jsonWithCookies({ user: publicUser(user) }, [sessionCookie(session.token, session.expiresAt)]);
});
