import { route, noContent } from "@/server/http/api";
import { revokeInvitation } from "@/server/services/organizations";

export const DELETE = route<{ org: string; id: string }>({ auth: "required" }, async ({ user, params }) => {
  await revokeInvitation(user, params.org, params.id);
  return noContent();
});
