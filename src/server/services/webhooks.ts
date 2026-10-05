import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { tests, users, webhookDeliveries, webhookEndpoints } from "@/server/db/schema";
import { getProjectAccess, requireProject, type Actor } from "@/server/authz";
import { decrypt, encrypt, randomToken, safeEqual } from "@/server/crypto";
import { createHmac } from "node:crypto";
import { env } from "@/server/env";
import { BadRequest, NotFound, Unauthorized } from "@/server/http/errors";
import { emit } from "@/server/events";
import { measurementSchema, testStatusSchema } from "@/lib/validation";
import { audit } from "./audit";
import { ingestCommits } from "./integrations";
import { recordRun } from "./tests";

/**
 * Inbound webhooks. Each project can create endpoints for GitHub push events
 * or generic CI/test/deployment events. Payloads are authenticated with an
 * HMAC-SHA256 signature over the raw body using the endpoint's secret.
 * Events execute with the permissions of the endpoint's creator, re-checked at
 * delivery time, so a revoked user's endpoint stops working.
 */
export async function listEndpoints(actor: Actor, ref: string) {
  const access = await requireProject(actor, ref, "project.admin");
  const rows = await db.select().from(webhookEndpoints).where(eq(webhookEndpoints.projectId, access.project.id)).orderBy(desc(webhookEndpoints.createdAt));
  const deliveries = await Promise.all(
    rows.map((r) => db.select().from(webhookDeliveries).where(eq(webhookDeliveries.endpointId, r.id)).orderBy(desc(webhookDeliveries.receivedAt)).limit(10)),
  );
  return rows.map((r, i) => {
    const { secretEnc: _s, ...rest } = r;
    return { ...rest, url: `${env().APP_URL}/api/webhooks/${r.id}`, deliveries: deliveries[i]! };
  });
}

export async function createEndpoint(actor: Actor, ref: string, input: { kind: "github" | "generic"; description?: string | null }) {
  const access = await requireProject(actor, ref, "project.admin");
  const secret = `whsec_${randomToken(24)}`;
  const [row] = await db
    .insert(webhookEndpoints)
    .values({ projectId: access.project.id, kind: input.kind, description: input.description ?? null, secretEnc: encrypt(secret), createdBy: actor.id })
    .returning();
  await audit("webhook.endpoint_created", { actorId: actor.id, organizationId: access.org.id, targetId: row!.id, metadata: { kind: input.kind, project: access.project.slug } });
  return { id: row!.id, kind: row!.kind, url: `${env().APP_URL}/api/webhooks/${row!.id}`, secret };
}

export async function deleteEndpoint(actor: Actor, ref: string, id: string) {
  const access = await requireProject(actor, ref, "project.admin");
  const r = await db.delete(webhookEndpoints).where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.projectId, access.project.id))).returning();
  if (!r.length) throw NotFound("Webhook endpoint");
  await audit("webhook.endpoint_deleted", { actorId: actor.id, organizationId: access.org.id, targetId: id });
}

