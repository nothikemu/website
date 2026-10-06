/**
 * Input schemas shared by the API layer (authoritative validation) and client
 * forms (early feedback). The server never relies on client-side validation.
 */
import { z } from "zod";

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));
const uuid = z.string().uuid();
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .optional()
  .nullable()
  .transform((v) => v || null);

export const RESERVED_SLUGS = new Set([
  "admin", "api", "app", "auth", "dashboard", "docs", "help", "login", "logout", "new", "org", "organizations",
  "project", "projects", "settings", "signup", "static", "support", "www", "forgebase", "system", "invite",
]);

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "At least 2 characters")
  .max(48, "At most 48 characters")
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Lowercase letters, numbers and dashes only")
  .refine((s) => !RESERVED_SLUGS.has(s), "This name is reserved");

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "At least 2 characters")
  .max(39, "At most 39 characters")
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Lowercase letters, numbers and dashes only")
  .refine((s) => !RESERVED_SLUGS.has(s), "This username is reserved");

export const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email").max(254);

export const passwordSchema = z
  .string()
  .min(10, "Use at least 10 characters")
  .max(200, "Password is too long")
  .refine((p) => /[a-zA-Z]/.test(p) && /[0-9\W_]/.test(p), "Mix letters with numbers or symbols");

// ─── Auth ──────────────────────────────────────────────────────────────────
export const signupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: trimmed(80).min(1, "Enter your name"),
  username: usernameSchema,
});
export const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(200) });
export const forgotPasswordSchema = z.object({ email: emailSchema });
export const resetPasswordSchema = z.object({ token: z.string().min(10).max(200), password: passwordSchema });
export const changePasswordSchema = z.object({
  currentPassword: z.string().max(200).optional(),
  newPassword: passwordSchema,
});
export const deleteAccountSchema = z.object({ confirm: z.string(), password: z.string().max(200).optional() });

