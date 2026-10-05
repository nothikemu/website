import "server-only";
import { and, count, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/server/db";
import { fileVersions, invitations, organizationMembers, organizations, projects, users } from "@/server/db/schema";
import { requireOrg, userOrganizations, type Actor, type OrgRole } from "@/server/authz";
import { BadRequest, Conflict, Forbidden, NotFound } from "@/server/http/errors";
import { randomToken, sha256 } from "@/server/crypto";
import { env } from "@/server/env";
import { sendEmail, templates } from "@/server/email";
import { emit } from "@/server/events";
import { storage } from "@/server/storage";
import { logger } from "@/server/observability/logger";
import { audit } from "./audit";
import { userSummary } from "./shared";
import type { createOrgSchema, updateOrgSchema } from "@/lib/validation";

export async function listOrganizations(actor: Actor) {
  const rows = await userOrganizations(actor.id);
  const counts = await db
    .select({ orgId: projects.organizationId, n: count() })
    .from(projects)
    .groupBy(projects.organizationId);
  const members = await db
    .select({ orgId: organizationMembers.organizationId, n: count() })
    .from(organizationMembers)
    .groupBy(organizationMembers.organizationId);
  const pc = new Map(counts.map((c) => [c.orgId, c.n]));
  const mc = new Map(members.map((c) => [c.orgId, c.n]));
  return rows.map((r) => ({ ...r.org, role: r.role, projectCount: pc.get(r.org.id) ?? 0, memberCount: mc.get(r.org.id) ?? 0 }));
}

export async function createOrganization(actor: Actor, input: z.infer<typeof createOrgSchema>) {
  const [taken] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, input.slug));
  if (taken) throw Conflict("That organization URL is taken");
  const org = await db.transaction(async (tx) => {
    const [org] = await tx
      .insert(organizations)
      .values({ name: input.name, slug: input.slug, description: input.description, createdBy: actor.id })
      .returning();
    await tx.insert(organizationMembers).values({ organizationId: org!.id, userId: actor.id, role: "owner" });
    await tx.update(users).set({ lastActiveOrgId: org!.id }).where(eq(users.id, actor.id));
    return org!;
  });
  await audit("org.created", { actorId: actor.id, organizationId: org.id, targetType: "organization", targetId: org.id });
  await emit({
    type: "org.created",
    actorId: actor.id,
    organizationId: org.id,
    target: { type: "organization", id: org.id, label: org.name, url: `/org/${org.slug}` },
  });
  return org;
}

export async function updateOrganization(actor: Actor, ref: string, input: z.infer<typeof updateOrgSchema>) {
  const { org } = await requireOrg(actor, ref, "org.update");
  if (input.slug && input.slug !== org.slug) {
    const [taken] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, input.slug));
    if (taken) throw Conflict("That organization URL is taken");
  }
  const [updated] = await db.update(organizations).set(input).where(eq(organizations.id, org.id)).returning();
  await audit("org.updated", { actorId: actor.id, organizationId: org.id, metadata: { fields: Object.keys(input) } });
  return updated!;
}

export async function deleteOrganization(actor: Actor, ref: string, confirm: string) {
  const { org } = await requireOrg(actor, ref, "org.delete");
  if (confirm !== org.slug) throw BadRequest("Type the organization URL to confirm");
  const keys = await db
    .select({ key: fileVersions.storageKey })
    .from(fileVersions)
    .innerJoin(projects, eq(projects.id, fileVersions.projectId))
    .where(eq(projects.organizationId, org.id));
  await db.delete(organizations).where(eq(organizations.id, org.id));
  await audit("org.deleted", { actorId: actor.id, targetType: "organization", targetId: org.id, metadata: { slug: org.slug } });
  for (const { key } of keys) {
    await storage()
      .delete(key)
      .catch((e) => logger.warn("storage.delete_failed", { key, error: (e as Error).message }));
  }
}

