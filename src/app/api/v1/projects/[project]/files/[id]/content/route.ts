import { z } from "zod";
import { route } from "@/server/http/api";
import { readText } from "@/server/services/files";

export const GET = route<{ project: string; id: string }>({ auth: "required" }, async (ctx) => {
  const q = ctx.query(z.object({ version: z.string().uuid().optional() }));
  return readText(ctx.user, ctx.params.project, ctx.params.id, q.version);
});
