import { z } from "zod";
import { route } from "@/server/http/api";
import { verifyEmail } from "@/server/services/auth";
import { RATE_RULES } from "@/server/ratelimit";

export const POST = route({ auth: "optional", rateLimit: RATE_RULES.verifyEmail }, async (ctx) => {
  const { token } = await ctx.body(z.object({ token: z.string().min(10).max(200) }));
  await verifyEmail(token);
  return { ok: true };
});
