import { route, noContent } from "@/server/http/api";
import { abortUpload } from "@/server/services/files";

export const DELETE = route<{ project: string; id: string }>({ auth: "required" }, async ({ user, params }) => {
  await abortUpload(user, params.project, params.id);
  return noContent();
});
