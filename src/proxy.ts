import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic routing guard: redirects signed-out visitors away from app pages
 * and stamps the request path (used for post-login redirects). Real
 * authorization happens server-side in every page and API handler.
 */
const PROTECTED = ["/dashboard", "/settings", "/organizations", "/org/", "/project/", "/notifications"];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const headers = new Headers(req.headers);
  headers.set("x-forgebase-path", `${pathname}${search}`);
  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`)) && !req.cookies.get("fb_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(`${pathname}${search}`)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg|screenshots|.*\\.(?:png|jpg|svg|woff2)$).*)"],
};
