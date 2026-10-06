import "server-only";
import { randomUUID } from "node:crypto";
import { ZodError, type z } from "zod";
import { env } from "@/server/env";
import { SESSION_COOKIE, validateApiToken, validateSessionToken, type SessionUser } from "@/server/auth/session";
import { requestContext } from "@/server/observability/context";
import { captureError } from "@/server/observability/error-tracker";
import { logger } from "@/server/observability/logger";
import { enforce, RATE_RULES, type RateRule } from "@/server/ratelimit";
import { AppError, BadRequest, Forbidden, Unauthorized, Unprocessable } from "./errors";

export type ApiContext<P> = {
  req: Request;
  params: P;
  user: SessionUser | null;
  requestId: string;
  ip: string | null;
  userAgent: string | null;
  /** Parse & validate a JSON body. Never trust client input. */
  body<S extends z.ZodType>(schema: S): Promise<z.infer<S>>;
  /** Parse & validate query string parameters. */
  query<S extends z.ZodType>(schema: S): z.infer<S>;
};

export type AuthedContext<P> = ApiContext<P> & { user: SessionUser };

type Options = {
  auth?: "required" | "optional";
  /** Rate limit rule (keyed by user id, falling back to IP). */
  rateLimit?: RateRule | false;
  /** Allow non-JSON / cross-site requests (inbound webhooks). */
  csrf?: boolean;
};

const MAX_JSON_BYTES = 1024 * 1024;

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

export function clientIp(req: Request): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null;
}

function isSafeMethod(m: string) {
  return m === "GET" || m === "HEAD" || m === "OPTIONS";
}

/** CSRF defence for cookie-authenticated mutations: Origin must match the app. */
function checkOrigin(req: Request) {
  const origin = req.headers.get("origin");
  const allowed = new Set([new URL(env().APP_URL).origin]);
  try {
    allowed.add(new URL(req.url).origin);
  } catch {}
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (host) {
    allowed.add(`https://${host}`);
    if (env().NODE_ENV !== "production") allowed.add(`http://${host}`);
  }
  if (!origin || !allowed.has(origin)) throw Forbidden("Cross-site request blocked");
}

export function errorResponse(err: unknown, requestId: string): Response {
  if (err instanceof ZodError) {
    return json(
      {
        error: {
          code: "validation_failed",
          message: err.issues[0]?.message ?? "Invalid input",
          issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        requestId,
      },
      422,
      requestId,
    );
  }
  if (err instanceof AppError) {
    const headers: Record<string, string> = {};
    if (err.status === 429 && err.details && typeof err.details === "object" && "retryAfter" in err.details) {
      headers["Retry-After"] = String((err.details as { retryAfter: number }).retryAfter);
    }
    return json({ error: { code: err.code, message: err.message, details: err.details }, requestId }, err.status, requestId, headers);
  }
  captureError(err);
  return json({ error: { code: "internal_error", message: "Something went wrong. Please try again." }, requestId }, 500, requestId);
}

function json(data: unknown, status: number, requestId: string, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", "x-request-id": requestId, ...headers },
  });
}

export const created = (data: unknown) => ({ __status: 201, data });
export const noContent = () => ({ __status: 204, data: null });

export async function resolveUser(req: Request): Promise<{ user: SessionUser | null; via: "cookie" | "token" | null }> {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const user = await validateApiToken(auth.slice(7).trim());
    if (!user) throw Unauthorized("Invalid API token");
    return { user, via: "token" };
  }
  const token = readCookie(req, SESSION_COOKIE);
  const session = await validateSessionToken(token);
  return session ? { user: session.user, via: "cookie" } : { user: null, via: null };
}

