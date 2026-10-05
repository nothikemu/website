import { route, jsonWithCookies, readCookie } from "@/server/http/api";
import { clearedSessionCookie, invalidateSession, SESSION_COOKIE } from "@/server/auth/session";
import { audit } from "@/server/services/audit";

export const POST = route({ auth: "optional", rateLimit: false }, async (ctx) => {
  const token = readCookie(ctx.req, SESSION_COOKIE);
  if (token) await invalidateSession(token);
  if (ctx.user) await audit("user.logout", { actorId: ctx.user.id });
  return jsonWithCookies({ ok: true }, [clearedSessionCookie()]);
});
