import { route } from "@/server/http/api";
import { traceabilityMatrix } from "@/server/services/requirements";

export const GET = route<{ project: string }>({ auth: "required" }, async ({ user, params }) => (await traceabilityMatrix(user, params.project)).rows);
