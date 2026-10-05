import { route, created } from "@/server/http/api";
import { createSnapshotSchema } from "@/lib/validation";
import { createSnapshot, listSnapshots } from "@/server/services/snapshots";

type P = { project: string };
export const GET = route<P>({ auth: "required" }, async ({ user, params }) => (await listSnapshots(user, params.project)).snapshots);
export const POST = route<P>({ auth: "required" }, async (ctx) => created(await createSnapshot(ctx.user, ctx.params.project, await ctx.body(createSnapshotSchema))));
