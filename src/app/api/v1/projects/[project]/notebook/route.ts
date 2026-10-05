import { z } from "zod";
import { route, created } from "@/server/http/api";
import { createNotebookSchema } from "@/lib/validation";
import { createEntry, listEntries } from "@/server/services/notebook";

type P = { project: string };

export const GET = route<P>({ auth: "required" }, async (ctx) => {
  const { access: _a, ...rest } = await listEntries(ctx.user, ctx.params.project, ctx.query(z.object({ tag: z.string().max(40).optional(), author: z.string().max(40).optional(), q: z.string().max(100).optional(), before: z.string().max(10).optional() })));
  return rest;
});

export const POST = route<P>({ auth: "required" }, async (ctx) => created(await createEntry(ctx.user, ctx.params.project, await ctx.body(createNotebookSchema))));
