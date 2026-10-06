import "server-only";
import { and, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/server/db";
import { comments, links, projectMembers, requirements, testRuns, tests, users } from "@/server/db/schema";
import { requireProject, type Actor, type ProjectAccess } from "@/server/authz";
import { NotFound } from "@/server/http/errors";
import { emit } from "@/server/events";
import { indexDocument, removeDocument } from "@/server/search";
import { formatRef } from "@/lib/refs";
import type { createTestRunSchema, createTestSchema, updateTestSchema } from "@/lib/validation";
import { linksFor, unlinkAll } from "./links";
import { addLink, assertProjectUser, linkMentions, nextNumber, userSummary } from "./shared";
import { filesByIds } from "./files";

export async function listTests(actor: Actor, ref: string, f: { status?: string; q?: string } = {}) {
  const access = await requireProject(actor, ref, "project.read");
  const conds = [eq(tests.projectId, access.project.id)];
  if (f.status) conds.push(eq(tests.status, f.status as "passed"));
  if (f.q) {
    const n = Number(f.q.replace(/^TEST-/i, ""));
    conds.push(or(ilike(tests.name, `%${f.q}%`), Number.isInteger(n) && n > 0 ? eq(tests.number, n) : undefined)!);
  }
  const rows = await db
    .select({
      test: tests,
      owner: userSummary,
      runs: sql<number>`(select count(*)::int from test_runs r where r.test_id = ${tests.id})`,
      reqs: sql<string[]>`coalesce((select array_agg('REQ-' || lpad(rq.number::text, 3, '0') order by rq.number) from links l join requirements rq on rq.id = l.target_id where l.source_type = 'test' and l.source_id = ${tests.id} and l.target_type = 'requirement'), '{}')`,
    })
    .from(tests)
    .leftJoin(users, eq(users.id, tests.ownerId))
    .where(and(...conds))
    .orderBy(desc(tests.number));
  const [counts] = await db
    .select({
      planned: sql<number>`count(*) filter (where ${tests.status} = 'planned')::int`,
      running: sql<number>`count(*) filter (where ${tests.status} = 'running')::int`,
      passed: sql<number>`count(*) filter (where ${tests.status} = 'passed')::int`,
      failed: sql<number>`count(*) filter (where ${tests.status} = 'failed')::int`,
      blocked: sql<number>`count(*) filter (where ${tests.status} = 'blocked')::int`,
    })
    .from(tests)
    .where(eq(tests.projectId, access.project.id));
  return {
    access,
    counts: counts!,
    tests: rows.map((r) => ({ ...r.test, ref: formatRef("test", r.test.number), owner: r.owner?.id ? r.owner : null, runCount: r.runs, requirementRefs: r.reqs })),
  };
}

async function load(access: ProjectAccess, number: number) {
  const [row] = await db.select().from(tests).where(and(eq(tests.projectId, access.project.id), eq(tests.number, number)));
  if (!row) throw NotFound(formatRef("test", number));
  return row;
}

export async function getTest(actor: Actor, ref: string, number: number) {
  const access = await requireProject(actor, ref, "project.read");
  const test = await load(access, number);
  const [runs, linksList, owner] = await Promise.all([
    db
      .select({ run: testRuns, by: userSummary })
      .from(testRuns)
      .leftJoin(users, eq(users.id, testRuns.runBy))
      .where(eq(testRuns.testId, test.id))
      .orderBy(desc(testRuns.number))
      .limit(50),
    linksFor(access.project.id, access.project.slug, { type: "test", id: test.id }),
    test.ownerId ? db.select(userSummary).from(users).where(eq(users.id, test.ownerId)).then((r) => r[0] ?? null) : null,
  ]);
  // Attachments for runs
  const runIds = runs.map((r) => r.run.id);
  const att = runIds.length
    ? await db.select().from(links).where(and(eq(links.sourceType, "test_run"), inArray(links.sourceId, runIds), eq(links.targetType, "file")))
    : [];
  const fileRows = await filesByIds(access.project.id, att.map((a) => a.targetId));
  const fmap = new Map(fileRows.map((f) => [f.id, f]));
  return {
    access,
    test: { ...test, ref: formatRef("test", test.number), owner },
    runs: runs.map((r) => ({
      ...r.run,
      by: r.by?.id ? r.by : null,
      attachments: att.filter((a) => a.sourceId === r.run.id).map((a) => fmap.get(a.targetId)).filter(Boolean) as typeof fileRows,
    })),
    links: linksList,
  };
}

async function index(access: ProjectAccess, t: typeof tests.$inferSelect) {
  await indexDocument({
    organizationId: access.org.id,
    projectId: access.project.id,
    entityType: "test",
    entityId: t.id,
    ref: formatRef("test", t.number),
    title: t.name,
    body: [t.description, t.procedure, t.criteria, t.expected].filter(Boolean).join("\n"),
    url: `/project/${access.project.slug}/tests/${t.number}`,
    meta: { status: t.status },
  });
}

async function linkRequirements(access: ProjectAccess, testId: string, numbers: number[] | undefined, actorId: string) {
  if (!numbers) return;
  await db.delete(links).where(and(eq(links.sourceType, "test"), eq(links.sourceId, testId), eq(links.targetType, "requirement"), eq(links.relation, "verifies")));
  if (!numbers.length) return;
  const reqs = await db.select({ id: requirements.id }).from(requirements).where(and(eq(requirements.projectId, access.project.id), inArray(requirements.number, numbers)));
  for (const r of reqs) await addLink(db, { projectId: access.project.id, sourceType: "test", sourceId: testId, targetType: "requirement", targetId: r.id, relation: "verifies", createdBy: actorId });
}

export async function createTest(actor: Actor, ref: string, input: z.infer<typeof createTestSchema>) {
  const access = await requireProject(actor, ref, "project.write");
  await assertProjectUser(access, input.ownerId);
  const { requirements: reqNumbers, ...fields } = input;
  const test = await db.transaction(async (tx) => {
    const number = await nextNumber(tx, access.project.id, "test");
    const [row] = await tx.insert(tests).values({ ...fields, ownerId: fields.ownerId ?? null, projectId: access.project.id, number, createdBy: actor.id }).returning();
    await linkMentions(tx, access.project.id, { type: "test", id: row!.id }, `${fields.description ?? ""}\n${fields.procedure ?? ""}`, actor.id);
    return row!;
  });
  await linkRequirements(access, test.id, reqNumbers, actor.id);
  await index(access, test);
  await emit({
    type: "test.created",
    actorId: actor.id,
    organizationId: access.org.id,
    projectId: access.project.id,
    target: { type: "test", id: test.id, label: formatRef("test", test.number), title: test.name, url: `/project/${access.project.slug}/tests/${test.number}` },
  });
  return test;
}

export async function updateTest(actor: Actor, ref: string, number: number, input: z.infer<typeof updateTestSchema>) {
  const access = await requireProject(actor, ref, "project.write");
  const before = await load(access, number);
  if (input.ownerId !== undefined) await assertProjectUser(access, input.ownerId);
  const { requirements: reqNumbers, ...fields } = input;
  const [test] = await db.update(tests).set(fields).where(eq(tests.id, before.id)).returning();
  await linkRequirements(access, test!.id, reqNumbers, actor.id);
  await index(access, test!);
  return test!;
}

export async function recordRun(actor: Actor & { displayName?: string }, ref: string, number: number, input: z.infer<typeof createTestRunSchema>) {
  const access = await requireProject(actor, ref, "project.write");
  const test = await load(access, number);
  if (input.attachments?.length) {
    const ok = await filesByIds(access.project.id, input.attachments);
    if (ok.length !== new Set(input.attachments).size) throw NotFound("Attachment");
  }
  const run = await db.transaction(async (tx) => {
    const [max] = await tx.select({ m: sql<number>`coalesce(max(${testRuns.number}), 0)::int` }).from(testRuns).where(eq(testRuns.testId, test.id));
    const runAt = input.runAt ? new Date(input.runAt) : new Date();
    const [row] = await tx
      .insert(testRuns)
      .values({
        testId: test.id,
        projectId: access.project.id,
        number: (max?.m ?? 0) + 1,
        status: input.status,
        actual: input.actual,
        notes: input.notes,
        measurements: input.measurements,
        source: input.source ?? "manual",
        runBy: actor.id,
        runAt,
      })
      .returning();
    // Test status reflects the most recent run.
    const [latest] = await tx.select().from(testRuns).where(eq(testRuns.testId, test.id)).orderBy(desc(testRuns.runAt), desc(testRuns.number)).limit(1);
    await tx.update(tests).set({ status: latest!.status, lastRunAt: latest!.runAt }).where(eq(tests.id, test.id));
    for (const fid of input.attachments ?? [])
      await addLink(tx, { projectId: access.project.id, sourceType: "test_run", sourceId: row!.id, targetType: "file", targetId: fid, relation: "attachment", createdBy: actor.id });
    return row!;
  });
  const r = formatRef("test", test.number);
  let notify: { userId: string; type: string; title: string; body?: string | null }[] = [];
  if (run.status === "failed") {
    const admins = await db.select({ id: projectMembers.userId }).from(projectMembers).where(and(eq(projectMembers.projectId, access.project.id), eq(projectMembers.role, "admin")));
    notify = [...(test.ownerId ? [test.ownerId] : []), ...admins.map((a) => a.id)].map((u) => ({
      userId: u,
      type: "test.failed",
      title: `${r} ${test.name} failed`,
      body: run.actual ?? null,
    }));
  }
  await emit({
    type: `test.${run.status === "passed" ? "passed" : run.status === "failed" ? "failed" : "run_recorded"}`,
    actorId: actor.id,
    organizationId: access.org.id,
    projectId: access.project.id,
    target: { type: "test", id: test.id, label: r, title: test.name, url: `/project/${access.project.slug}/tests/${test.number}` },
    data: { run: run.number, status: run.status, actual: run.actual, source: run.source },
    notify,
  });
  return run;
}

export async function deleteTest(actor: Actor, ref: string, number: number) {
  const access = await requireProject(actor, ref, "project.admin");
  const test = await load(access, number);
  const runIds = (await db.select({ id: testRuns.id }).from(testRuns).where(eq(testRuns.testId, test.id))).map((r) => r.id);
  await db.transaction(async (tx) => {
    if (runIds.length) await tx.delete(links).where(and(eq(links.sourceType, "test_run"), inArray(links.sourceId, runIds)));
    await tx.delete(comments).where(and(eq(comments.targetType, "test"), eq(comments.targetId, test.id)));
    await tx.delete(tests).where(eq(tests.id, test.id));
  });
  await unlinkAll(access.project.id, { type: "test", id: test.id });
  await removeDocument("test", test.id);
  await emit({ type: "test.deleted", actorId: actor.id, organizationId: access.org.id, projectId: access.project.id, target: { type: "test", id: test.id, label: formatRef("test", test.number), title: test.name } });
}

export async function latestRuns(projectId: string, limit = 6) {
  return db
    .select({ run: testRuns, testNumber: tests.number, testName: tests.name, by: userSummary })
    .from(testRuns)
    .innerJoin(tests, eq(tests.id, testRuns.testId))
    .leftJoin(users, eq(users.id, testRuns.runBy))
    .where(eq(testRuns.projectId, projectId))
    .orderBy(desc(testRuns.runAt))
    .limit(limit);
}


