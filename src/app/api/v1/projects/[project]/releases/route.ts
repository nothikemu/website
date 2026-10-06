import { route, created } from "@/server/http/api";
import { createReleaseSchema } from "@/lib/validation";
import { createRelease, listReleases } from "@/server/services/releases";

type P = { project: string };
export const GET = route<P>({ auth: "required" }, async ({ user, params }) => (await listReleases(user, params.project)).releases);
export const POST = route<P>({ auth: "required" }, async (ctx) => created(await createRelease(ctx.user, ctx.params.project, await ctx.body(createReleaseSchema))));
