import { route } from "@/server/http/api";
import { syncCommits } from "@/server/services/integrations";

export const POST = route<{ project: string }>({ auth: "required" }, async ({ user, params }) => syncCommits(user, params.project));
