import { route, created } from "@/server/http/api";
import { linkSchema } from "@/lib/validation";
import { createLink } from "@/server/services/links";

export const POST = route<{ project: string }>({ auth: "required" }, async (ctx) => created(await createLink(ctx.user, ctx.params.project, await ctx.body(linkSchema))));
