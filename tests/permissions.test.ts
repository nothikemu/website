import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { makeOrgWithProject, makeUser, bearerFor, jsonRequest, params } from "./helpers";
import * as v from "@/lib/validation";
import { db } from "@/server/db";
import { organizationMembers } from "@/server/db/schema";
import { effectiveProjectRole, getProjectAccess, orgRoleAllows, projectRoleAllows } from "@/server/authz";
import { createIssue } from "@/server/services/issues";
import { createProject, setProjectMember, updateProject } from "@/server/services/projects";
import { removeMember, updateMemberRole } from "@/server/services/organizations";
import { createComment } from "@/server/services/comments";
import { AppError } from "@/server/http/errors";
import { PATCH as projectPATCH } from "@/app/api/v1/projects/[project]/route";

const rejects = (p: Promise<unknown>, status: number) => expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.status === status);

describe("role matrix", () => {
  it("maps org roles to project roles", () => {
    expect(effectiveProjectRole({ orgRole: "owner", visibility: "private", projectRole: null })).toBe("admin");
    expect(effectiveProjectRole({ orgRole: "admin", visibility: "organization", projectRole: null })).toBe("admin");
    expect(effectiveProjectRole({ orgRole: "engineer", visibility: "organization", projectRole: null })).toBe("engineer");
    expect(effectiveProjectRole({ orgRole: "viewer", visibility: "organization", projectRole: null })).toBe("viewer");
    expect(effectiveProjectRole({ orgRole: "viewer", visibility: "organization", projectRole: "engineer" })).toBe("engineer");
    expect(effectiveProjectRole({ orgRole: "engineer", visibility: "private", projectRole: null })).toBeNull();
    expect(effectiveProjectRole({ orgRole: null, visibility: "organization", projectRole: "admin" })).toBeNull();
  });
  it("orders permissions", () => {
    expect(orgRoleAllows("viewer", "org.read")).toBe(true);
    expect(orgRoleAllows("engineer", "org.members.manage")).toBe(false);
    expect(orgRoleAllows("admin", "org.delete")).toBe(false);
    expect(projectRoleAllows("viewer", "project.write")).toBe(false);
    expect(projectRoleAllows("viewer", "project.comment")).toBe(true);
    expect(projectRoleAllows("engineer", "project.admin")).toBe(false);
  });
});

describe("enforcement", () => {
  let owner: Awaited<ReturnType<typeof makeUser>>;
  let engineer: Awaited<ReturnType<typeof makeUser>>;
  let viewer: Awaited<ReturnType<typeof makeUser>>;
  let ctx: Awaited<ReturnType<typeof makeOrgWithProject>>;

  beforeAll(async () => {
    owner = await makeUser("owner");
    engineer = await makeUser("eng");
    viewer = await makeUser("viewer");
    ctx = await makeOrgWithProject(owner);
    await db.insert(organizationMembers).values([
      { organizationId: ctx.org.id, userId: engineer.id, role: "engineer" },
      { organizationId: ctx.org.id, userId: viewer.id, role: "viewer" },
    ]);
  });

  it("viewers can read and comment but not write", async () => {
    const issue = await createIssue(owner, ctx.project.slug, v.createIssueSchema.parse({ title: "Check wiring" }));
    await rejects(createIssue(viewer, ctx.project.slug, v.createIssueSchema.parse({ title: "nope" })), 403);
    await expect(createComment(viewer, ctx.project.slug, v.createCommentSchema.parse({ targetType: "issue", targetId: issue.id, body: "looks good" }))).resolves.toBeTruthy();
  });

  it("engineers can write but not administer", async () => {
    await expect(createIssue(engineer, ctx.project.slug, v.createIssueSchema.parse({ title: "ok" }))).resolves.toBeTruthy();
    await rejects(updateProject(engineer, ctx.project.slug, v.updateProjectSchema.parse({ name: "Renamed" })), 403);
    const auth = await bearerFor(engineer.id);
    const res = await projectPATCH(jsonRequest("/x", { method: "PATCH", body: { name: "Renamed" }, headers: { authorization: auth } }), params({ project: ctx.project.slug }));
    expect(res.status).toBe(403);
  });

  it("private projects are invisible to non-members until added", async () => {
    const priv = await createProject(owner, v.createProjectSchema.parse({ organization: ctx.org.slug, name: "Skunkworks", visibility: "private" }));
    expect(await getProjectAccess(engineer, priv.id)).toBeNull();
    await setProjectMember(owner, priv.id, engineer.id, "viewer");
    expect((await getProjectAccess(engineer, priv.id))?.role).toBe("viewer");
  });

  it("only owners manage ownership and the last owner cannot leave", async () => {
    await updateMemberRole(owner, ctx.org.slug, engineer.id, "admin");
    await rejects(updateMemberRole(engineer, ctx.org.slug, owner.id, "viewer"), 403);
    await rejects(removeMember(owner, ctx.org.slug, owner.id), 400);
    await updateMemberRole(owner, ctx.org.slug, engineer.id, "engineer");
  });

  it("removed members immediately lose access", async () => {
    const temp = await makeUser("temp");
    await db.insert(organizationMembers).values({ organizationId: ctx.org.id, userId: temp.id, role: "engineer" });
    expect(await getProjectAccess(temp, ctx.project.id)).not.toBeNull();
    await removeMember(owner, ctx.org.slug, temp.id);
    expect(await getProjectAccess(temp, ctx.project.id)).toBeNull();
    const [row] = await db.select().from(organizationMembers).where(eq(organizationMembers.userId, temp.id));
    expect(row).toBeUndefined();
  });
});
