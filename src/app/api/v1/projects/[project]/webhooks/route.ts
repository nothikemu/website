import { route, created } from "@/server/http/api";
import { webhookEndpointSchema } from "@/lib/validation";
import { createEndpoint, listEndpoints } from "@/server/services/webhooks";

type P = { project: string };
export const GET = route<P>({ auth: "required" }, async ({ user, params }) => listEndpoints(user, params.project));
export const POST = route<P>({ auth: "required" }, async (ctx) => created(await createEndpoint(ctx.user, ctx.params.project, await ctx.body(webhookEndpointSchema))));
