import { route } from "@/server/http/api";
import { projectIntegrations } from "@/server/services/integrations";

export const GET = route<{ project: string }>({ auth: "required" }, async ({ user, params }) => projectIntegrations(user, params.project));
