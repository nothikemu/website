import { route, noContent } from "@/server/http/api";
import { removeProjectMember } from "@/server/services/projects";

export const DELETE = route<{ project: string; userId: string }>({ auth: "required" }, async ({ user, params }) => {
  await removeProjectMember(user, params.project, params.userId);
  return noContent();
});
