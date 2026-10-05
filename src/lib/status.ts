import type { Tone } from "@/components/ui/badge";

type Meta = { label: string; tone: Tone };

export const ISSUE_STATUS: Record<string, Meta> = {
  open: { label: "Open", tone: "neutral" },
  in_progress: { label: "In progress", tone: "amber" },
  blocked: { label: "Blocked", tone: "red" },
  resolved: { label: "Resolved", tone: "green" },
  closed: { label: "Closed", tone: "violet" },
};
export const TASK_STATUS: Record<string, Meta> = {
  backlog: { label: "Backlog", tone: "neutral" },
  todo: { label: "Todo", tone: "neutral" },
  in_progress: { label: "In progress", tone: "amber" },
  review: { label: "Review", tone: "blue" },
  done: { label: "Done", tone: "green" },
};
export const TEST_STATUS: Record<string, Meta> = {
  planned: { label: "Planned", tone: "neutral" },
  running: { label: "Running", tone: "blue" },
  passed: { label: "Passed", tone: "green" },
  failed: { label: "Failed", tone: "red" },
  blocked: { label: "Blocked", tone: "amber" },
};
export const REQ_STATUS: Record<string, Meta> = {
  draft: { label: "Draft", tone: "neutral" },
  approved: { label: "Approved", tone: "blue" },
  implemented: { label: "Implemented", tone: "violet" },
  verified: { label: "Verified", tone: "green" },
  failed: { label: "Failed", tone: "red" },
  obsolete: { label: "Obsolete", tone: "neutral" },
};
export const VERIFICATION: Record<string, Meta> = {
  verified: { label: "Verified", tone: "green" },
  failing: { label: "Failing", tone: "red" },
  in_progress: { label: "In verification", tone: "amber" },
  untested: { label: "Untested", tone: "neutral" },
  not_applicable: { label: "Non-test method", tone: "blue" },
};
export const DECISION_STATUS: Record<string, Meta> = {
  proposed: { label: "Proposed", tone: "amber" },
  accepted: { label: "Accepted", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
  superseded: { label: "Superseded", tone: "neutral" },
  deprecated: { label: "Deprecated", tone: "neutral" },
};
export const CHANGE_STATUS: Record<string, Meta> = {
  draft: { label: "Draft", tone: "neutral" },
  proposed: { label: "Proposed", tone: "amber" },
  approved: { label: "Approved", tone: "blue" },
  implemented: { label: "Implemented", tone: "violet" },
  verified: { label: "Verified", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
};
export const RELEASE_STATUS: Record<string, Meta> = {
  draft: { label: "Draft", tone: "neutral" },
  published: { label: "Published", tone: "green" },
};
export const PROJECT_STATUS: Record<string, Meta> = {
  planning: { label: "Planning", tone: "blue" },
  active: { label: "Active", tone: "green" },
  paused: { label: "Paused", tone: "amber" },
  completed: { label: "Completed", tone: "violet" },
  archived: { label: "Archived", tone: "neutral" },
};
export const PRIORITY: Record<string, { label: string; rank: number }> = {
  urgent: { label: "Urgent", rank: 0 },
  high: { label: "High", rank: 1 },
  medium: { label: "Medium", rank: 2 },
  low: { label: "Low", rank: 3 },
  none: { label: "No priority", rank: 4 },
};
export const REQ_PRIORITY: Record<string, Meta> = {
  must: { label: "Must", tone: "red" },
  should: { label: "Should", tone: "amber" },
  could: { label: "Could", tone: "blue" },
  wont: { label: "Won't", tone: "neutral" },
};
export const PROJECT_TYPES = ["robotics", "mechanical", "electrical", "software", "aerospace", "research", "other"] as const;
export const ROLE_LABEL: Record<string, string> = { owner: "Owner", admin: "Admin", engineer: "Engineer", viewer: "Viewer" };