export async function listMembers(actor: Actor, ref: string) {
  const { org, role } = await requireOrg(actor, ref, "org.read");
  const members = await db
    .select({ ...userSummary, email: users.email, role: organizationMembers.role, joinedAt: organizationMembers.createdAt })
    .from(organizationMembers)
    .innerJoin(users, eq(users.id, organizationMembers.userId))
    .where(eq(organizationMembers.organizationId, org.id))
    .orderBy(users.displayName);
  // Only admins see member emails.
  const canSeeEmail = role === "owner" || role === "admin";
  return members.map((m) => ({ ...m, email: canSeeEmail ? m.email : null }));
}

async function ownerCount(orgId: string) {
  const [r] = await db
    .select({ n: count() })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.role, "owner")));
  return r?.n ?? 0;
}

export async function updateMemberRole(actor: Actor, ref: string, userId: string, role: OrgRole) {
  const access = await requireOrg(actor, ref, "org.members.manage");
  const [member] = await db
    .select()
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, access.org.id), eq(organizationMembers.userId, userId)));
  if (!member) throw NotFound("Member");
  if ((role === "owner" || member.role === "owner") && access.role !== "owner") throw Forbidden("Only owners can change ownership");
  if (member.role === "owner" && role !== "owner" && (await ownerCount(access.org.id)) <= 1)
    throw BadRequest("An organization needs at least one owner");
  await db.update(organizationMembers).set({ role }).where(eq(organizationMembers.id, member.id));
  await audit("org.member_role_changed", {
    actorId: actor.id,
    organizationId: access.org.id,
    targetType: "user",
    targetId: userId,
    metadata: { from: member.role, to: role },
  });
}

export async function removeMember(actor: Actor, ref: string, userId: string) {
  const self = actor.id === userId;
  const access = await requireOrg(actor, ref, self ? "org.read" : "org.members.manage");
  const [member] = await db
    .select()
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, access.org.id), eq(organizationMembers.userId, userId)));
  if (!member) throw NotFound("Member");
  if (member.role === "owner" && !self && access.role !== "owner") throw Forbidden("Only owners can remove owners");
  if (member.role === "owner" && (await ownerCount(access.org.id)) <= 1)
    throw BadRequest("Transfer ownership before removing the last owner");
  await db.delete(organizationMembers).where(eq(organizationMembers.id, member.id));
  await audit(self ? "org.member_left" : "org.member_removed", {
    actorId: actor.id,
    organizationId: access.org.id,
    targetType: "user",
    targetId: userId,
  });
}

export async function createInvitations(actor: Actor & { displayName: string }, ref: string, emails: string[], role: OrgRole) {
  const access = await requireOrg(actor, ref, "org.members.manage");
  if (role === "owner") throw BadRequest("Invite as admin, then transfer ownership");
  const results: { email: string; status: "invited" | "already_member" }[] = [];
  for (const email of [...new Set(emails)]) {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .innerJoin(organizationMembers, eq(organizationMembers.userId, users.id))
      .where(and(eq(users.email, email), eq(organizationMembers.organizationId, access.org.id)));
    if (existing) {
      results.push({ email, status: "already_member" });
      continue;
    }
    await db
      .update(invitations)
      .set({ revokedAt: new Date() })
      .where(and(eq(invitations.organizationId, access.org.id), eq(invitations.email, email), isNull(invitations.acceptedAt)));
    const raw = randomToken(32);
    const [inv] = await db
      .insert(invitations)
      .values({
        organizationId: access.org.id,
        email,
        role,
        tokenHash: sha256(raw),
        invitedBy: actor.id,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600_000),
      })
      .returning();
    await sendEmail({
      to: email,
      ...templates.invite(access.org.name, actor.displayName, role, `${env().APP_URL}/invite/${raw}`),
    });
    await audit("org.member_invited", {
      actorId: actor.id,
      organizationId: access.org.id,
      targetType: "invitation",
      targetId: inv!.id,
      metadata: { email, role },
    });
    const [invitee] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    await emit({
      type: "org.member_invited",
      actorId: actor.id,
      organizationId: access.org.id,
      activity: false,
      target: { type: "organization", id: access.org.id, label: access.org.name, url: `/invite/${raw}` },
      notify: invitee
        ? [{ userId: invitee.id, type: "org.member", title: `${actor.displayName} invited you to ${access.org.name}`, body: `Role: ${role}` }]
        : [],
    });
    results.push({ email, status: "invited" });
  }
  return results;
}

