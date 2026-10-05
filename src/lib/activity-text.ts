/** Human phrasing for activity verbs. Shared by the feed UI and channel integrations. */
const PHRASES: Record<string, string> = {
  "org.created": "created the organization",
  "org.member_joined": "joined",
  "project.created": "created project",
  "project.status_changed": "changed the status of",
  "folder.created": "created folder",
  "folder.renamed": "renamed folder",
  "folder.moved": "moved folder",
  "folder.deleted": "deleted folder",
  "file.uploaded": "uploaded",
  "file.revised": "uploaded a new revision of",
  "file.renamed": "renamed",
  "file.moved": "moved",
  "file.deleted": "deleted",
  "file.restored": "restored",
  "file.version_restored": "restored an earlier revision of",
  "snapshot.created": "created",
  "snapshot.restored": "restored the project to",
  "issue.created": "opened",
  "issue.closed": "closed",
  "issue.resolved": "resolved",
  "issue.reopened": "reopened",
  "issue.status_changed": "updated the status of",
  "issue.assigned": "assigned",
  "issue.updated": "updated",
  "issue.deleted": "deleted",
  "task.created": "created",
  "task.completed": "completed",
  "task.moved": "moved",
  "task.deleted": "deleted",
  "milestone.created": "created milestone",
  "milestone.completed": "completed milestone",
  "requirement.created": "added requirement",
  "requirement.updated": "changed",
  "requirement.status_changed": "changed the status of",
  "requirement.deleted": "deleted",
  "test.created": "defined test",
  "test.passed": "passed",
  "test.failed": "recorded a failure on",
  "test.run_recorded": "recorded a run of",
  "test.deleted": "deleted",
  "decision.created": "proposed",
  "decision.accepted": "accepted",
  "decision.rejected": "rejected",
  "decision.superseded": "superseded",
  "decision.deprecated": "deprecated",
  "decision.proposed": "reopened",
  "decision.deleted": "deleted",
  "change.created": "filed engineering change",
  "change.approved": "approved",
  "change.implemented": "implemented",
  "change.verified": "verified",
  "change.rejected": "rejected",
  "change.proposed": "proposed",
  "change.draft": "moved to draft",
  "notebook.entry_created": "wrote notebook entry",
  "notebook.entry_amended": "amended notebook entry",
  "release.published": "published release",
  "comment.created": "commented on",
  "link.created": "linked",
  "repository.linked": "linked repository",
  "repository.synced": "imported commits from",
  "commit.pushed": "pushed",
  "ci.status": "reported CI status for",
  "deployment.reported": "reported a deployment of",
};

export function describeVerb(verb: string, data?: Record<string, unknown> | null): string {
  if (verb === "test.run_recorded" && data?.status) return `marked ${String(data.status)}`;
  return PHRASES[verb] ?? verb.replace(/[._]/g, " ");
}

export type VerbTone = "neutral" | "success" | "danger" | "warning" | "accent";

export function verbTone(verb: string): VerbTone {
  if (verb === "test.failed" || verb.endsWith(".deleted") || verb === "decision.rejected" || verb === "change.rejected") return "danger";
  if (verb === "test.passed" || verb.endsWith(".completed") || verb === "issue.closed" || verb === "issue.resolved" || verb === "change.verified" || verb === "decision.accepted") return "success";
  if (verb === "release.published" || verb === "snapshot.created") return "accent";
  if (verb.includes("blocked")) return "warning";
  return "neutral";
}
