import { route } from "@/server/http/api";
import { completeUploadSchema } from "@/lib/validation";
import { completeUpload } from "@/server/services/files";

/** Step 2: verify the object in storage (size, magic bytes), extract metadata and create the file revision. */
export const POST = route<{ project: string; id: string }>({ auth: "required" }, async (ctx) => {
  const { parts } = await ctx.body(completeUploadSchema);
  return completeUpload(ctx.user, ctx.params.project, ctx.params.id, parts);
});
