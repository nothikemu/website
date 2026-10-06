import { route, noContent } from "@/server/http/api";
import { deleteEndpoint } from "@/server/services/webhooks";

export const DELETE = route<{ project: string; id: string }>({ auth: "required" }, async ({ user, params }) => {
  await deleteEndpoint(user, params.project, params.id);
  return noContent();
});
