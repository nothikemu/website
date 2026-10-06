import { NextResponse } from "next/server";
import { completeOAuth, exchange, providerAvailable } from "@/server/auth/oauth";
import { verifyPayload, safeEqual } from "@/server/crypto";
import { readCookie, clientIp, serializeCookie } from "@/server/http/api";
import { createSession, sessionCookie, SESSION_COOKIE, validateSessionToken } from "@/server/auth/session";
import { AppError } from "@/server/http/errors";
import { captureError } from "@/server/observability/error-tracker";

type OAuthCookie = { state: string; codeVerifier: string | null; intent: "login" | "connect"; next: string; provider: string; exp: number };

export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(req.url);
  const fail = (code: string) => NextResponse.redirect(new URL(`/login?error=${code}`, url));
  if (!providerAvailable(provider)) return fail("oauth_unavailable");
  const cookie = verifyPayload<OAuthCookie>(readCookie(req, "fb_oauth") ?? "");
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  if (!cookie || cookie.exp < Date.now() || cookie.provider !== provider || !code || !safeEqual(state, cookie.state)) return fail("oauth_state");
  try {
    const profile = await exchange(provider, code, cookie.codeVerifier);
    const current = cookie.intent === "connect" ? await validateSessionToken(readCookie(req, SESSION_COOKIE)) : null;
    const userId = await completeOAuth(provider, profile, current?.user.id ?? null);
    const res = NextResponse.redirect(new URL(cookie.next, url));
    res.cookies.delete({ name: "fb_oauth", path: "/api/auth/oauth" });
    if (!current) {
      const s = await createSession(userId, { ip: clientIp(req), userAgent: req.headers.get("user-agent") });
      res.headers.append("set-cookie", serializeCookie(sessionCookie(s.token, s.expiresAt)));
    }
    return res;
  } catch (err) {
    if (err instanceof AppError) return NextResponse.redirect(new URL(`/login?error=oauth_failed&message=${encodeURIComponent(err.message)}`, url));
    captureError(err, { provider });
    return fail("oauth_failed");
  }
}
