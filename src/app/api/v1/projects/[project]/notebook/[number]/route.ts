import { route, intParam, noContent } from "@/server/http/api";
import { updateNotebookSchema } from "@/lib/validation";
import { deleteEntry, getEntry, updateEntry } from "@/server/services/notebook";

type P = { project: string; number: string };

export const GET = route<P>({ auth: "required" }, async ({ user, params }) => {
  const { access: _a, ...rest } = await getEntry(user, params.project, intParam(params.number, "Notebook entry"));
  return rest;
});

export const PATCH = route<P>({ auth: "required" }, async (ctx) =>
  updateEntry(ctx.user, ctx.params.project, intParam(ctx.params.number, "Notebook entry"), await ctx.body(updateNotebookSchema)),
);

export const DELETE = route<P>({ auth: "required" }, async ({ user, params }) => {
  await deleteEntry(user, params.project, intParam(params.number, "Notebook entry"));
  return noContent();
});
