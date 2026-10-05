import { route } from "@/server/http/api";
import { undeleteFile } from "@/server/services/files";

export const POST = route<{ project: string; id: string }>({ auth: "required" }, async ({ user, params }) => undeleteFile(user, params.project, params.id));
