import { route } from "@/server/http/api";
import { listIntegrations } from "@/server/services/integrations";

export const GET = route<{ org: string }>({ auth: "required" }, async ({ user, params }) => listIntegrations(user, params.org));
