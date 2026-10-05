import { route, intParam, noContent } from "@/server/http/api";
import { updateTestSchema } from "@/lib/validation";
import { deleteTest, getTest, updateTest } from "@/server/services/tests";

type P = { project: string; number: string };

export const GET = route<P>({ auth: "required" }, async ({ user, params }) => {
  const { access: _a, ...rest } = await getTest(user, params.project, intParam(params.number, "Test"));
  return rest;
});

export const PATCH = route<P>({ auth: "required" }, async (ctx) =>
  updateTest(ctx.user, ctx.params.project, intParam(ctx.params.number, "Test"), await ctx.body(updateTestSchema)),
);

export const DELETE = route<P>({ auth: "required" }, async ({ user, params }) => {
  await deleteTest(user, params.project, intParam(params.number, "Test"));
  return noContent();
});
