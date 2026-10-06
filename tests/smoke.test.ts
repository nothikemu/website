import { describe, expect, it } from "vitest";
import { makeOrgWithProject, makeUser } from "./helpers";
import { createIssue, listIssues, updateIssue } from "@/server/services/issues";
import { createTask, updateTask } from "@/server/services/tasks";
import { createRequirement, listRequirements, traceabilityMatrix } from "@/server/services/requirements";
import { createTest, recordRun } from "@/server/services/tests";
import { createDecision } from "@/server/services/decisions";
import { createChange } from "@/server/services/changes";
import { createEntry } from "@/server/services/notebook";
import { createRelease } from "@/server/services/releases";
import { putFileFromServer, diffVersions, getFileDetail } from "@/server/services/files";
import { createSnapshot, restoreSnapshot, getSnapshot } from "@/server/services/snapshots";
import { createMilestone, listMilestones } from "@/server/services/milestones";
import { createComment, listComments } from "@/server/services/comments";
import { projectOverview, personalDashboard } from "@/server/services/dashboard";
import { search } from "@/server/search";
import { askForge } from "@/server/ai/forge";
import { db } from "@/server/db";
import { organizations } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import * as v from "@/lib/validation";

describe("end-to-end service workflow", () => {
  it("runs a realistic engineering workflow", async () => {
    const owner = await makeUser("owner");
    const { org, project } = await makeOrgWithProject(owner);

    const m1 = await createMilestone(owner, project.slug, v.createMilestoneSchema.parse({ title: "Prototype", description: null, dueDate: "2026-12-01" }));
    const req = await createRequirement(owner, project.slug, v.createRequirementSchema.parse({ title: "Carry 20 kg payload", description: "Robot must transport 20 kg.", rationale: null, priority: "must", status: "approved", verificationMethod: "test" }));
    const test = await createTest(owner, project.slug, v.createTestSchema.parse({ name: "Drivetrain load test", criteria: "500 N minimum", expected: "No structural failure", requirements: [req.number] }));
    await recordRun(owner, project.slug, test.number, v.createTestRunSchema.parse({ status: "failed", actual: "Bracket yielded at 410 N", notes: null, measurements: [{ name: "Peak load", value: 410, unit: "N", min: 500 }] }));
    let reqs = await listRequirements(owner, project.slug);
    expect(reqs.requirements[0]!.verification).toBe("failing");

    const issue = await createIssue(owner, project.slug, v.createIssueSchema.parse({ title: "Front bracket yields under load", description: "See TEST-001 and REQ-001", status: "open", priority: "high", labels: ["mechanical"] }));
    const dec = await createDecision(owner, project.slug, v.createDecisionSchema.parse({ title: "Use differential drive", decision: "Differential drive", alternatives: [{ name: "Mecanum", pros: null, cons: null }], status: "accepted", context: null, rationale: "Lower complexity", consequences: null }));
    const chg = await createChange(owner, project.slug, v.createChangeSchema.parse({ title: "Reinforced front mounting bracket", reason: "Bracket failed during load testing (TEST-001)", items: [{ parameter: "thickness", from: "3 mm", to: "5 mm" }], status: "implemented", links: { issues: [issue.number], requirements: [req.number] } }));
    expect(chg.number).toBe(1);
    await recordRun(owner, project.slug, test.number, v.createTestRunSchema.parse({ status: "passed", actual: "No failure at 620 N", measurements: [] }));
    reqs = await listRequirements(owner, project.slug);
    expect(reqs.requirements[0]!.verification).toBe("verified");
    await updateIssue(owner, project.slug, issue.number, { status: "closed" });

    const t = await createTask(owner, project.slug, v.createTaskSchema.parse({ title: "Machine new bracket", status: "todo", priority: "medium", milestoneId: m1.id }));
    await updateTask(owner, project.slug, t.number, { status: "done" });
    const ms = await listMilestones(owner, project.slug);
    expect(ms.milestones[0]!.progress).toBe(1);
    expect(ms.milestones[0]!.status).toBe("closed");

    const f1 = await putFileFromServer(owner, project.slug, { path: "/firmware/main.cpp", content: Buffer.from("int main() {\n  return 0;\n}\n") });
    await putFileFromServer(owner, project.slug, { path: "/firmware/main.cpp", content: Buffer.from("int main() {\n  drive();\n  return 0;\n}\n"), message: "Call drive" });
    const detail = await getFileDetail(owner, project.slug, f1.file.id);
    expect(detail.versions).toHaveLength(2);
    const diff = await diffVersions(owner, project.slug, f1.file.id, detail.versions[1]!.id, detail.versions[0]!.id);
    expect(diff.mode).toBe("text");
    if (diff.mode === "text") expect(diff.stats.added).toBe(1);

    const step = "ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('chassis'),'2;1');\nFILE_NAME('chassis.step','2026-10-01T10:00:00',('Lohitaksh'),('Forge'),'ST-DEVELOPER','SolidWorks 2025','');\nFILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));\nENDSEC;\nDATA;\n#1=MANIFOLD_SOLID_BREP('',#2);\nENDSEC;\nEND-ISO-10303-21;\n";
    const cad = await putFileFromServer(owner, project.slug, { path: "/cad/chassis.step", content: Buffer.from(step) });
    expect(cad.version!.metadata.applicationProtocol).toBe("AP214");

    const s1 = await createSnapshot(owner, project.slug, { name: "Prototype", description: null, tag: null });
    expect(s1.fileCount).toBe(2);
    await putFileFromServer(owner, project.slug, { path: "/cad/chassis.step", content: Buffer.from(step.replace("chassis'),", "chassis v2'),")) });
    const s2 = await createSnapshot(owner, project.slug, { name: "Bracket rev", description: null, tag: null });
    const snap2 = await getSnapshot(owner, project.slug, s2.number);
    expect(snap2.changes.filter((c) => c.status === "modified")).toHaveLength(1);
    const restored = await restoreSnapshot(owner, project.slug, s1.number);
    expect(restored.restored).toBe(1);

    await createEntry(owner, project.slug, v.createNotebookSchema.parse({ title: "Load test day", body: "Tested bracket. See TEST-001.", entryDate: "2026-10-05", tags: ["testing"] }));
    await createComment(owner, project.slug, v.createCommentSchema.parse({ targetType: "issue", targetId: issue.id, body: "Fixed by CHANGE-001" }));
    const cs = await listComments(owner, project.slug, "issue", issue.id);
    expect(cs).toHaveLength(1);

    await db.update(organizations).set({ plan: "pro" }).where(eq(organizations.id, org.id));
    const rel = await createRelease(owner, project.slug, v.createReleaseSchema.parse({ tag: "v0.1", name: "Prototype", notes: null, snapshotId: s1.id, firmwareCommit: null, publish: true }));
    expect(rel.status).toBe("published");
    expect(rel.manifest?.changes).toHaveLength(1);

    const matrix = await traceabilityMatrix(owner, project.slug);
    expect(matrix.rows[0]!.links.length).toBeGreaterThanOrEqual(2);

    const res = await search(owner.id, "bracket");
    expect(res.hits.length).toBeGreaterThan(0);
    const ov = await projectOverview(owner, project.slug);
    expect(ov.counts.files).toBe(2);
    const dash = await personalDashboard(owner);
    expect(dash.projects.length).toBe(1);
    const forge = await askForge(owner, project.slug, "ask", "bracket failure");
    expect(forge.mode).toBe("digest");
    void dec;
    const issues = await listIssues(owner, project.slug, { state: "closed" });
    expect(issues.issues).toHaveLength(1);
  });
});
