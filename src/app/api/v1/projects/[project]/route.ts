import { z } from "zod";
import { route, noContent } from "@/server/http/api";
import { updateProjectSchema } from "@/lib/validation";
import { requireProject } from "@/server/authz";
import { deleteProject, updateProject } from "@/server/services/projects";

type P = { project: string };
export const GET = route<P>({ auth: "required" }, async ({ user, params }) => {
  const { project, org, role } = await requireProject(user, params.project, "project.read");
  return { ...project, organization: { id: org.id, slug: org.slug, name: org.name }, role };
});
export const PATCH = route<P>({ auth: "required" }, async (ctx) => updateProject(ctx.user, ctx.params.project, await ctx.body(updateProjectSchema)));
export const DELETE = route<P>({ auth: "required" }, async (ctx) => {
  const { confirm } = await ctx.body(z.object({ confirm: z.string().max(64) }));
  await deleteProject(ctx.user, ctx.params.project, confirm);
  return noContent();
});
