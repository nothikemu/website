import { eq } from "drizzle-orm";
import { z } from "zod";
import { route } from "@/server/http/api";
import { requireOrg } from "@/server/authz";
import { db } from "@/server/db";
import { organizations } from "@/server/db/schema";
import { audit } from "@/server/services/audit";
import { BadRequest } from "@/server/http/errors";

/**
 * Plan changes. No payment provider is connected in the MVP, so owners may
 * switch between self-serve plans freely; a billing provider hook goes here.
 */
export const PATCH = route<{ org: string }>({ auth: "required" }, async (ctx) => {
  const { org } = await requireOrg(ctx.user, ctx.params.org, "org.billing");
  const { plan } = await ctx.body(z.object({ plan: z.enum(["free", "team", "pro", "enterprise"]) }));
  if (plan === "enterprise") throw BadRequest("Enterprise plans are arranged with sales");
  await db.update(organizations).set({ plan }).where(eq(organizations.id, org.id));
  await audit("org.plan_changed", { actorId: ctx.user.id, organizationId: org.id, metadata: { from: org.plan, to: plan } });
  return { plan };
});
