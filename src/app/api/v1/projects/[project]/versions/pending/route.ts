import { route } from "@/server/http/api";
import { pendingChanges } from "@/server/services/snapshots";

export const GET = route<{ project: string }>({ auth: "required" }, async ({ user, params }) => pendingChanges(user, params.project));
