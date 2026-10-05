import { route, intParam } from "@/server/http/api";
import { restoreSnapshot } from "@/server/services/snapshots";

export const POST = route<{ project: string; number: string }>({ auth: "required" }, async ({ user, params }) => restoreSnapshot(user, params.project, intParam(params.number, "Version")));
