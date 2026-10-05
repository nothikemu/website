import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { commits, integrations, issues, projects, users } from "@/server/db/schema";
import { requireOrg, requireProject, type Actor, type ProjectAccess } from "@/server/authz";
import { BadRequest, NotFound } from "@/server/http/errors";
import { encrypt } from "@/server/crypto";
import { emit } from "@/server/events";
import { indexDocument } from "@/server/search";
import { githubClientFor, type GhCommit } from "@/server/integrations/github";
import { DEFAULT_CHANNEL_EVENTS, providerCatalog } from "@/server/integrations/catalog";
import { sendChannelMessage, WEBHOOK_URL_RULES } from "@/server/integrations/outbound";
import { parseRefs } from "@/lib/refs";
import { audit } from "./audit";
import { addLink, resolveRefs } from "./shared";

const FIX_RE = /\b(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?)\s+(ISS-\d+)/gi;

function publicIntegration(i: typeof integrations.$inferSelect & { projectSlug?: string | null; projectName?: string | null }) {
  // Never expose secretEnc.
  const { secretEnc: _s, ...rest } = i;
  return { ...rest, hasSecret: Boolean(i.secretEnc) };
}

export async function listIntegrations(actor: Actor, orgRef: string) {
  const { org, role } = await requireOrg(actor, orgRef, "org.read");
  const rows = await db
    .select({ i: integrations, projectSlug: projects.slug, projectName: projects.name, creator: users.displayName })
    .from(integrations)
    .leftJoin(projects, eq(projects.id, integrations.projectId))
    .leftJoin(users, eq(users.id, integrations.createdBy))
    .where(eq(integrations.organizationId, org.id))
    .orderBy(desc(integrations.createdAt));
  return {
    org,
    canManage: role === "owner" || role === "admin",
    catalog: providerCatalog(),
    integrations: rows.map((r) => ({ ...publicIntegration(r.i), projectSlug: r.projectSlug, projectName: r.projectName, creator: r.creator })),
  };
}

export async function projectIntegrations(actor: Actor, ref: string) {
  const access = await requireProject(actor, ref, "project.read");
  const rows = await db.select().from(integrations).where(and(eq(integrations.organizationId, access.org.id), eq(integrations.projectId, access.project.id)));
  return rows.map(publicIntegration);
}

export async function listGithubRepos(actor: Actor) {
  const client = await githubClientFor(actor.id);
  return { mock: client.mock, repos: await client.listRepos() };
}

export async function connectRepository(actor: Actor, ref: string, repository: string) {
  const access = await requireProject(actor, ref, "project.admin");
  const client = await githubClientFor(actor.id);
  const repo = await client.getRepo(repository);
  await db.delete(integrations).where(and(eq(integrations.projectId, access.project.id), eq(integrations.provider, "github")));
  const [row] = await db
    .insert(integrations)
    .values({
      organizationId: access.org.id,
      projectId: access.project.id,
      provider: "github",
      config: { repository: repo.fullName, defaultBranch: repo.defaultBranch, private: repo.private, url: repo.url, mock: client.mock, connectedBy: actor.id },
      createdBy: actor.id,
    })
    .returning();
  await db.update(projects).set({ repository: repo.fullName }).where(eq(projects.id, access.project.id));
  await audit("integration.github_connected", { actorId: actor.id, organizationId: access.org.id, metadata: { project: access.project.slug, repository: repo.fullName } });
  await emit({
    type: "repository.linked",
    actorId: actor.id,
    organizationId: access.org.id,
    projectId: access.project.id,
    target: { type: "project", id: access.project.id, label: repo.fullName, url: `/project/${access.project.slug}/settings/integrations` },
  });
  const sync = await syncCommits(actor, ref);
  return { integration: publicIntegration(row!), imported: sync.imported, mock: client.mock };
}

/** Store commits and link them to entities referenced in their messages (ISS-012, REQ-003…). */
export async function ingestCommits(access: ProjectAccess, list: (GhCommit & { branch?: string | null })[], actorId: string | null) {
  let imported = 0;
  for (const c of list) {
    const [row] = await db
      .insert(commits)
      .values({
        projectId: access.project.id,
        sha: c.sha,
        message: c.message.slice(0, 5000),
        authorName: c.authorName,
        authorLogin: c.authorLogin,
        url: c.url,
        branch: c.branch ?? null,
        committedAt: new Date(c.committedAt),
      })
      .onConflictDoNothing()
      .returning();
    if (!row) continue;
    imported++;
    const fixes = new Set([...c.message.matchAll(FIX_RE)].map((m) => m[1]!.toUpperCase()));
    for (const r of await resolveRefs(access.project.id, parseRefs(c.message))) {
      const relation = r.kind === "issue" && fixes.has(`ISS-${String(r.number).padStart(3, "0")}`) ? "fixes" : "references";
      await addLink(db, { projectId: access.project.id, sourceType: "commit", sourceId: row.id, targetType: r.kind, targetId: r.id, relation, createdBy: actorId });
    }
    await indexDocument({
      organizationId: access.org.id,
      projectId: access.project.id,
      entityType: "commit",
      entityId: row.id,
      ref: row.sha.slice(0, 7),
      title: row.message.split("\n")[0]!.slice(0, 200),
      body: row.message,
      url: row.url ?? `/project/${access.project.slug}/activity`,
      meta: { author: row.authorLogin ?? row.authorName },
    });
  }
  return imported;
}

