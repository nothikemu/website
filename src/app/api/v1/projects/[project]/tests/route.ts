import { z } from "zod";
import { route, created } from "@/server/http/api";
import { createTestSchema } from "@/lib/validation";
import { createTest, listTests } from "@/server/services/tests";

type P = { project: string };

export const GET = route<P>({ auth: "required" }, async (ctx) => {
  const { access: _a, ...rest } = await listTests(ctx.user, ctx.params.project, ctx.query(z.object({ status: z.string().max(20).optional(), q: z.string().max(100).optional() })));
  return rest;
});

export const POST = route<P>({ auth: "required" }, async (ctx) => created(await createTest(ctx.user, ctx.params.project, await ctx.body(createTestSchema))));
