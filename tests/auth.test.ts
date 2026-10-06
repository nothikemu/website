import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { jsonRequest, params } from "./helpers";
import { POST as signupPOST } from "@/app/api/auth/signup/route";
import { POST as loginPOST } from "@/app/api/auth/login/route";
import { POST as logoutPOST } from "@/app/api/auth/logout/route";
import { POST as forgotPOST } from "@/app/api/auth/forgot-password/route";
import { POST as resetPOST } from "@/app/api/auth/reset-password/route";
import { POST as verifyPOST } from "@/app/api/auth/verify-email/route";
import { GET as meGET, PATCH as mePATCH } from "@/app/api/v1/me/route";
import { POST as orgsPOST } from "@/app/api/v1/orgs/route";
import { sentEmails } from "@/server/email";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { db } from "@/server/db";
import { users } from "@/server/db/schema";
import { eq } from "drizzle-orm";

const cookieFrom = (res: Response) => res.headers.get("set-cookie")?.split(";")[0] ?? "";
const tokenFromEmail = (to: string) => {
  const mail = [...sentEmails()].reverse().find((m) => m.to === to);
  return mail ? /token=([\w-]+)/.exec(mail.text)?.[1] : undefined;
};

describe("password hashing", () => {
  it("hashes with scrypt and verifies", async () => {
    const h = await hashPassword("hunter2-hunter2");
    expect(h.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("hunter2-hunter2", h)).toBe(true);
    expect(await verifyPassword("hunter3-hunter3", h)).toBe(false);
  });
});

describe("account lifecycle", () => {
  const email = `eng-${randomUUID().slice(0, 8)}@example.com`;
  const username = `eng-${randomUUID().slice(0, 8)}`;
  let cookie = "";

  it("signs up, sets a secure session cookie and sends verification", async () => {
    const res = await signupPOST(jsonRequest("/api/auth/signup", { method: "POST", body: { email, password: "torque-wrench-42", displayName: "Test Engineer", username } }), params({}));
    expect(res.status).toBe(201);
    const set = res.headers.get("set-cookie")!;
    expect(set).toContain("HttpOnly");
    expect(set).toContain("SameSite=Lax");
    cookie = cookieFrom(res);
    const body = await res.json();
    expect(body.user.email).toBe(email);
    expect(body.user).not.toHaveProperty("passwordHash");
    expect(tokenFromEmail(email)).toBeTruthy();
  });

  it("rejects weak passwords and duplicate emails", async () => {
    const weak = await signupPOST(jsonRequest("/x", { method: "POST", body: { email: "w@example.com", password: "short", displayName: "W", username: "wwww" } }), params({}));
    expect(weak.status).toBe(422);
    const dup = await signupPOST(jsonRequest("/x", { method: "POST", body: { email, password: "torque-wrench-42", displayName: "Dup", username: `${username}-2` } }), params({}));
    expect(dup.status).toBe(409);
  });

  it("verifies email with a single-use token", async () => {
    const token = tokenFromEmail(email)!;
    expect((await verifyPOST(jsonRequest("/x", { method: "POST", body: { token } }), params({}))).status).toBe(200);
    expect((await verifyPOST(jsonRequest("/x", { method: "POST", body: { token } }), params({}))).status).toBe(400);
  });

  it("authenticates with the session cookie", async () => {
    const res = await meGET(jsonRequest("/api/v1/me", { headers: { cookie } }), params({}));
    expect(res.status).toBe(200);
    expect((await res.json()).user.emailVerified).toBe(true);
  });

  it("blocks cross-site mutations (CSRF) for cookie sessions", async () => {
    const res = await mePATCH(
      jsonRequest("/api/v1/me", { method: "PATCH", body: { displayName: "x", username, timezone: "UTC" }, headers: { cookie, origin: "https://evil.example" } }),
      params({}),
    );
    expect(res.status).toBe(403);
    const res2 = await orgsPOST(new Request("http://localhost:3000/api/v1/orgs", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ name: "x", slug: "xx-csrf" }) }), params({}));
    expect(res2.status).toBe(403);
  });

  it("rejects wrong passwords with a generic message", async () => {
    const bad = await loginPOST(jsonRequest("/x", { method: "POST", body: { email, password: "nope-nope-nope" } }), params({}));
    expect(bad.status).toBe(401);
    const unknown = await loginPOST(jsonRequest("/x", { method: "POST", body: { email: "nobody@example.com", password: "nope-nope-nope" } }), params({}));
    expect(unknown.status).toBe(401);
    expect((await bad.json()).error.message).toBe((await unknown.json()).error.message);
  });

  it("logs out and invalidates the session server-side", async () => {
    const res = await logoutPOST(jsonRequest("/x", { method: "POST", headers: { cookie } }), params({}));
    expect(res.status).toBe(200);
    expect((await meGET(jsonRequest("/x", { headers: { cookie } }), params({}))).status).toBe(401);
  });

  it("resets the password and revokes other sessions", async () => {
    const login = await loginPOST(jsonRequest("/x", { method: "POST", body: { email, password: "torque-wrench-42" } }), params({}));
    const oldCookie = cookieFrom(login);
    expect((await forgotPOST(jsonRequest("/x", { method: "POST", body: { email } }), params({}))).status).toBe(200);
    // Unknown emails get the same response (no enumeration).
    expect((await forgotPOST(jsonRequest("/x", { method: "POST", body: { email: "ghost@example.com" } }), params({}))).status).toBe(200);
    const token = tokenFromEmail(email)!;
    expect((await resetPOST(jsonRequest("/x", { method: "POST", body: { token, password: "new-caliper-77" } }), params({}))).status).toBe(200);
    expect((await meGET(jsonRequest("/x", { headers: { cookie: oldCookie } }), params({}))).status).toBe(401);
    expect((await loginPOST(jsonRequest("/x", { method: "POST", body: { email, password: "new-caliper-77" } }), params({}))).status).toBe(200);
  });

  it("never stores plaintext passwords", async () => {
    const [u] = await db.select().from(users).where(eq(users.email, email));
    expect(u!.passwordHash).not.toContain("new-caliper-77");
  });
});

describe("rate limiting", () => {
  it("returns 429 after repeated failed logins", async () => {
    process.env.FORGEBASE_DISABLE_RATE_LIMIT = "0";
    try {
      const email = `rl-${randomUUID().slice(0, 6)}@example.com`;
      let last = 0;
      for (let i = 0; i < 12; i++) {
        const r = await loginPOST(jsonRequest("/x", { method: "POST", body: { email, password: "wrong-password-1" }, headers: { "x-forwarded-for": `10.0.0.${i}` } }), params({}));
        last = r.status;
        if (r.status === 429) {
          expect(r.headers.get("retry-after")).toBeTruthy();
          break;
        }
      }
      expect(last).toBe(429);
    } finally {
      process.env.FORGEBASE_DISABLE_RATE_LIMIT = "1";
    }
  });
});