export async function listInvitations(actor: Actor, ref: string) {
  const { org } = await requireOrg(actor, ref, "org.members.manage");
  return db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      expiresAt: invitations.expiresAt,
      createdAt: invitations.createdAt,
      invitedBy: users.displayName,
    })
    .from(invitations)
    .leftJoin(users, eq(users.id, invitations.invitedBy))
    .where(
      and(
        eq(invitations.organizationId, org.id),
        isNull(invitations.acceptedAt),
        isNull(invitations.revokedAt),
        gt(invitations.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(invitations.createdAt));
}

export async function revokeInvitation(actor: Actor, ref: string, invitationId: string) {
  const { org } = await requireOrg(actor, ref, "org.members.manage");
  const [r] = await db
    .update(invitations)
    .set({ revokedAt: new Date() })
    .where(and(eq(invitations.id, invitationId), eq(invitations.organizationId, org.id)))
    .returning();
  if (!r) throw NotFound("Invitation");
  await audit("org.invitation_revoked", { actorId: actor.id, organizationId: org.id, targetId: invitationId });
}

export async function getInvitation(rawToken: string) {
  const [row] = await db
    .select({ inv: invitations, org: { id: organizations.id, name: organizations.name, slug: organizations.slug }, inviter: users.displayName })
    .from(invitations)
    .innerJoin(organizations, eq(organizations.id, invitations.organizationId))
    .leftJoin(users, eq(users.id, invitations.invitedBy))
    .where(eq(invitations.tokenHash, sha256(rawToken)));
  if (!row || row.inv.revokedAt || row.inv.acceptedAt || row.inv.expiresAt < new Date()) return null;
  return row;
}

export async function acceptInvitation(user: Actor & { email: string; emailVerifiedAt: Date | null; displayName: string }, rawToken: string) {
  const row = await getInvitation(rawToken);
  if (!row) throw NotFound("Invitation");
  if (row.inv.email !== user.email) throw Forbidden(`This invitation was sent to ${row.inv.email}`);
  if (!user.emailVerifiedAt) throw Forbidden("Verify your email address before accepting invitations");
  await db.transaction(async (tx) => {
    await tx
      .insert(organizationMembers)
      .values({ organizationId: row.org.id, userId: user.id, role: row.inv.role })
      .onConflictDoNothing();
    await tx.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.id, row.inv.id));
    await tx.update(users).set({ lastActiveOrgId: row.org.id }).where(eq(users.id, user.id));
  });
  await audit("org.member_joined", { actorId: user.id, organizationId: row.org.id, metadata: { role: row.inv.role } });
  const admins = await db
    .select({ id: organizationMembers.userId })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, row.org.id), sql`${organizationMembers.role} in ('owner','admin')`, ne(organizationMembers.userId, user.id)));
  await emit({
    type: "org.member_joined",
    actorId: user.id,
    organizationId: row.org.id,
    target: { type: "user", id: user.id, label: user.displayName, url: `/org/${row.org.slug}/members` },
    notify: admins.map((a) => ({ userId: a.id, type: "org.member", title: `${user.displayName} joined ${row.org.name}` })),
  });
  return row.org;
}

export async function setActiveOrganization(actor: Actor, ref: string) {
  const { org } = await requireOrg(actor, ref, "org.read");
  await db.update(users).set({ lastActiveOrgId: org.id }).where(eq(users.id, actor.id));
  return org;
}
