import { and, eq } from "drizzle-orm";
import { route, noContent } from "@/server/http/api";
import { db } from "@/server/db";
import { apiTokens } from "@/server/db/schema";
import { NotFound } from "@/server/http/errors";
import { audit } from "@/server/services/audit";

export const DELETE = route<{ id: string }>({ auth: "required" }, async ({ user, params }) => {
  const r = await db.delete(apiTokens).where(and(eq(apiTokens.id, params.id), eq(apiTokens.userId, user.id))).returning();
  if (!r.length) throw NotFound("Token");
  await audit("user.api_token_revoked", { actorId: user.id, targetId: params.id });
  return noContent();
});
