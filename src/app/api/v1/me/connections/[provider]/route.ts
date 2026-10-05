import { route, noContent } from "@/server/http/api";
import { unlinkAccount } from "@/server/services/auth";

export const DELETE = route<{ provider: string }>({ auth: "required" }, async ({ user, params }) => {
  await unlinkAccount(user.id, params.provider);
  return noContent();
});
