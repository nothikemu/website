import { route, intParam, noContent } from "@/server/http/api";
import { updateTaskSchema } from "@/lib/validation";
import { deleteTask, getTask, updateTask } from "@/server/services/tasks";

type P = { project: string; number: string };

export const GET = route<P>({ auth: "required" }, async ({ user, params }) => {
  const { access: _a, ...rest } = await getTask(user, params.project, intParam(params.number, "Task"));
  return rest;
});

export const PATCH = route<P>({ auth: "required" }, async (ctx) =>
  updateTask(ctx.user, ctx.params.project, intParam(ctx.params.number, "Task"), await ctx.body(updateTaskSchema)),
);

export const DELETE = route<P>({ auth: "required" }, async ({ user, params }) => {
  await deleteTask(user, params.project, intParam(params.number, "Task"));
  return noContent();
});
