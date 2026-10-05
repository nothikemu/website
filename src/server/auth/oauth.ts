import "server-only";
import { GitHub, Google, generateCodeVerifier, generateState } from "arctic";
import { and, eq } from "drizzle-orm";
import { db } from "@/server/db";
import { oauthAccounts, users } from "@/server/db/schema";
import { encrypt } from "@/server/crypto";
import { env, oauthEnabled } from "@/server/env";
import { BadRequest, Conflict } from "@/server/http/errors";
import { uniqueUsername } from "@/server/services/auth";
import { audit } from "@/server/services/audit";

export type Provider = "github" | "google";

export type OAuthProfile = {
  providerAccountId: string;
  login: string | null;
  email: string | null;
  emailVerified: boolean;
  name: string | null;
  avatarUrl: string | null;
  accessToken: string;
  scope: string | null;
};

const callback = (p: Provider) => `${env().APP_URL}/api/auth/oauth/${p}/callback`;

export function providerAvailable(p: string): p is Provider {
  return (p === "github" || p === "google") && oauthEnabled()[p];
}

export function authorizationUrl(p: Provider, intent: "login" | "connect") {
  const state = generateState();
  if (p === "github") {
    const gh = new GitHub(env().GITHUB_CLIENT_ID!, env().GITHUB_CLIENT_SECRET!, callback("github"));
    // Connecting for the integration needs repo read access; plain sign-in only needs identity.
    const scopes = intent === "connect" ? ["read:user", "user:email", "repo"] : ["read:user", "user:email"];
    return { url: gh.createAuthorizationURL(state, scopes), state, codeVerifier: null };
  }
  const google = new Google(env().GOOGLE_CLIENT_ID!, env().GOOGLE_CLIENT_SECRET!, callback("google"));
  const codeVerifier = generateCodeVerifier();
  return { url: google.createAuthorizationURL(state, codeVerifier, ["openid", "profile", "email"]), state, codeVerifier };
}

export async function exchange(p: Provider, code: string, codeVerifier: string | null): Promise<OAuthProfile> {
  if (p === "github") {
    const gh = new GitHub(env().GITHUB_CLIENT_ID!, env().GITHUB_CLIENT_SECRET!, callback("github"));
    const tokens = await gh.validateAuthorizationCode(code);
    const accessToken = tokens.accessToken();
    const headers = { Authorization: `Bearer ${accessToken}`, "User-Agent": "Forgebase", Accept: "application/vnd.github+json" };
    const u = (await (await fetch("https://api.github.com/user", { headers })).json()) as {
      id: number;
      login: string;
      name: string | null;
      avatar_url: string;
    };
    const emails = (await (await fetch("https://api.github.com/user/emails", { headers })).json()) as {
      email: string;
      primary: boolean;
      verified: boolean;
    }[];
    const primary = Array.isArray(emails) ? emails.find((e) => e.primary && e.verified) : undefined;
    return {
      providerAccountId: String(u.id),
      login: u.login,
      email: primary?.email.toLowerCase() ?? null,
      emailVerified: Boolean(primary),
      name: u.name,
      avatarUrl: u.avatar_url,
      accessToken,
      scope: tokens.hasScopes() ? tokens.scopes().join(",") : null,
    };
  }
  if (!codeVerifier) throw BadRequest("Missing PKCE verifier");
  const google = new Google(env().GOOGLE_CLIENT_ID!, env().GOOGLE_CLIENT_SECRET!, callback("google"));
  const tokens = await google.validateAuthorizationCode(code, codeVerifier);
  const accessToken = tokens.accessToken();
  const info = (await (
    await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${accessToken}` } })
  ).json()) as { sub: string; email?: string; email_verified?: boolean; name?: string; picture?: string };
  return {
    providerAccountId: info.sub,
    login: info.email ?? null,
    email: info.email?.toLowerCase() ?? null,
    emailVerified: Boolean(info.email_verified),
    name: info.name ?? null,
    avatarUrl: info.picture ?? null,
    accessToken,
    scope: null,
  };
}

/** Resolve the user for an OAuth login: existing link → verified-email match → new account. */
export async function completeOAuth(p: Provider, profile: OAuthProfile, currentUserId: string | null) {
  const [link] = await db
    .select()
    .from(oauthAccounts)
    .where(and(eq(oauthAccounts.provider, p), eq(oauthAccounts.providerAccountId, profile.providerAccountId)));

  const tokenFields = { accessTokenEnc: encrypt(profile.accessToken), scope: profile.scope, providerLogin: profile.login };

  if (currentUserId) {
    if (link && link.userId !== currentUserId) throw Conflict(`This ${p} account is linked to a different Forgebase user`);
    await db
      .insert(oauthAccounts)
      .values({ userId: currentUserId, provider: p, providerAccountId: profile.providerAccountId, ...tokenFields })
      .onConflictDoUpdate({ target: [oauthAccounts.userId, oauthAccounts.provider], set: { providerAccountId: profile.providerAccountId, ...tokenFields } });
    await audit("user.oauth_linked", { actorId: currentUserId, metadata: { provider: p } });
    return currentUserId;
  }

  if (link) {
    await db.update(oauthAccounts).set(tokenFields).where(eq(oauthAccounts.id, link.id));
    await audit("user.login", { actorId: link.userId, metadata: { provider: p } });
    return link.userId;
  }

  if (!profile.email || !profile.emailVerified) throw BadRequest(`Your ${p} account has no verified email address`);
  const [existing] = await db.select().from(users).where(eq(users.email, profile.email));
  let userId: string;
  if (existing) {
    userId = existing.id;
    if (!existing.emailVerifiedAt) await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, userId));
  } else {
    const [created] = await db
      .insert(users)
      .values({
        email: profile.email,
        emailVerifiedAt: new Date(),
        username: await uniqueUsername(profile.login?.split("@")[0] ?? profile.email.split("@")[0]!),
        displayName: profile.name ?? profile.login ?? profile.email.split("@")[0]!,
        avatarUrl: profile.avatarUrl?.startsWith("https://") ? profile.avatarUrl : null,
      })
      .returning();
    userId = created!.id;
    await audit("user.signup", { actorId: userId, metadata: { provider: p } });
  }
  await db.insert(oauthAccounts).values({ userId, provider: p, providerAccountId: profile.providerAccountId, ...tokenFields });
  await audit("user.login", { actorId: userId, metadata: { provider: p } });
  return userId;
}
