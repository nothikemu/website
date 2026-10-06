import { route } from "@/server/http/api";
import { sendVerificationEmail } from "@/server/services/auth";
import { RATE_RULES } from "@/server/ratelimit";
import { BadRequest } from "@/server/http/errors";

export const POST = route({ auth: "required", rateLimit: RATE_RULES.verifyEmail }, async ({ user }) => {
  if (user.emailVerifiedAt) throw BadRequest("Your email is already verified");
  await sendVerificationEmail(user);
  return { ok: true };
});
