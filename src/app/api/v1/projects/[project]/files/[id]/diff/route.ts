import { z } from "zod";
import { route } from "@/server/http/api";
import { diffVersions } from "@/server/services/files";

export const GET = route<{ project: string; id: string }>({ auth: "required" }, async (ctx) => {
  const q = ctx.query(z.object({ a: z.string().uuid(), b: z.string().uuid() }));
  return diffVersions(ctx.user, ctx.params.project, ctx.params.id, q.a, q.b);
});
