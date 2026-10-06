import { route, created } from "@/server/http/api";
import { startUploadSchema } from "@/lib/validation";
import { startUpload } from "@/server/services/files";
import { RATE_RULES } from "@/server/ratelimit";

/** Step 1 of an upload: validate, reserve, and return presigned URL(s) for direct-to-storage transfer. */
export const POST = route<{ project: string }>({ auth: "required", rateLimit: RATE_RULES.upload }, async (ctx) =>
  created(await startUpload(ctx.user, ctx.params.project, await ctx.body(startUploadSchema))),
);
