import { route, created, intParam } from "@/server/http/api";
import { createTestRunSchema } from "@/lib/validation";
import { recordRun } from "@/server/services/tests";

export const POST = route<{ project: string; number: string }>({ auth: "required" }, async (ctx) =>
  created(await recordRun(ctx.user, ctx.params.project, intParam(ctx.params.number, "Test"), await ctx.body(createTestRunSchema))),
);
