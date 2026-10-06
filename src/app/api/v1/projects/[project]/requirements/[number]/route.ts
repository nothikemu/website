import { route, intParam, noContent } from "@/server/http/api";
import { updateRequirementSchema } from "@/lib/validation";
import { deleteRequirement, getRequirement, updateRequirement } from "@/server/services/requirements";

type P = { project: string; number: string };

export const GET = route<P>({ auth: "required" }, async ({ user, params }) => {
  const { access: _a, ...rest } = await getRequirement(user, params.project, intParam(params.number, "Requirement"));
  return rest;
});

export const PATCH = route<P>({ auth: "required" }, async (ctx) =>
  updateRequirement(ctx.user, ctx.params.project, intParam(ctx.params.number, "Requirement"), await ctx.body(updateRequirementSchema)),
);

export const DELETE = route<P>({ auth: "required" }, async ({ user, params }) => {
  await deleteRequirement(user, params.project, intParam(params.number, "Requirement"));
  return noContent();
});
