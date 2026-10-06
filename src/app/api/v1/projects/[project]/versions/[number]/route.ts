import { route, intParam } from "@/server/http/api";
import { getSnapshot } from "@/server/services/snapshots";

export const GET = route<{ project: string; number: string }>({ auth: "required" }, async ({ user, params }) => {
  const { access: _a, ...rest } = await getSnapshot(user, params.project, intParam(params.number, "Version"));
  return rest;
});
