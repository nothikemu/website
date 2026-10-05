import { route, intParam, noContent } from "@/server/http/api";
import { updateDecisionSchema } from "@/lib/validation";
import { deleteDecision, getDecision, updateDecision } from "@/server/services/decisions";

type P = { project: string; number: string };

export const GET = route<P>({ auth: "required" }, async ({ user, params }) => {
  const { access: _a, ...rest } = await getDecision(user, params.project, intParam(params.number, "Decision"));
  return rest;
});

export const PATCH = route<P>({ auth: "required" }, async (ctx) =>
  updateDecision(ctx.user, ctx.params.project, intParam(ctx.params.number, "Decision"), await ctx.body(updateDecisionSchema)),
);

export const DELETE = route<P>({ auth: "required" }, async ({ user, params }) => {
  await deleteDecision(user, params.project, intParam(params.number, "Decision"));
  return noContent();
});
