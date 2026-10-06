import "server-only";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getOrgAccess, getProjectAccess, type Actor } from "@/server/authz";
import { AppError } from "@/server/http/errors";

/** Page helpers: resolve access once per request and render 404 instead of leaking existence. */
export const orgForPage = cache(async (actor: Actor, slug: string) => {
  const a = await getOrgAccess(actor, slug);
  if (!a) notFound();
  return a;
});

export const projectForPage = cache(async (actor: Actor, slug: string) => {
  const a = await getProjectAccess(actor, slug);
  if (!a) notFound();
  return a;
});

/** Run a service call; turn 404/403 AppErrors into the Next.js not-found page. */
export async function load<T>(p: Promise<T>): Promise<T> {
  try {
    return await p;
  } catch (e) {
    if (e instanceof AppError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }
}

export function pageNumber(value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 1_000_000) notFound();
  return n;
}
