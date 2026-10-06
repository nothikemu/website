import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { decisions, issues, testRuns, tests } from "@/server/db/schema";
import { requireProject, type Actor, type ProjectAccess } from "@/server/authz";
import { PlanLimit } from "@/server/http/errors";
import { search } from "@/server/search";
import { projectActivity } from "@/server/services/activity";
import { listRequirements } from "@/server/services/requirements";
import { draftNotes } from "@/server/services/releases";
import { formatRef } from "@/lib/refs";
import { describeVerb } from "@/lib/activity-text";
import { PLANS } from "@/lib/plans";
import { captureError } from "@/server/observability/error-tracker";
import { aiProvider } from "./providers";

/**
 * Forge — the project-aware assistant. Retrieval first: every answer is built
 * from a context pack assembled from the project's own records, and the model
 * is instructed to answer only from it and cite references. With no provider
 * configured, Forge returns the retrieved context as a structured digest.
 */
export type ForgeAction =
  | "ask"
  | "summarize_activity"
  | "summarize_decisions"
  | "failing_requirements"
  | "test_failures"
  | "release_notes"
  | "unresolved_issues";

export type ForgeSource = { ref: string; title: string; url: string };
export type ForgeAnswer = { answer: string; sources: ForgeSource[]; mode: "ai" | "digest"; provider?: string; model?: string; note?: string };

type Pack = { heading: string; lines: string[]; sources: ForgeSource[] };

async function pack(access: ProjectAccess, actor: Actor, action: ForgeAction, question: string): Promise<Pack> {
  const p = access.project;
  const base = `/project/${p.slug}`;
  switch (action) {
    case "summarize_activity": {
      const { items } = await projectActivity(actor, p.id, { limit: 60 });
      return {
        heading: "Recent project activity (newest first)",
        lines: items.map((a) => `${a.createdAt.toISOString().slice(0, 16).replace("T", " ")} — ${a.actor?.displayName ?? "System"} ${describeVerb(a.verb, a.metadata)} ${a.targetLabel ?? ""}${a.targetTitle && a.targetTitle !== a.targetLabel ? ` (${a.targetTitle})` : ""}`),
        sources: [],
      };
    }
    case "summarize_decisions": {
      const rows = await db.select().from(decisions).where(eq(decisions.projectId, p.id)).orderBy(desc(decisions.number)).limit(40);
      return {
        heading: "Engineering decisions",
        lines: rows.map((d) => `${formatRef("decision", d.number)} [${d.status}] ${d.title}. Decision: ${d.decision}. Alternatives: ${d.alternatives.map((a) => a.name).join(", ") || "none recorded"}. Rationale: ${d.rationale ?? "—"}`),
        sources: rows.map((d) => ({ ref: formatRef("decision", d.number), title: d.title, url: `${base}/decisions/${d.number}` })),
      };
    }
    case "failing_requirements": {
      const { requirements } = await listRequirements(actor, p.id);
      const bad = requirements.filter((r) => r.verification === "failing" || r.verification === "untested");
      const testIds = await db.select({ id: tests.id, number: tests.number }).from(tests).where(and(eq(tests.projectId, p.id), eq(tests.status, "failed")));
      const runs = testIds.length
        ? await db.select({ run: testRuns, number: tests.number }).from(testRuns).innerJoin(tests, eq(tests.id, testRuns.testId)).where(inArray(testRuns.testId, testIds.map((t) => t.id))).orderBy(desc(testRuns.runAt)).limit(20)
        : [];
      return {
        heading: "Requirements not currently verified, with linked tests and latest failed runs",
        lines: [
          ...bad.map((r) => `${r.ref} [${r.verification}] ${r.title} — linked tests: ${r.tests.map((t) => `${t.ref} (${t.status})`).join(", ") || "none"}`),
          ...runs.map((r) => `${formatRef("test", r.number)} run #${r.run.number} ${r.run.status}: actual="${r.run.actual ?? ""}" notes="${(r.run.notes ?? "").slice(0, 300)}" measurements=${JSON.stringify(r.run.measurements)}`),
        ],
        sources: bad.map((r) => ({ ref: r.ref, title: r.title, url: `${base}/requirements/${r.number}` })),
      };
    }
    case "test_failures": {
      const rows = await db
        .select({ run: testRuns, test: tests })
        .from(testRuns)
        .innerJoin(tests, eq(tests.id, testRuns.testId))
        .where(and(eq(testRuns.projectId, p.id), eq(testRuns.status, "failed")))
        .orderBy(desc(testRuns.runAt))
        .limit(25);
      return {
        heading: "Failed test runs",
        lines: rows.map((r) => `${formatRef("test", r.test.number)} ${r.test.name} — run #${r.run.number} on ${r.run.runAt.toISOString().slice(0, 10)}. Criteria: ${r.test.criteria ?? "—"}. Actual: ${r.run.actual ?? "—"}. Notes: ${(r.run.notes ?? "").slice(0, 400)}. Measurements: ${r.run.measurements.map((m) => `${m.name}=${m.value}${m.unit}`).join(", ")}`),
        sources: [...new Map(rows.map((r) => [r.test.id, { ref: formatRef("test", r.test.number), title: r.test.name, url: `${base}/tests/${r.test.number}` }])).values()],
      };
    }
    case "release_notes": {
      const d = await draftNotes(actor, p.id, {});
      return { heading: `Project changes since ${d.since?.tag ?? "the beginning"}`, lines: d.notes.split("\n"), sources: [] };
    }
    case "unresolved_issues": {
      const rows = await db.select().from(issues).where(and(eq(issues.projectId, p.id), inArray(issues.status, ["open", "in_progress", "blocked"]))).orderBy(desc(issues.updatedAt)).limit(40);
      return {
        heading: "Unresolved issues",
        lines: rows.map((i) => `${formatRef("issue", i.number)} [${i.status}, ${i.priority}] ${i.title}${i.description ? ` — ${i.description.slice(0, 240)}` : ""}`),
        sources: rows.slice(0, 15).map((i) => ({ ref: formatRef("issue", i.number), title: i.title, url: `${base}/issues/${i.number}` })),
      };
    }
    default: {
      const { hits } = await search(actor.id, question, { projectId: p.id, limit: 14 });
      return {
        heading: `Project records matching the question`,
        lines: hits.map((h) => `${h.ref ?? h.entityType} — ${h.title}${h.snippet ? `: ${h.snippet.replace(/<<|>>/g, "")}` : ""}`),
        sources: hits.map((h) => ({ ref: h.ref ?? h.entityType, title: h.title, url: h.url })),
      };
    }
  }
}

