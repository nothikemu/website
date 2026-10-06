/**
 * THE most important property of Forgebase: a user from Organization A must
 * never be able to read or modify private data belonging to Organization B,
 * no matter which IDs they put in a request.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { bearerFor, jsonRequest, makeOrgWithProject, makeUser, params } from "./helpers";
import * as v from "@/lib/validation";
import { getProjectAccess, requireProject } from "@/server/authz";
import { createIssue, getIssue, listIssues, updateIssue } from "@/server/services/issues";
import { putFileFromServer, downloadUrl, listDirectory, getFileDetail, readText } from "@/server/services/files";
import { createComment } from "@/server/services/comments";
import { createLink } from "@/server/services/links";
import { listMembers } from "@/server/services/organizations";
import { createRequirement, getRequirement } from "@/server/services/requirements";
import { search } from "@/server/search";
import { AppError } from "@/server/http/errors";
import { GET as issuesGET, POST as issuesPOST } from "@/app/api/v1/projects/[project]/issues/route";
import { GET as issueGET, PATCH as issuePATCH, DELETE as issueDELETE } from "@/app/api/v1/projects/[project]/issues/[number]/route";
import { GET as fileGET } from "@/app/api/v1/projects/[project]/files/[id]/route";
import { GET as downloadGET } from "@/app/api/v1/projects/[project]/files/[id]/download/route";
import { POST as commentsPOST } from "@/app/api/v1/projects/[project]/comments/route";
import { GET as projectGET } from "@/app/api/v1/projects/[project]/route";
import { GET as membersGET } from "@/app/api/v1/orgs/[org]/members/route";
import { GET as searchGET } from "@/app/api/v1/search/route";
import { GET as auditGET } from "@/app/api/v1/orgs/[org]/audit-log/route";

async function expectStatus(p: Promise<unknown>, status: number) {
  await expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.status === status);
}

describe("organization isolation", () => {
  let alice: Awaited<ReturnType<typeof makeUser>>;
  let bob: Awaited<ReturnType<typeof makeUser>>;
  let A: Awaited<ReturnType<typeof makeOrgWithProject>>;
  let B: Awaited<ReturnType<typeof makeOrgWithProject>>;
  let bIssue: { id: string; number: number };
  let bFile: { id: string };
  let bReq: { id: string; number: number };
  let aIssue: { id: string; number: number };
  let aliceAuth: string;

  beforeAll(async () => {
    alice = await makeUser("alice");
    bob = await makeUser("bob");
    A = await makeOrgWithProject(alice);
    B = await makeOrgWithProject(bob);
    bIssue = await createIssue(bob, B.project.slug, v.createIssueSchema.parse({ title: "Secret motor controller fault", description: "classified torque numbers" }));
    aIssue = await createIssue(alice, A.project.slug, v.createIssueSchema.parse({ title: "Alice issue" }));
    bReq = await createRequirement(bob, B.project.slug, v.createRequirementSchema.parse({ title: "Secret requirement zeta" }));
    bFile = (await putFileFromServer(bob, B.project.slug, { path: "/cad/secret-gearbox.step", content: Buffer.from("ISO-10303-21;\nHEADER;\nENDSEC;\nEND-ISO-10303-21;\n") })).file;
    aliceAuth = await bearerFor(alice.id);
  });

  it("has no access record for another org's project", async () => {
    expect(await getProjectAccess(alice, B.project.id)).toBeNull();
    expect(await getProjectAccess(alice, B.project.slug)).toBeNull();
    await expectStatus(requireProject(alice, B.project.id, "project.read"), 404);
  });

  it("cannot read or modify issues by slug, id or number", async () => {
    await expectStatus(listIssues(alice, B.project.slug), 404);
    await expectStatus(getIssue(alice, B.project.id, bIssue.number), 404);
    await expectStatus(updateIssue(alice, B.project.slug, bIssue.number, v.updateIssueSchema.parse({ title: "pwned" })), 404);
  });

  it("cannot access another org's files, downloads or contents", async () => {
    await expectStatus(listDirectory(alice, B.project.slug, null), 404);
    await expectStatus(getFileDetail(alice, B.project.slug, bFile.id), 404);
    await expectStatus(downloadUrl(alice, B.project.slug, bFile.id, {}), 404);
    // Mixing an authorized project with a foreign file id must also fail.
    await expectStatus(getFileDetail(alice, A.project.slug, bFile.id), 404);
    await expectStatus(downloadUrl(alice, A.project.slug, bFile.id, {}), 404);
    await expectStatus(readText(alice, A.project.slug, bFile.id), 404);
  });

  it("cannot attach comments or links to foreign entities through their own project", async () => {
    await expectStatus(createComment(alice, A.project.slug, v.createCommentSchema.parse({ targetType: "issue", targetId: bIssue.id, body: "hi" })), 404);
    await expectStatus(createLink(alice, A.project.slug, { sourceType: "issue", sourceId: aIssue.id, targetType: "requirement", targetId: bReq.id, relation: "references" }), 404);
    await expectStatus(createLink(alice, A.project.slug, { sourceType: "issue", sourceId: bIssue.id, targetRef: "REQ-001", relation: "references" }), 404);
  });

  it("cannot reference another org's requirement by number", async () => {
    await expectStatus(getRequirement(alice, A.project.slug, bReq.number + 100), 404);
    await expectStatus(getRequirement(alice, B.project.slug, bReq.number), 404);
  });

  it("cannot assign issues to users outside the project", async () => {
    await expectStatus(createIssue(alice, A.project.slug, v.createIssueSchema.parse({ title: "x", assigneeId: bob.id })), 400);
  });

  it("cannot list another org's members", async () => {
    await expectStatus(listMembers(alice, B.org.slug), 404);
  });

  it("never sees another org's records in search", async () => {
    const res = await search(alice.id, "secret");
    expect(res.hits.filter((h) => h.projectId === B.project.id)).toHaveLength(0);
    expect(res.people.find((p) => p.id === bob.id)).toBeUndefined();
    const own = await search(bob.id, "secret");
    expect(own.hits.length).toBeGreaterThan(0);
  });

  describe("via the HTTP API", () => {
    const h = () => ({ authorization: aliceAuth });
    it("returns 404 for every foreign project endpoint", async () => {
      const p = { project: B.project.slug };
      expect((await projectGET(jsonRequest(`/api/v1/projects/${B.project.slug}`, { headers: h() }), params(p))).status).toBe(404);
      expect((await issuesGET(jsonRequest(`/api/v1/projects/${B.project.slug}/issues`, { headers: h() }), params(p))).status).toBe(404);
      expect((await issuesPOST(jsonRequest(`/api/v1/projects/${B.project.slug}/issues`, { method: "POST", body: { title: "inject" }, headers: h() }), params(p))).status).toBe(404);
      const ip = { project: B.project.id, number: String(bIssue.number) };
      expect((await issueGET(jsonRequest("/x", { headers: h() }), params(ip))).status).toBe(404);
      expect((await issuePATCH(jsonRequest("/x", { method: "PATCH", body: { title: "pwned" }, headers: h() }), params(ip))).status).toBe(404);
      expect((await issueDELETE(jsonRequest("/x", { method: "DELETE", headers: h() }), params(ip))).status).toBe(404);
      expect((await fileGET(jsonRequest("/x", { headers: h() }), params({ project: B.project.slug, id: bFile.id }))).status).toBe(404);
      expect((await downloadGET(jsonRequest("/x", { headers: h() }), params({ project: A.project.slug, id: bFile.id }))).status).toBe(404);
      expect(
        (await commentsPOST(jsonRequest("/x", { method: "POST", body: { targetType: "issue", targetId: bIssue.id, body: "x" }, headers: h() }), params({ project: A.project.slug }))).status,
      ).toBe(404);
      expect((await membersGET(jsonRequest("/x", { headers: h() }), params({ org: B.org.slug }))).status).toBe(404);
      expect((await auditGET(jsonRequest("/x", { headers: h() }), params({ org: B.org.slug }))).status).toBe(404);
    });

    it("rejects scoping search to a foreign project", async () => {
      const res = await searchGET(jsonRequest(`/api/v1/search?q=secret&project=${B.project.slug}`, { headers: h() }), params({}));
      expect(res.status).toBe(404);
    });

    it("leaves the victim's data unchanged", async () => {
      const { issue } = await getIssue(bob, B.project.slug, bIssue.number);
      expect(issue.title).toBe("Secret motor controller fault");
    });
  });
});
