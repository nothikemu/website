import { route, jsonWithCookies, publicUser } from "@/server/http/api";
import { deleteAccountSchema, profileSchema } from "@/lib/validation";
import { deleteAccount, updateProfile } from "@/server/services/auth";
import { clearedSessionCookie } from "@/server/auth/session";
import { BadRequest } from "@/server/http/errors";

export const GET = route({ auth: "required" }, async ({ user }) => ({ user: publicUser(user) }));

export const PATCH = route({ auth: "required" }, async (ctx) => {
  if (ctx.user.isDemo) throw BadRequest("The demo profile is read-only");
  const input = await ctx.body(profileSchema);
  return { user: publicUser(await updateProfile(ctx.user.id, input)) };
});

export const DELETE = route({ auth: "required" }, async (ctx) => {
  const input = await ctx.body(deleteAccountSchema);
  await deleteAccount(ctx.user.id, input);
  return jsonWithCookies({ ok: true }, [clearedSessionCookie()]);
});
