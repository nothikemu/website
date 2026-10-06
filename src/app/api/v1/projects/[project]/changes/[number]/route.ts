import { route, intParam, noContent } from "@/server/http/api";
import { updateChangeSchema } from "@/lib/validation";
import { deleteChange, getChange, updateChange } from "@/server/services/changes";

type P = { project: string; number: string };

export const GET = route<P>({ auth: "required" }, async ({ user, params }) => {
  const { access: _a, ...rest } = await getChange(user, params.project, intParam(params.number, "Change"));
  return rest;
});

export const PATCH = route<P>({ auth: "required" }, async (ctx) =>
  updateChange(ctx.user, ctx.params.project, intParam(ctx.params.number, "Change"), await ctx.body(updateChangeSchema)),
);

export const DELETE = route<P>({ auth: "required" }, async ({ user, params }) => {
  await deleteChange(user, params.project, intParam(params.number, "Change"));
  return noContent();
});
