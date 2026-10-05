import { z } from "zod";
import { route, noContent } from "@/server/http/api";
import { updateOrgSchema } from "@/lib/validation";
import { requireOrg } from "@/server/authz";
import { deleteOrganization, updateOrganization } from "@/server/services/organizations";

type P = { org: string };
export const GET = route<P>({ auth: "required" }, async ({ user, params }) => {
  const { org, role } = await requireOrg(user, params.org, "org.read");
  return { ...org, role };
});
export const PATCH = route<P>({ auth: "required" }, async (ctx) => updateOrganization(ctx.user, ctx.params.org, await ctx.body(updateOrgSchema)));
export const DELETE = route<P>({ auth: "required" }, async (ctx) => {
  const { confirm } = await ctx.body(z.object({ confirm: z.string().max(64) }));
  await deleteOrganization(ctx.user, ctx.params.org, confirm);
  return noContent();
});
