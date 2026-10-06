import { route } from "@/server/http/api";
import { listLabels } from "@/server/services/labels";

export const GET = route<{ project: string }>({ auth: "required" }, async ({ user, params }) => listLabels(user, params.project));
