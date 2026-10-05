import { route, created } from "@/server/http/api";
import { createFolderSchema } from "@/lib/validation";
import { createFolder, folderTree } from "@/server/services/files";

type P = { project: string };
export const GET = route<P>({ auth: "required" }, async ({ user, params }) => folderTree(user, params.project));
export const POST = route<P>({ auth: "required" }, async (ctx) => created(await createFolder(ctx.user, ctx.params.project, await ctx.body(createFolderSchema))));