export async function syncCommits(actor: Actor, ref: string) {
  const access = await requireProject(actor, ref, "project.write");
  const [integ] = await db.select().from(integrations).where(and(eq(integrations.projectId, access.project.id), eq(integrations.provider, "github")));
  if (!integ) throw BadRequest("No repository is linked to this project");
  const repo = String(integ.config.repository);
  try {
    const client = await githubClientFor(actor.id);
    const list = await client.listCommits(repo, { perPage: 50 });
    const imported = await ingestCommits(access, list.map((c) => ({ ...c, branch: String(integ.config.defaultBranch ?? "main") })), actor.id);
    await db.update(integrations).set({ lastSyncedAt: new Date(), lastError: null }).where(eq(integrations.id, integ.id));
    if (imported)
      await emit({
        type: "repository.synced",
        actorId: actor.id,
        organizationId: access.org.id,
        projectId: access.project.id,
        target: { type: "project", id: access.project.id, label: repo, url: `/project/${access.project.slug}` },
        data: { imported },
      });
    return { imported };
  } catch (err) {
    await db.update(integrations).set({ lastError: (err as Error).message.slice(0, 300) }).where(eq(integrations.id, integ.id));
    throw err;
  }
}

export async function addChannel(actor: Actor, ref: string, input: { provider: "discord" | "slack"; webhookUrl: string; events?: string[] }) {
  const access = await requireProject(actor, ref, "project.admin");
  if (!WEBHOOK_URL_RULES[input.provider].test(input.webhookUrl))
    throw BadRequest(input.provider === "discord" ? "Paste a Discord webhook URL (https://discord.com/api/webhooks/…)" : "Paste a Slack incoming-webhook URL (https://hooks.slack.com/services/…)");
  const events = (input.events?.length ? input.events : DEFAULT_CHANNEL_EVENTS).filter((e) => DEFAULT_CHANNEL_EVENTS.includes(e));
  const [row] = await db
    .insert(integrations)
    .values({
      organizationId: access.org.id,
      projectId: access.project.id,
      provider: input.provider,
      config: { events, hint: `…${input.webhookUrl.slice(-6)}` },
      secretEnc: encrypt(input.webhookUrl),
      createdBy: actor.id,
    })
    .returning();
  await audit("integration.channel_added", { actorId: actor.id, organizationId: access.org.id, metadata: { provider: input.provider, project: access.project.slug } });
  let delivered = true;
  try {
    await sendChannelMessage(input.provider, input.webhookUrl, `Forgebase is now connected to **${access.project.name}**. You'll receive: ${events.join(", ")}.`);
  } catch (err) {
    delivered = false;
    await db.update(integrations).set({ lastError: (err as Error).message }).where(eq(integrations.id, row!.id));
  }
  return { integration: publicIntegration(row!), delivered };
}

export async function updateIntegration(actor: Actor, orgRef: string, id: string, input: { enabled?: boolean; events?: string[] }) {
  const { org } = await requireOrg(actor, orgRef, "org.read");
  const [i] = await db.select().from(integrations).where(and(eq(integrations.id, id), eq(integrations.organizationId, org.id)));
  if (!i) throw NotFound("Integration");
  if (i.projectId) await requireProject(actor, i.projectId, "project.admin");
  else await requireOrg(actor, orgRef, "org.integrations.manage");
  const config = input.events ? { ...i.config, events: input.events.filter((e) => DEFAULT_CHANNEL_EVENTS.includes(e)) } : i.config;
  const [u] = await db.update(integrations).set({ enabled: input.enabled ?? i.enabled, config }).where(eq(integrations.id, id)).returning();
  return publicIntegration(u!);
}

export async function removeIntegration(actor: Actor, orgRef: string, id: string) {
  const { org } = await requireOrg(actor, orgRef, "org.read");
  const [i] = await db.select().from(integrations).where(and(eq(integrations.id, id), eq(integrations.organizationId, org.id)));
  if (!i) throw NotFound("Integration");
  if (i.projectId) await requireProject(actor, i.projectId, "project.admin");
  else await requireOrg(actor, orgRef, "org.integrations.manage");
  await db.delete(integrations).where(eq(integrations.id, id));
  if (i.provider === "github" && i.projectId) await db.update(projects).set({ repository: null }).where(eq(projects.id, i.projectId));
  await audit("integration.removed", { actorId: actor.id, organizationId: org.id, metadata: { provider: i.provider } });
}

export async function commitsForIssue(projectId: string, issueNumbers: number[]) {
  if (!issueNumbers.length) return [];
  return db.select().from(issues).where(and(eq(issues.projectId, projectId), inArray(issues.number, issueNumbers)));
}
