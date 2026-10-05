export const NOTIFICATION_TYPES = [
  { type: "issue.assigned", label: "Issue assigned to you", defaultEmail: true },
  { type: "task.assigned", label: "Task assigned to you", defaultEmail: false },
  { type: "comment.mention", label: "Mentioned in a comment or notebook entry", defaultEmail: true },
  { type: "comment.reply", label: "Replies and comments on things you own", defaultEmail: false },
  { type: "issue.status", label: "Status changes on issues you created or own", defaultEmail: false },
  { type: "file.updated", label: "New revisions of files you uploaded", defaultEmail: false },
  { type: "test.failed", label: "Failed tests you own or in projects you administer", defaultEmail: true },
  { type: "milestone.completed", label: "Milestones completed", defaultEmail: false },
  { type: "org.member", label: "Teammates invited or joining your organizations", defaultEmail: false },
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number]["type"];
