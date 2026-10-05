import { z } from "zod";
import { route, created } from "@/server/http/api";
import { createDecisionSchema } from "@/lib/validation";
import { createDecision, listDecisions } from "@/server/services/decisions";

type P = { project: string };

export const GET = route<P>({ auth: "required" }, async (ctx) => {
  const { access: _a, ...rest } = await listDecisions(ctx.user, ctx.params.project, ctx.query(z.object({ status: z.string().max(20).optional(), q: z.string().max(100).optional() })));
  return rest;
});

export const POST = route<P>({ auth: "required" }, async (ctx) => created(await createDecision(ctx.user, ctx.params.project, await ctx.body(createDecisionSchema))));
