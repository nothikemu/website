import { route, noContent } from "@/server/http/api";
import { deleteLink } from "@/server/services/links";

export const DELETE = route<{ project: string; id: string }>({ auth: "required" }, async ({ user, params }) => {
  await deleteLink(user, params.project, params.id);
  return noContent();
});
