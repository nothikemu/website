import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, validateSessionToken } from "./session";

/** Server-component helpers. Cached per request. */
export const getCurrentUser = cache(async () => {
  const jar = await cookies();
  const session = await validateSessionToken(jar.get(SESSION_COOKIE)?.value);
  return session?.user ?? null;
});

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    const h = await headers();
    const next = h.get("x-forgebase-path") ?? "/dashboard";
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  return user;
}
