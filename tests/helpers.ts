import { randomUUID } from "node:crypto";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { createOrganization } from "@/server/services/organizations";
import { createProject } from "@/server/services/projects";
import { createSession, createApiToken } from "@/server/auth/session";
import { hashPassword } from "@/server/auth/password";

export async function makeUser(name = "user") {
  const suffix = randomUUID().slice(0, 8);
  const [u] = await db
    .insert(users)
    .values({
      email: `${name}-${suffix}@example.com`,
      username: `${name}-${suffix}`,
      displayName: `${name} ${suffix}`,
      passwordHash: await hashPassword("correct horse battery 1"),
      emailVerifiedAt: new Date(),
    })
    .returning();
  return u!;
}

export async function makeOrgWithProject(owner: Awaited<ReturnType<typeof makeUser>>, opts: { visibility?: "organization" | "private" } = {}) {
  const slug = `org-${randomUUID().slice(0, 8)}`;
  const org = await createOrganization(owner, { name: `Org ${slug}`, slug, description: null });
  const project = await createProject(owner, {
    organization: org.slug,
    name: `Rover ${slug}`,
    description: "Test project",
    type: "robotics",
    visibility: opts.visibility ?? "organization",
    scaffold: true,
  });
  return { org, project };
}

export async function cookieFor(userId: string) {
  const { token } = await createSession(userId);
  return `fb_session=${token}`;
}

export async function bearerFor(userId: string) {
  const { token } = await createApiToken(userId, "test", null);
  return `Bearer ${token}`;
}

export function jsonRequest(url: string, init: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
  return new Request(`http://localhost:3000${url}`, {
    method: init.method ?? "GET",
    headers: { "content-type": "application/json", origin: "http://localhost:3000", host: "localhost:3000", ...(init.headers ?? {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

export const params = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
