import { z } from "zod";
import { route } from "@/server/http/api";
import { listDirectory } from "@/server/services/files";

export const GET = route<{ project: string }>({ auth: "required" }, async (ctx) => {
  const { folder } = ctx.query(z.object({ folder: z.string().uuid().optional() }));
  const { access: _a, ...rest } = await listDirectory(ctx.user, ctx.params.project, folder ?? null);
  return rest;
});
