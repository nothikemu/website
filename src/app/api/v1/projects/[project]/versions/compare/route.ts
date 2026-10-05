import { z } from "zod";
import { route } from "@/server/http/api";
import { compareSnapshots } from "@/server/services/snapshots";

export const GET = route<{ project: string }>({ auth: "required" }, async (ctx) => {
  const q = ctx.query(z.object({ a: z.coerce.number().int().positive(), b: z.coerce.number().int().positive() }));
  return compareSnapshots(ctx.user, ctx.params.project, q.a, q.b);
});
