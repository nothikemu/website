import { route } from "@/server/http/api";
import { resetPasswordSchema } from "@/lib/validation";
import { resetPassword } from "@/server/services/auth";
import { RATE_RULES } from "@/server/ratelimit";

export const POST = route({ auth: "optional", rateLimit: RATE_RULES.passwordReset }, async (ctx) => {
  const { token, password } = await ctx.body(resetPasswordSchema);
  await resetPassword(token, password);
  return { ok: true };
});
