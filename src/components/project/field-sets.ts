import type { FieldDef, Person } from "@/components/forms/resource-form";
import { CHANGE_STATUS, DECISION_STATUS, ISSUE_STATUS, PRIORITY, REQ_PRIORITY, REQ_STATUS, TASK_STATUS } from "@/lib/status";

const opts = (m: Record<string, { label: string }>) => Object.entries(m).map(([value, v]) => ({ value, label: v.label }));
type MS = { id: string; number: number; title: string };
const msOpts = (ms: MS[]) => [{ value: "", label: "No milestone" }, ...ms.map((m) => ({ value: m.id, label: `M${m.number} — ${m.title}` }))];

export function issueFields(people: Person[], ms: MS[], create: boolean): FieldDef[] {
  return [
    { name: "title", label: "Title", type: "text", required: true, placeholder: "Front mounting bracket yields under 400 N load", span: 2 },
    { name: "description", label: "Description", type: "markdown", rows: 8, placeholder: "What happened? Steps, measurements, photos. Reference TEST-003, REQ-001…" },
    { name: "status", label: "Status", type: "select", options: opts(ISSUE_STATUS) },
    { name: "priority", label: "Priority", type: "select", options: opts(PRIORITY) },
    { name: "assigneeId", label: "Assignee", type: "person", people },
    { name: "milestoneId", label: "Milestone", type: "select", options: msOpts(ms) },
    { name: "labels", label: "Labels", type: "tags", placeholder: "mechanical, safety" },
    ...(create
      ? ([
          { name: "links.requirements", label: "Affected requirements", type: "refs", prefix: "REQ" },
          { name: "links.tests", label: "Related tests", type: "refs", prefix: "TEST" },
          { name: "links.decisions", label: "Related decisions", type: "refs", prefix: "DEC" },
        ] as FieldDef[])
      : []),
  ];
}

export function taskFields(people: Person[], ms: MS[]): FieldDef[] {
  return [
    { name: "title", label: "Title", type: "text", required: true, placeholder: "Machine replacement bracket from 6061-T6", span: 2 },
    { name: "description", label: "Description", type: "markdown", rows: 6 },
    { name: "status", label: "Status", type: "select", options: opts(TASK_STATUS) },
    { name: "priority", label: "Priority", type: "select", options: opts(PRIORITY) },
    { name: "assigneeId", label: "Assignee", type: "person", people },
    { name: "dueDate", label: "Due date", type: "date" },
    { name: "milestoneId", label: "Milestone", type: "select", options: msOpts(ms) },
    { name: "labels", label: "Labels", type: "tags" },
    { name: "dependsOn", label: "Depends on", type: "refs", prefix: "TASK", hint: "Tasks that must be done first" },
  ];
}

export function requirementFields(people: Person[]): FieldDef[] {
  return [
    { name: "title", label: "Requirement", type: "text", required: true, placeholder: "The robot shall transport a 20 kg payload.", span: 2 },
    { name: "description", label: "Details", type: "markdown", rows: 5, placeholder: "Conditions, tolerances, acceptance criteria." },
    { name: "rationale", label: "Rationale", type: "markdown", rows: 3, placeholder: "Why is this required? Source (customer, rulebook, safety)…" },
    { name: "priority", label: "Priority (MoSCoW)", type: "select", options: opts(REQ_PRIORITY) },
    { name: "status", label: "Status", type: "select", options: opts(REQ_STATUS) },
    { name: "verificationMethod", label: "Verification method", type: "select", options: [ { value: "test", label: "Test" }, { value: "analysis", label: "Analysis" }, { value: "inspection", label: "Inspection" }, { value: "demonstration", label: "Demonstration" } ] },
    { name: "ownerId", label: "Owner", type: "person", people },
  ];
}

export function testFields(people: Person[]): FieldDef[] {
  return [
    { name: "name", label: "Test name", type: "text", required: true, placeholder: "Drivetrain load test", span: 2 },
    { name: "criteria", label: "Requirement / criterion", type: "text", placeholder: "500 N minimum", mono: true },
    { name: "expected", label: "Expected result", type: "text", placeholder: "No structural failure" },
    { name: "requirements", label: "Verifies requirements", type: "refs", prefix: "REQ" },
    { name: "ownerId", label: "Owner", type: "person", people },
    { name: "description", label: "Purpose", type: "markdown", rows: 3 },
    { name: "procedure", label: "Procedure", type: "markdown", rows: 6, placeholder: "1. Mount chassis on test stand\n2. Apply load in 50 N increments…" },
  ];
}

export function decisionFields(people: Person[]): FieldDef[] {
  return [
    { name: "title", label: "Title", type: "text", required: true, placeholder: "Drive architecture", span: 2 },
    { name: "decision", label: "Decision", type: "text", required: true, placeholder: "Use differential drive.", span: 2 },
    { name: "context", label: "Context", type: "markdown", rows: 4, placeholder: "What problem forced a decision? Constraints?" },
    { name: "alternatives", label: "Alternatives considered", type: "alternatives" },
    { name: "rationale", label: "Rationale", type: "markdown", rows: 4 },
    { name: "consequences", label: "Consequences", type: "markdown", rows: 3, placeholder: "Trade-offs accepted, follow-up work…" },
    { name: "status", label: "Status", type: "select", options: opts(DECISION_STATUS) },
    { name: "ownerId", label: "Decision owner", type: "person", people },
  ];
}

export function changeFields(create: boolean): FieldDef[] {
  return [
    { name: "title", label: "Title", type: "text", required: true, placeholder: "Reinforced front mounting bracket", span: 2 },
    { name: "reason", label: "Reason", type: "text", required: true, placeholder: "Bracket failed during load testing (TEST-003).", span: 2 },
    { name: "items", label: "Changes", type: "changeItems", hint: "Parameter-level changes, e.g. thickness 3 mm → 5 mm" },
    { name: "description", label: "Description", type: "markdown", rows: 4 },
    { name: "result", label: "Result", type: "markdown", rows: 3, placeholder: "Outcome after implementation — e.g. passed subsequent test." },
    { name: "status", label: "Status", type: "select", options: opts(CHANGE_STATUS) },
    ...(create
      ? ([
          { name: "links.issues", label: "Fixes issues", type: "refs", prefix: "ISS" },
          { name: "links.requirements", label: "Affected requirements", type: "refs", prefix: "REQ" },
          { name: "links.tests", label: "Verified by tests", type: "refs", prefix: "TEST" },
          { name: "links.decisions", label: "Related decisions", type: "refs", prefix: "DEC" },
        ] as FieldDef[])
      : []),
  ];
}
