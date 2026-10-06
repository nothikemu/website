import { beforeAll, describe, expect, it } from "vitest";
import { makeOrgWithProject, makeUser, bearerFor, jsonRequest, params } from "./helpers";
import { putFileFromServer, startUpload } from "@/server/services/files";
import { AppError } from "@/server/http/errors";
import { GET as storageGET, PUT as storagePUT } from "@/app/api/storage/local/[token]/route";
import { GET as downloadGET } from "@/app/api/v1/projects/[project]/files/[id]/download/route";
import { signPayload } from "@/server/crypto";
import { validateContent } from "@/server/files/inspect";
import { db } from "@/server/db";
import { organizations } from "@/server/db/schema";
import { eq } from "drizzle-orm";

const rejects = (p: Promise<unknown>, status: number) => expect(p).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.status === status);

describe("file permissions & upload validation", () => {
  let owner: Awaited<ReturnType<typeof makeUser>>;
  let ctx: Awaited<ReturnType<typeof makeOrgWithProject>>;
  let fileId: string;

  beforeAll(async () => {
    owner = await makeUser("files");
    ctx = await makeOrgWithProject(owner);
    fileId = (await putFileFromServer(owner, ctx.project.slug, { path: "/tests/drivetrain-test-01.csv", content: Buffer.from("t,load_N\n0,0\n1,250\n2,510\n") })).file.id;
  });

  it("issues short-lived signed download URLs that work", async () => {
    const auth = await bearerFor(owner.id);
    const res = await downloadGET(jsonRequest(`/x?format=json`, { headers: { authorization: auth } }), params({ project: ctx.project.slug, id: fileId }));
    const { url } = await res.json();
    const token = url.split("/").pop();
    const file = await storageGET(new Request(`http://localhost${url}`), params({ token }));
    expect(file.status).toBe(200);
    expect(file.headers.get("content-disposition")).toContain("attachment");
    expect(file.headers.get("content-security-policy")).toContain("sandbox");
    expect(await file.text()).toContain("load_N");
  });

  it("rejects tampered and expired storage tokens", async () => {
    const forged = signPayload({ op: "get", k: "org/x/../../etc/passwd", exp: Date.now() + 1000 }).replace(/.$/, "A");
    expect((await storageGET(new Request("http://x"), params({ token: forged }))).status).toBe(403);
    const expired = signPayload({ op: "get", k: "whatever", exp: Date.now() - 1 });
    expect((await storageGET(new Request("http://x"), params({ token: expired }))).status).toBe(403);
    const wrongOp = signPayload({ op: "get", k: "whatever", exp: Date.now() + 10000 });
    expect((await storagePUT(new Request("http://x", { method: "PUT", body: "x" }), params({ token: wrongOp }))).status).toBe(403);
  });

  it("blocks executable extensions and content", async () => {
    await rejects(startUpload(owner, ctx.project.slug, { fileName: "flash.exe", size: 10, folderId: null, message: null }), 415);
    await rejects(startUpload(owner, ctx.project.slug, { fileName: "index.html", size: 10, folderId: null, message: null }), 415);
    expect(validateContent("bracket.step", Buffer.from([0x4d, 0x5a, 0x90, 0x00]))).toMatch(/Executable/);
    expect(validateContent("photo.png", Buffer.from("not a png"))).toMatch(/does not match/);
    expect(validateContent("drawing.svg", Buffer.from('<svg onload="alert(1)">'))).toMatch(/scripts/);
    await rejects(putFileFromServer(owner, ctx.project.slug, { path: "/media/photo.png", content: Buffer.from("definitely not a png") }), 415);
  });

  it("enforces plan file size limits and storage quotas", async () => {
    await rejects(startUpload(owner, ctx.project.slug, { fileName: "huge.step", size: 300 * 1024 * 1024, folderId: null, message: null }), 413);
    await db.update(organizations).set({ storageUsedBytes: 2 * 1024 ** 3 - 10 }).where(eq(organizations.id, ctx.org.id));
    await rejects(startUpload(owner, ctx.project.slug, { fileName: "a.step", size: 100, folderId: null, message: null }), 402);
    await db.update(organizations).set({ storageUsedBytes: 0 }).where(eq(organizations.id, ctx.org.id));
  });

  it("creates a new revision when the same path is uploaded again, and skips identical content", async () => {
    const a = await putFileFromServer(owner, ctx.project.slug, { path: "/firmware/main.cpp", content: Buffer.from("int x = 1;\n") });
    const b = await putFileFromServer(owner, ctx.project.slug, { path: "/firmware/main.cpp", content: Buffer.from("int x = 2;\n") });
    expect(b.file.id).toBe(a.file.id);
    expect(b.version!.number).toBe(2);
    const c = await putFileFromServer(owner, ctx.project.slug, { path: "/firmware/main.cpp", content: Buffer.from("int x = 2;\n") });
    expect(c.unchanged).toBe(true);
  });
});
