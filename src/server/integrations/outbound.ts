import "server-only";
import { and, eq, isNull, or } from "drizzle-orm";
import { db } from "@/server/db";
import { integrations, projects, users } from "@/server/db/schema";
import { decrypt } from "@/server/crypto";
import { env } from "@/server/env";
import { logger } from "@/server/observability/logger";
import type { DomainEvent } from "@/server/events/types";
import { DEFAULT_CHANNEL_EVENTS } from "./catalog";
import { describeVerb } from "@/lib/activity-text";

export const WEBHOOK_URL_RULES = {
  discord: /^https:\/\/(?:ptb\.|canary\.)?(?:discord\.com|discordapp\.com)\/api\/webhooks\/\d+\/[\w-]+$/,
  slack: /^https:\/\/hooks\.slack\.com\/services\/[\w/]+$/,
} as const;

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function sendChannelMessage(provider: "discord" | "slack", url: string, text: string) {
  if (!WEBHOOK_URL_RULES[provider].test(url)) throw new Error("Invalid webhook URL");
  if (provider === "discord") await post(url, { content: text.slice(0, 1900), allowed_mentions: { parse: [] } });
  else await post(url, { text: text.slice(0, 3000) });
}

/** Event subscriber: fan out matching project events to configured channels. */
export async function forwardToIntegrations(e: DomainEvent) {
  if (!e.projectId) return;
  const rows = await db
    .select()
    .from(integrations)
    .where(
      and(
        eq(integrations.organizationId, e.organizationId),
        eq(integrations.enabled, true),
        or(eq(integrations.projectId, e.projectId), isNull(integrations.projectId)),
        or(eq(integrations.provider, "discord"), eq(integrations.provider, "slack")),
      ),
    );
  if (!rows.length) return;
  let actorName = "Forgebase";
  if (e.actorId) {
    const [u] = await db.select({ name: users.displayName }).from(users).where(eq(users.id, e.actorId));
    if (u) actorName = u.name;
  }
  let projectName = e.projectName;
  if (!projectName) {
    const [p] = await db.select({ name: projects.name }).from(projects).where(eq(projects.id, e.projectId));
    projectName = p?.name ?? "Project";
  }
  const link = e.target?.url ? `${env().APP_URL}${e.target.url}` : null;
  const line = `**${projectName}** · ${actorName} ${describeVerb(e.type, e.data)} ${e.target?.label ?? ""}${e.target?.title && e.target.title !== e.target.label ? ` — ${e.target.title}` : ""}`;
  for (const i of rows) {
    const events = (i.config.events as string[] | undefined) ?? DEFAULT_CHANNEL_EVENTS;
    if (!events.includes(e.type) || !i.secretEnc) continue;
    try {
      const text = i.provider === "slack" ? `${line.replace(/\*\*/g, "*")}${link ? `\n<${link}|Open in Forgebase>` : ""}` : `${line}${link ? `\n<${link}>` : ""}`;
      await sendChannelMessage(i.provider as "discord" | "slack", decrypt(i.secretEnc), text);
      if (i.lastError) await db.update(integrations).set({ lastError: null }).where(eq(integrations.id, i.id));
    } catch (err) {
      logger.warn("integration.delivery_failed", { integrationId: i.id, error: (err as Error).message });
      await db.update(integrations).set({ lastError: (err as Error).message.slice(0, 300) }).where(eq(integrations.id, i.id));
    }
  }
}
