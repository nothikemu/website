import { z } from "zod";
import { route, created } from "@/server/http/api";
import { createTaskSchema } from "@/lib/validation";
import { createTask, listTasks } from "@/server/services/tasks";

type P = { project: string };

export const GET = route<P>({ auth: "required" }, async (ctx) => {
  const { access: _a, ...rest } = await listTasks(ctx.user, ctx.params.project, ctx.query(z.object({ assignee: z.string().max(40).optional(), milestone: z.string().max(10).optional(), q: z.string().max(100).optional() })));
  return rest;
});

export const POST = route<P>({ auth: "required" }, async (ctx) => created(await createTask(ctx.user, ctx.params.project, await ctx.body(createTaskSchema))));
