import { z } from "zod";
import { route, created } from "@/server/http/api";
import { createRequirementSchema } from "@/lib/validation";
import { createRequirement, listRequirements } from "@/server/services/requirements";

type P = { project: string };

export const GET = route<P>({ auth: "required" }, async (ctx) => {
  const { access: _a, ...rest } = await listRequirements(ctx.user, ctx.params.project, ctx.query(z.object({ status: z.string().max(20).optional(), q: z.string().max(100).optional() })));
  return rest;
});

export const POST = route<P>({ auth: "required" }, async (ctx) => created(await createRequirement(ctx.user, ctx.params.project, await ctx.body(createRequirementSchema))));
