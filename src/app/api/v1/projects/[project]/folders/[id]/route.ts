import { route, noContent } from "@/server/http/api";
import { updateFolderSchema } from "@/lib/validation";
import { deleteFolder, updateFolder } from "@/server/services/files";

type P = { project: string; id: string };
export const PATCH = route<P>({ auth: "required" }, async (ctx) => updateFolder(ctx.user, ctx.params.project, ctx.params.id, await ctx.body(updateFolderSchema)));
export const DELETE = route<P>({ auth: "required" }, async ({ user, params }) => {
  await deleteFolder(user, params.project, params.id);
  return noContent();
});
