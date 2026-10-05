import { z } from "zod";
import { route, created } from "@/server/http/api";
import { createIssueSchema } from "@/lib/validation";
import { createIssue, listIssues } from "@/server/services/issues";

type P = { project: string };

export const GET = route<P>({ auth: "required" }, async (ctx) => {
  const { access: _a, ...rest } = await listIssues(ctx.user, ctx.params.project, ctx.query(z.object({ state: z.enum(["open", "closed", "all"]).optional(), status: z.string().max(20).optional(), assignee: z.string().max(40).optional(), label: z.string().max(40).optional(), milestone: z.string().max(10).optional(), priority: z.string().max(10).optional(), q: z.string().max(100).optional() })));
  return rest;
});

export const POST = route<P>({ auth: "required" }, async (ctx) => created(await createIssue(ctx.user, ctx.params.project, await ctx.body(createIssueSchema))));
