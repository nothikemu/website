import { route } from "@/server/http/api";
import { listDeletedFiles } from "@/server/services/files";

export const GET = route<{ project: string }>({ auth: "required" }, async ({ user, params }) => listDeletedFiles(user, params.project));
