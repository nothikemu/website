import { route, noContent } from "@/server/http/api";
import { updateFileSchema } from "@/lib/validation";
import { deleteFile, getFileDetail, updateFile } from "@/server/services/files";

type P = { project: string; id: string };
export const GET = route<P>({ auth: "required" }, async ({ user, params }) => {
  const { access: _a, ...rest } = await getFileDetail(user, params.project, params.id);
  return rest;
});
export const PATCH = route<P>({ auth: "required" }, async (ctx) => updateFile(ctx.user, ctx.params.project, ctx.params.id, await ctx.body(updateFileSchema)));
export const DELETE = route<P>({ auth: "required" }, async ({ user, params }) => {
  await deleteFile(user, params.project, params.id);
  return noContent();
});