export function route<P = Record<string, string>>(
  opts: Options & { auth: "required" },
  handler: (ctx: AuthedContext<P>) => Promise<unknown>,
): (req: Request, rc: { params: Promise<P> }) => Promise<Response>;
export function route<P = Record<string, string>>(
  opts: Options,
  handler: (ctx: ApiContext<P>) => Promise<unknown>,
): (req: Request, rc: { params: Promise<P> }) => Promise<Response>;
export function route<P>(opts: Options, handler: (ctx: AuthedContext<P>) => Promise<unknown>) {
  return async (req: Request, rc: { params: Promise<P> }) => {
    const requestId = req.headers.get("x-request-id")?.slice(0, 64) || randomUUID();
    const ip = clientIp(req);
    const userAgent = req.headers.get("user-agent");
    const started = Date.now();
    return requestContext.run({ requestId, ip, userAgent }, async () => {
      try {
        const { user, via } = await resolveUser(req);
        if (opts.auth === "required" && !user) throw Unauthorized();
        if (user) requestContext.getStore()!.userId = user.id;
        if (via === "cookie" && opts.csrf !== false && !isSafeMethod(req.method)) checkOrigin(req);
        if (opts.rateLimit !== false) {
          const rule = opts.rateLimit ?? RATE_RULES.api;
          await enforce(`api:${user?.id ?? ip ?? "anon"}:${rule.limit}/${rule.windowSec}`, rule);
        }
        const params = (await rc?.params) ?? ({} as P);
        const ctx: ApiContext<P> = {
          req,
          params,
          user,
          requestId,
          ip,
          userAgent,
          async body(schema) {
            const len = Number(req.headers.get("content-length") ?? 0);
            if (len > MAX_JSON_BYTES) throw BadRequest("Request body too large");
            const ct = req.headers.get("content-type") ?? "";
            if (!ct.includes("application/json")) throw BadRequest("Expected application/json");
            let raw: unknown;
            try {
              const text = await req.text();
              if (text.length > MAX_JSON_BYTES) throw BadRequest("Request body too large");
              raw = text ? JSON.parse(text) : {};
            } catch (e) {
              if (e instanceof AppError) throw e;
              throw BadRequest("Malformed JSON body");
            }
            const parsed = schema.safeParse(raw);
            if (!parsed.success) throw parsed.error;
            return parsed.data;
          },
          query(schema) {
            const url = new URL(req.url);
            const obj: Record<string, string> = {};
            url.searchParams.forEach((v, k) => (obj[k] = v));
            const parsed = schema.safeParse(obj);
            if (!parsed.success) throw Unprocessable(parsed.error.issues[0]?.message ?? "Invalid query", parsed.error.issues);
            return parsed.data;
          },
        };
        const result = await handler(ctx as AuthedContext<P>);
        logger.info("api", { method: req.method, path: new URL(req.url).pathname, ms: Date.now() - started });
        if (result instanceof Response) {
          result.headers.set("x-request-id", requestId);
          return result;
        }
        if (result && typeof result === "object" && "__status" in result) {
          const r = result as { __status: number; data: unknown };
          if (r.__status === 204) return new Response(null, { status: 204, headers: { "x-request-id": requestId } });
          return json(r.data, r.__status, requestId);
        }
        return json(result ?? null, 200, requestId);
      } catch (err) {
        const res = errorResponse(err, requestId);
        logger.info("api", { method: req.method, path: new URL(req.url).pathname, status: res.status, ms: Date.now() - started });
        return res;
      }
    });
  };
}

export function intParam(value: string, what = "Resource"): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 1_000_000) throw new AppError(404, "not_found", `${what} not found`);
  return n;
}

export function serializeCookie(c: { name: string; value: string; options: { httpOnly: boolean; secure: boolean; sameSite: string; path: string; expires: Date } }) {
  const parts = [`${c.name}=${encodeURIComponent(c.value)}`, `Path=${c.options.path}`, `Expires=${c.options.expires.toUTCString()}`, `SameSite=${c.options.sameSite[0]!.toUpperCase()}${c.options.sameSite.slice(1)}`];
  if (c.options.httpOnly) parts.push("HttpOnly");
  if (c.options.secure) parts.push("Secure");
  return parts.join("; ");
}

export function jsonWithCookies(data: unknown, cookies: Parameters<typeof serializeCookie>[0][], status = 200) {
  const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store" });
  for (const c of cookies) headers.append("set-cookie", serializeCookie(c));
  return new Response(JSON.stringify(data), { status, headers });
}

/** Strip sensitive fields before returning a user to any client. */
export function publicUser(u: SessionUser) {
  return {
    id: u.id,
    email: u.email,
    emailVerified: Boolean(u.emailVerifiedAt),
    username: u.username,
    displayName: u.displayName,
    avatarUrl: u.avatarUrl,
    bio: u.bio,
    company: u.company,
    location: u.location,
    website: u.website,
    timezone: u.timezone,
    hasPassword: Boolean(u.passwordHash),
    isDemo: u.isDemo,
    createdAt: u.createdAt,
  };
}
