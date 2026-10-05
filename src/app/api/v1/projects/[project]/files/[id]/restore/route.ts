import { route, created } from "@/server/http/api";
import { restoreVersionSchema } from "@/lib/validation";
import { restoreVersion } from "@/server/services/files";

export const POST = route<{ project: string; id: string }>({ auth: "required" }, async (ctx) => {
  const { versionId, message } = await ctx.body(restoreVersionSchema);
  return created(await restoreVersion(ctx.user, ctx.params.project, ctx.params.id, versionId, message));
});
