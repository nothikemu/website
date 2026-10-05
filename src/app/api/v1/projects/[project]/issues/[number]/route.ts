import { route, intParam, noContent } from "@/server/http/api";
import { updateIssueSchema } from "@/lib/validation";
import { deleteIssue, getIssue, updateIssue } from "@/server/services/issues";

type P = { project: string; number: string };

export const GET = route<P>({ auth: "required" }, async ({ user, params }) => {
  const { access: _a, ...rest } = await getIssue(user, params.project, intParam(params.number, "Issue"));
  return rest;
});

export const PATCH = route<P>({ auth: "required" }, async (ctx) =>
  updateIssue(ctx.user, ctx.params.project, intParam(ctx.params.number, "Issue"), await ctx.body(updateIssueSchema)),
);

export const DELETE = route<P>({ auth: "required" }, async ({ user, params }) => {
  await deleteIssue(user, params.project, intParam(params.number, "Issue"));
  return noContent();
});