const SYSTEM = `You are Forge, the engineering assistant inside Forgebase, a workspace for robotics and hardware teams.
Rules:
- Answer ONLY from the PROJECT CONTEXT provided. If the context does not contain the answer, say so plainly and suggest where the team should record it.
- Cite artifacts by their reference (e.g. REQ-004, TEST-012, DEC-003, ISS-021, CHANGE-007) inline.
- Be concise and technical. Use short paragraphs or bullet lists. Preserve units and numbers exactly.
- Never invent measurements, results, people, or references.`;

export async function askForge(actor: Actor, ref: string, action: ForgeAction, question: string): Promise<ForgeAnswer> {
  const access = await requireProject(actor, ref, "project.read");
  if (!PLANS[access.org.plan].ai) throw PlanLimit("Forge is available on the Pro and Enterprise plans");
  const ctx = await pack(access, actor, action, question);
  const provider = aiProvider();
  const digest = ctx.lines.length ? `**${ctx.heading}**\n\n${ctx.lines.map((l) => (l.startsWith("#") || l.startsWith("-") || !l ? l : `- ${l}`)).join("\n")}` : "No matching project records were found.";
  if (!provider) {
    return { answer: digest, sources: ctx.sources, mode: "digest", note: "No AI provider is configured (AI_PROVIDER). Showing the project data Forge would reason over." };
  }
  const prompt = action === "ask" ? question : {
    summarize_activity: "Summarize what the team has accomplished recently and what changed, grouped by area.",
    summarize_decisions: "Summarize the key engineering decisions, what was chosen over what, and why.",
    failing_requirements: "Explain which requirements are failing or unverified, why (based on test evidence), and what should happen next.",
    test_failures: "Summarize the test failures, common causes visible in the data, and which tests need re-running.",
    release_notes: "Write concise, well-structured release notes for the next release from these changes.",
    unresolved_issues: "Identify the most important unresolved issues and any that look blocked or stale.",
  }[action];
  try {
    const res = await provider.complete({
      system: SYSTEM,
      messages: [{ role: "user", content: `PROJECT: ${access.project.name} (${access.project.type})\n\nPROJECT CONTEXT — ${ctx.heading}:\n${ctx.lines.join("\n").slice(0, 24000)}\n\nREQUEST: ${prompt}` }],
    });
    return { answer: res.text || digest, sources: ctx.sources, mode: "ai", provider: res.provider, model: res.model };
  } catch (err) {
    captureError(err, { feature: "forge" });
    return { answer: digest, sources: ctx.sources, mode: "digest", note: "The AI provider could not be reached. Showing the retrieved project data instead." };
  }
}

export function forgeStatus() {
  const p = aiProvider();
  return p ? { enabled: true, provider: p.name, model: p.model } : { enabled: false, provider: null, model: null };
}
