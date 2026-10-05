import { desc, eq } from "drizzle-orm";
import { route, created } from "@/server/http/api";
import { apiTokenSchema } from "@/lib/validation";
import { createApiToken } from "@/server/auth/session";
import { db } from "@/server/db";
import { apiTokens } from "@/server/db/schema";
import { audit } from "@/server/services/audit";

export const GET = route({ auth: "required" }, async ({ user }) =>
  db
    .select({ id: apiTokens.id, name: apiTokens.name, prefix: apiTokens.prefix, lastUsedAt: apiTokens.lastUsedAt, expiresAt: apiTokens.expiresAt, createdAt: apiTokens.createdAt })
    .from(apiTokens)
    .where(eq(apiTokens.userId, user.id))
    .orderBy(desc(apiTokens.createdAt)),
);

export const POST = route({ auth: "required" }, async (ctx) => {
  const input = await ctx.body(apiTokenSchema);
  const expires = input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86400_000) : null;
  const { token, record } = await createApiToken(ctx.user.id, input.name, expires);
  await audit("user.api_token_created", { actorId: ctx.user.id, targetId: record.id });
  return created({ token, id: record.id, name: record.name, prefix: record.prefix, expiresAt: record.expiresAt });
});