export function sign(secret: string, body: string) {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

const genericSchema = z.discriminatedUnion("event", [
  z.object({
    event: z.literal("test.run"),
    test: z.string().regex(/^TEST-\d+$/i),
    status: testStatusSchema,
    actual: z.string().max(5000).optional(),
    notes: z.string().max(20000).optional(),
    measurements: z.array(measurementSchema).max(100).optional(),
    source: z.string().max(60).optional(),
  }),
  z.object({ event: z.literal("ci.status"), name: z.string().max(120), status: z.enum(["success", "failure", "pending", "cancelled"]), url: z.string().url().max(500).optional(), commit: z.string().max(64).optional() }),
  z.object({ event: z.literal("deployment"), environment: z.string().max(60), version: z.string().max(80), status: z.enum(["success", "failure", "in_progress"]), url: z.string().url().max(500).optional() }),
]);

export async function handleDelivery(endpointId: string, headers: Headers, raw: string) {
  const [ep] = await db.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, endpointId));
  if (!ep || !ep.enabled) throw NotFound("Webhook endpoint");
  const secret = decrypt(ep.secretEnc);
  const sig = headers.get(ep.kind === "github" ? "x-hub-signature-256" : "x-forgebase-signature") ?? "";
  const record = async (event: string, status: string, error?: string) =>
    db.insert(webhookDeliveries).values({ endpointId: ep.id, event, status, error: error?.slice(0, 500) ?? null, payloadSize: raw.length });
  if (!safeEqual(sig, sign(secret, raw))) {
    await record(headers.get("x-github-event") ?? "unknown", "rejected", "Invalid signature");
    throw Unauthorized("Invalid signature");
  }
  const creator = ep.createdBy ? (await db.select().from(users).where(eq(users.id, ep.createdBy)))[0] : undefined;
  const access = creator ? await getProjectAccess(creator, ep.projectId) : null;
  if (!creator || !access || access.role === "viewer") {
    await record("unknown", "rejected", "Endpoint owner no longer has write access");
    throw Unauthorized("Endpoint owner no longer has access");
  }
  await db.update(webhookEndpoints).set({ lastDeliveryAt: new Date() }).where(eq(webhookEndpoints.id, ep.id));
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    await record("unknown", "failed", "Malformed JSON");
    throw BadRequest("Malformed JSON");
  }

  if (ep.kind === "github") {
    const event = headers.get("x-github-event") ?? "unknown";
    if (event === "ping") {
      await record(event, "ok");
      return { ok: true, event };
    }
    if (event !== "push") {
      await record(event, "ignored");
      return { ok: true, ignored: true };
    }
    const p = payload as { ref?: string; repository?: { full_name?: string }; commits?: { id: string; message: string; url: string; timestamp: string; author?: { name?: string; username?: string } }[] };
    const branch = p.ref?.replace("refs/heads/", "") ?? null;
    const n = await ingestCommits(
      access,
      (p.commits ?? []).slice(0, 100).map((c) => ({ sha: c.id, message: c.message, url: c.url, committedAt: c.timestamp, authorName: c.author?.name ?? null, authorLogin: c.author?.username ?? null, branch })),
      null,
    );
    if (n)
      await emit({
        type: "commit.pushed",
        actorId: null,
        organizationId: access.org.id,
        projectId: access.project.id,
        target: { type: "project", id: access.project.id, label: `${n} commit${n > 1 ? "s" : ""} to ${branch ?? "repository"}`, url: `/project/${access.project.slug}` },
        data: { repository: p.repository?.full_name, branch, count: n },
      });
    await record(event, "ok");
    return { ok: true, imported: n };
  }

  const parsed = genericSchema.safeParse(payload);
  if (!parsed.success) {
    await record("unknown", "failed", parsed.error.issues[0]?.message);
    throw BadRequest(parsed.error.issues[0]?.message ?? "Invalid payload");
  }
  const ev = parsed.data;
  if (ev.event === "test.run") {
    const number = Number(ev.test.split("-")[1]);
    const [t] = await db.select({ id: tests.id }).from(tests).where(and(eq(tests.projectId, access.project.id), eq(tests.number, number)));
    if (!t) {
      await record(ev.event, "failed", `${ev.test} not found`);
      throw NotFound(ev.test.toUpperCase());
    }
    const run = await recordRun(creator, access.project.id, number, {
      status: ev.status,
      actual: ev.actual ?? null,
      notes: ev.notes ?? null,
      measurements: ev.measurements ?? [],
      source: ev.source ?? "ci",
    });
    await record(ev.event, "ok");
    return { ok: true, run: run.number };
  }
  await emit({
    type: ev.event === "ci.status" ? "ci.status" : "deployment.reported",
    actorId: null,
    organizationId: access.org.id,
    projectId: access.project.id,
    target: {
      type: "project",
      id: access.project.id,
      label: ev.event === "ci.status" ? `${ev.name}: ${ev.status}` : `${ev.version} → ${ev.environment} (${ev.status})`,
      url: `/project/${access.project.slug}/activity`,
    },
    data: ev as unknown as Record<string, unknown>,
  });
  await record(ev.event, "ok");
  return { ok: true };
}
