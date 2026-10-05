import { route, created } from "@/server/http/api";
import { createOrgSchema } from "@/lib/validation";
import { createOrganization, listOrganizations } from "@/server/services/organizations";

export const GET = route({ auth: "required" }, async ({ user }) => listOrganizations(user));
export const POST = route({ auth: "required" }, async (ctx) => created(await createOrganization(ctx.user, await ctx.body(createOrgSchema))));
