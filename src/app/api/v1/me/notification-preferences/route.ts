import { route } from "@/server/http/api";
import { notificationPrefsSchema } from "@/lib/validation";
import { getPreferences, updatePreferences } from "@/server/services/notifications";

export const GET = route({ auth: "required" }, async ({ user }) => getPreferences(user.id));
export const PUT = route({ auth: "required" }, async (ctx) => {
  const { preferences } = await ctx.body(notificationPrefsSchema);
  return updatePreferences(ctx.user.id, preferences);
});
