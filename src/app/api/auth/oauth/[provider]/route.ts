import { NextResponse } from "next/server";
import { authorizationUrl, providerAvailable } from "@/server/auth/oauth";
import { signPayload } from "@/server/crypto";
import { secureCookies } from "@/server/env";
import { readCookie } from "@/server/http/api";
import { SESSION_COOKIE, validateSessionToken } from "@/server/auth/session";

export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(req.url);
  if (!providerAvailable(provider)) return NextResponse.redirect(new URL("/login?error=oauth_unavailable", url));
  const wantsConnect = url.searchParams.get("intent") === "connect";
  const session = wantsConnect ? await validateSessionToken(readCookie(req, SESSION_COOKIE)) : null;
  const intent = wantsConnect && session ? "connect" : "login";
  const next = url.searchParams.get("next");
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : intent === "connect" ? "/settings/connections" : "/dashboard";
  const { url: authUrl, state, codeVerifier } = authorizationUrl(provider, intent);
  const res = NextResponse.redirect(authUrl);
  // State, PKCE verifier and intent travel in a signed, short-lived, httpOnly cookie.
  res.cookies.set("fb_oauth", signPayload({ state, codeVerifier, intent, next: safeNext, provider, exp: Date.now() + 10 * 60_000 }), {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/api/auth/oauth",
    maxAge: 600,
  });
  return res;
}
