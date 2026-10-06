import { route, readCookie } from "@/server/http/api";
import { changePasswordSchema } from "@/lib/validation";
import { changePassword } from "@/server/services/auth";
import { SESSION_COOKIE } from "@/server/auth/session";
import { RATE_RULES } from "@/server/ratelimit";

export const POST = route({ auth: "required", rateLimit: RATE_RULES.passwordReset }, async (ctx) => {
  const { currentPassword, newPassword } = await ctx.body(changePasswordSchema);
  await changePassword(ctx.user.id, currentPassword, newPassword, readCookie(ctx.req, SESSION_COOKIE));
  return { ok: true };
});
