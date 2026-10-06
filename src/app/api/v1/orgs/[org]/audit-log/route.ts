import { z } from "zod";
import { route } from "@/server/http/api";
import { requireOrg } from "@/server/authz";
import { listAuditLog } from "@/server/services/audit";

export const GET = route<{ org: string }>({ auth: "required" }, async (ctx) => {
  const { org } = await requireOrg(ctx.user, ctx.params.org, "org.audit.read");
  const q = ctx.query(z.object({ before: z.string().datetime().optional(), limit: z.coerce.number().int().min(1).max(200).optional() }));
  return listAuditLog(org.id, { before: q.before ? new Date(q.before) : undefined, limit: q.limit });
});
