import { route } from "@/server/http/api";
import { forgotPasswordSchema } from "@/lib/validation";
import { requestPasswordReset } from "@/server/services/auth";
import { RATE_RULES } from "@/server/ratelimit";

export const POST = route({ auth: "optional", rateLimit: RATE_RULES.passwordReset }, async (ctx) => {
  const { email } = await ctx.body(forgotPasswordSchema);
  await requestPasswordReset(email);
  // Identical response whether or not the account exists.
  return { ok: true };
});
