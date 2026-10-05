import { route, noContent } from "@/server/http/api";
import { updateReleaseSchema } from "@/lib/validation";
import { deleteRelease, getRelease, updateRelease } from "@/server/services/releases";

type P = { project: string; tag: string };
export const GET = route<P>({ auth: "required" }, async ({ user, params }) => {
  const { access: _a, ...rest } = await getRelease(user, params.project, decodeURIComponent(params.tag));
  return rest;
});
export const PATCH = route<P>({ auth: "required" }, async (ctx) => updateRelease(ctx.user, ctx.params.project, decodeURIComponent(ctx.params.tag), await ctx.body(updateReleaseSchema)));
export const DELETE = route<P>({ auth: "required" }, async ({ user, params }) => {
  await deleteRelease(user, params.project, decodeURIComponent(params.tag));
  return noContent();
});
