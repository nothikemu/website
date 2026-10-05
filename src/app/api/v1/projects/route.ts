import { z } from "zod";
import { route, created } from "@/server/http/api";
import { createProjectSchema } from "@/lib/validation";
import { createProject, listProjects } from "@/server/services/projects";

export const GET = route({ auth: "required" }, async (ctx) => {
  const q = ctx.query(z.object({ org: z.string().max(64).optional() }));
  return listProjects(ctx.user, q.org);
});
export const POST = route({ auth: "required" }, async (ctx) => created(await createProject(ctx.user, await ctx.body(createProjectSchema))));
