import { z } from "zod";
import { route } from "@/server/http/api";
import { downloadUrl } from "@/server/services/files";

/** Redirects to a short-lived signed storage URL (or returns it as JSON with ?format=json). */
export const GET = route<{ project: string; id: string }>({ auth: "required" }, async (ctx) => {
  const q = ctx.query(z.object({ version: z.string().uuid().optional(), inline: z.enum(["1", "0"]).optional(), format: z.enum(["json", "redirect"]).optional() }));
  const url = await downloadUrl(ctx.user, ctx.params.project, ctx.params.id, { versionId: q.version, inline: q.inline === "1" });
  if (q.format === "json") return { url, expiresIn: 300 };
  return new Response(null, { status: 302, headers: { location: url, "cache-control": "no-store" } });
});
