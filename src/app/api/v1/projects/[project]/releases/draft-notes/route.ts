import { z } from "zod";
import { route } from "@/server/http/api";
import { draftNotes } from "@/server/services/releases";

/** Generate release notes from recorded project activity since the last published release. */
export const POST = route<{ project: string }>({ auth: "required" }, async (ctx) => {
  const input = await ctx.body(z.object({ snapshotId: z.string().uuid().nullable().optional(), firmwareCommit: z.string().max(64).nullable().optional() }));
  return draftNotes(ctx.user, ctx.params.project, input);
});