export const profileSchema = z.object({
  displayName: trimmed(80).min(1),
  username: usernameSchema,
  bio: optionalText(500),
  company: optionalText(120),
  location: optionalText(120),
  website: z
    .string()
    .trim()
    .max(200)
    .optional()
    .nullable()
    .transform((v) => v || null)
    .refine((v) => !v || /^https?:\/\/[^\s]+$/i.test(v), "Must start with http:// or https://"),
  timezone: trimmed(64).refine((tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown timezone"),
  avatarUrl: z
    .string()
    .trim()
    .max(500)
    .optional()
    .nullable()
    .transform((v) => v || null)
    .refine((v) => !v || /^https:\/\//.test(v) || v.startsWith("/api/"), "Avatar must be an https URL"),
});

export const apiTokenSchema = z.object({
  name: trimmed(60).min(1),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
});

// ─── Organizations ─────────────────────────────────────────────────────────
export const orgRoleSchema = z.enum(["owner", "admin", "engineer", "viewer"]);
export const createOrgSchema = z.object({
  name: trimmed(80).min(2, "At least 2 characters"),
  slug: slugSchema,
  description: optionalText(500),
});
export const updateOrgSchema = z.object({
  name: trimmed(80).min(2).optional(),
  slug: slugSchema.optional(),
  description: optionalText(500),
  website: optionalText(200),
});
export const inviteSchema = z.object({
  emails: z.array(emailSchema).min(1).max(20),
  role: z.enum(["admin", "engineer", "viewer"]),
});
export const updateMemberSchema = z.object({ role: orgRoleSchema });

// ─── Projects ──────────────────────────────────────────────────────────────
export const projectTypeSchema = z.enum(["robotics", "mechanical", "electrical", "software", "aerospace", "research", "other"]);
export const projectStatusSchema = z.enum(["planning", "active", "paused", "completed", "archived"]);
export const createProjectSchema = z.object({
  organization: z.string().min(1).max(64),
  name: trimmed(100).min(2),
  slug: slugSchema.optional(),
  description: optionalText(2000),
  type: projectTypeSchema.default("robotics"),
  visibility: z.enum(["organization", "private"]).default("organization"),
  scaffold: z.boolean().default(true),
});
export const updateProjectSchema = z.object({
  name: trimmed(100).min(2).optional(),
  description: optionalText(2000),
  type: projectTypeSchema.optional(),
  status: projectStatusSchema.optional(),
  visibility: z.enum(["organization", "private"]).optional(),
  repository: z
    .string()
    .trim()
    .max(140)
    .optional()
    .nullable()
    .transform((v) => v || null)
    .refine((v) => !v || /^[\w.-]+\/[\w.-]+$/.test(v), "Use owner/repository"),
});
export const projectMemberSchema = z.object({ userId: uuid, role: z.enum(["admin", "engineer", "viewer"]) });

// ─── Files ─────────────────────────────────────────────────────────────────
export const fileNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(255)
  .refine((n) => !/[/\\\u0000-\u001f]/.test(n) && n !== "." && n !== "..", "Invalid file name");
export const createFolderSchema = z.object({ name: fileNameSchema, parentId: uuid.nullable().optional() });
export const updateFolderSchema = z.object({ name: fileNameSchema.optional(), parentId: uuid.nullable().optional() });
export const startUploadSchema = z.object({
  fileName: fileNameSchema,
  size: z.number().int().min(0),
  contentType: z.string().max(200).optional(),
  folderId: uuid.nullable().optional(),
  /** Upload a new revision of an existing file. */
  fileId: uuid.optional(),
  message: optionalText(500),
});
export const completeUploadSchema = z.object({
  parts: z.array(z.object({ partNumber: z.number().int().min(1).max(10000), etag: z.string().max(200) })).optional(),
});
export const updateFileSchema = z.object({
  name: fileNameSchema.optional(),
  folderId: uuid.nullable().optional(),
  description: optionalText(2000),
});
export const restoreVersionSchema = z.object({ versionId: uuid, message: optionalText(500) });
export const createSnapshotSchema = z.object({ name: trimmed(120).min(1), description: optionalText(5000), tag: optionalText(40) });

// ─── Planning ──────────────────────────────────────────────────────────────
export const prioritySchema = z.enum(["none", "low", "medium", "high", "urgent"]);
export const issueStatusSchema = z.enum(["open", "in_progress", "blocked", "resolved", "closed"]);
export const taskStatusSchema = z.enum(["backlog", "todo", "in_progress", "review", "done"]);

const linkTargets = z
  .object({
    requirements: z.array(z.number().int().positive()).max(50).optional(),
    tests: z.array(z.number().int().positive()).max(50).optional(),
    decisions: z.array(z.number().int().positive()).max(50).optional(),
    issues: z.array(z.number().int().positive()).max(50).optional(),
    files: z.array(uuid).max(50).optional(),
  })
  .optional();

export const createIssueSchema = z.object({
  title: trimmed(200).min(1, "Title is required"),
  description: optionalText(50000),
  status: issueStatusSchema.default("open"),
  priority: prioritySchema.default("none"),
  assigneeId: uuid.nullable().optional(),
  milestoneId: uuid.nullable().optional(),
  labels: z.array(trimmed(40).min(1)).max(10).optional(),
  links: linkTargets,
});
export const updateIssueSchema = createIssueSchema.partial().extend({ title: trimmed(200).min(1).optional() });

export const createTaskSchema = z.object({
  title: trimmed(200).min(1, "Title is required"),
  description: optionalText(50000),
  status: taskStatusSchema.default("todo"),
  priority: prioritySchema.default("none"),
  assigneeId: uuid.nullable().optional(),
  milestoneId: uuid.nullable().optional(),
  parentId: uuid.nullable().optional(),
  dueDate: isoDate,
  labels: z.array(trimmed(40).min(1)).max(10).optional(),
  dependsOn: z.array(z.number().int().positive()).max(20).optional(),
});
export const updateTaskSchema = createTaskSchema.partial().extend({ sortOrder: z.number().int().optional() });

export const createMilestoneSchema = z.object({
  title: trimmed(120).min(1),
  description: optionalText(5000),
  dueDate: isoDate,
});
export const updateMilestoneSchema = createMilestoneSchema.partial().extend({ status: z.enum(["open", "closed"]).optional() });

// ─── Systems engineering ───────────────────────────────────────────────────
export const createRequirementSchema = z.object({
  title: trimmed(300).min(1),
  description: optionalText(20000),
  rationale: optionalText(5000),
  priority: z.enum(["must", "should", "could", "wont"]).default("should"),
  status: z.enum(["draft", "approved", "implemented", "verified", "failed", "obsolete"]).default("draft"),
  verificationMethod: z.enum(["test", "analysis", "inspection", "demonstration"]).default("test"),
  ownerId: uuid.nullable().optional(),
  parentId: uuid.nullable().optional(),
});
export const updateRequirementSchema = createRequirementSchema.partial();

export const testStatusSchema = z.enum(["planned", "running", "passed", "failed", "blocked"]);
export const measurementSchema = z.object({
  name: trimmed(80).min(1),
  value: z.number().finite(),
  unit: trimmed(20),
  min: z.number().finite().nullable().optional(),
  max: z.number().finite().nullable().optional(),
});
export const createTestSchema = z.object({
  name: trimmed(200).min(1),
  description: optionalText(20000),
  procedure: optionalText(20000),
  criteria: optionalText(1000),
  expected: optionalText(2000),
  ownerId: uuid.nullable().optional(),
  requirements: z.array(z.number().int().positive()).max(50).optional(),
});
export const updateTestSchema = createTestSchema.partial().extend({ status: testStatusSchema.optional() });
export const createTestRunSchema = z.object({
  status: testStatusSchema,
  actual: optionalText(5000),
  notes: optionalText(20000),
  measurements: z.array(measurementSchema).max(100).default([]),
  runAt: z.string().datetime().optional(),
  attachments: z.array(uuid).max(20).optional(),
  source: trimmed(60).optional(),
});

export const decisionStatusSchema = z.enum(["proposed", "accepted", "rejected", "superseded", "deprecated"]);
export const createDecisionSchema = z.object({
  title: trimmed(200).min(1),
  context: optionalText(20000),
  decision: trimmed(5000).min(1, "State the decision"),
  alternatives: z
    .array(z.object({ name: trimmed(120).min(1), pros: optionalText(2000), cons: optionalText(2000), chosen: z.boolean().optional() }))
    .max(12)
    .default([]),
  rationale: optionalText(20000),
  consequences: optionalText(20000),
  status: decisionStatusSchema.default("proposed"),
  ownerId: uuid.nullable().optional(),
  supersedes: z.number().int().positive().optional(),
});
export const updateDecisionSchema = createDecisionSchema.partial();

export const changeStatusSchema = z.enum(["draft", "proposed", "approved", "implemented", "verified", "rejected"]);
export const createChangeSchema = z.object({
  title: trimmed(200).min(1),
  reason: trimmed(5000).min(1, "Explain why the change is needed"),
  description: optionalText(20000),
  items: z.array(z.object({ parameter: trimmed(120).min(1), from: trimmed(200), to: trimmed(200) })).max(50).default([]),
  result: optionalText(5000),
  status: changeStatusSchema.default("proposed"),
  links: linkTargets,
});
export const updateChangeSchema = createChangeSchema.partial();

export const createNotebookSchema = z.object({
  title: trimmed(200).min(1),
  body: z.string().max(100000).min(1, "Write something"),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tags: z.array(trimmed(32).min(1).toLowerCase()).max(12).default([]),
});
export const updateNotebookSchema = z.object({
  title: trimmed(200).min(1).optional(),
  body: z.string().max(100000).min(1).optional(),
  tags: z.array(trimmed(32).min(1).toLowerCase()).max(12).optional(),
});

export const createReleaseSchema = z.object({
  tag: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[\w.+-]+$/, "Letters, numbers, dots and dashes"),
  name: trimmed(120).min(1),
  notes: optionalText(50000),
  snapshotId: uuid.nullable().optional(),
  firmwareCommit: optionalText(64),
  publish: z.boolean().default(false),
});
export const updateReleaseSchema = createReleaseSchema.partial();

// ─── Collaboration ─────────────────────────────────────────────────────────
export const commentTargetSchema = z.enum([
  "issue", "task", "requirement", "test", "decision", "change", "notebook_entry", "release", "file", "snapshot",
]);
export const createCommentSchema = z.object({
  targetType: commentTargetSchema,
  targetId: uuid,
  parentId: uuid.nullable().optional(),
  body: z.string().trim().min(1).max(20000),
  attachments: z.array(uuid).max(10).optional(),
});
export const updateCommentSchema = z.object({ body: z.string().trim().min(1).max(20000) });
export const reactionSchema = z.object({ emoji: z.enum(["👍", "👎", "🎉", "🚀", "👀", "⚠️", "✅"]) });

export const linkSchema = z.object({
  sourceType: z.string(),
  sourceId: uuid,
  targetRef: z.string().trim().max(40).optional(),
  targetType: z.string().optional(),
  targetId: uuid.optional(),
  relation: z.enum(["references", "verifies", "implements", "fixes", "blocks", "derived_from", "affects", "attachment"]).default("references"),
});

export const searchQuerySchema = z.object({
  q: z.string().max(200).default(""),
  project: z.string().max(64).optional(),
  type: z.string().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const paginationSchema = z.object({
  cursor: z.string().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const notificationPrefsSchema = z.object({
  preferences: z.array(z.object({ type: z.string().max(40), inApp: z.boolean(), email: z.boolean() })).max(30),
});

export const integrationSchema = z.object({
  provider: z.enum(["github", "discord", "slack", "google_drive"]),
  projectId: uuid.nullable().optional(),
  repository: z.string().trim().max(140).regex(/^[\w.-]+\/[\w.-]+$/, "Use owner/repository").optional(),
  webhookUrl: z.string().trim().url().max(500).optional(),
  events: z.array(z.string().max(60)).max(30).optional(),
});

export const webhookEndpointSchema = z.object({
  kind: z.enum(["github", "generic"]),
  description: optionalText(200),
});

export const aiAskSchema = z.object({
  question: z.string().trim().min(1).max(2000),
  action: z
    .enum(["ask", "summarize_activity", "summarize_decisions", "failing_requirements", "test_failures", "release_notes", "unresolved_issues"])
    .default("ask"),
});
