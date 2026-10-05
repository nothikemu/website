/**
 * Forgebase database schema (PostgreSQL, Drizzle ORM).
 *
 * Conventions
 *  - UUID primary keys, `created_at` / `updated_at` timestamptz on every mutable table.
 *  - Every project-scoped table carries `project_id` with an index; all reads are
 *    filtered by an *authorized* project id (see src/server/authz).
 *  - Authorship columns use ON DELETE SET NULL so engineering history survives
 *    account deletion.
 *  - Large binary content never lives here: files point at object-storage keys.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ─── Enums ──────────────────────────────────────────────────────────────────
export const orgRole = pgEnum("org_role", ["owner", "admin", "engineer", "viewer"]);
export const projectRole = pgEnum("project_role", ["admin", "engineer", "viewer"]);
export const plan = pgEnum("plan", ["free", "team", "pro", "enterprise"]);
export const projectType = pgEnum("project_type", [
  "robotics",
  "mechanical",
  "electrical",
  "software",
  "aerospace",
  "research",
  "other",
]);
export const projectStatus = pgEnum("project_status", ["planning", "active", "paused", "completed", "archived"]);
export const projectVisibility = pgEnum("project_visibility", ["organization", "private"]);
export const priority = pgEnum("priority", ["none", "low", "medium", "high", "urgent"]);
export const issueStatus = pgEnum("issue_status", ["open", "in_progress", "blocked", "resolved", "closed"]);
export const taskStatus = pgEnum("task_status", ["backlog", "todo", "in_progress", "review", "done"]);
export const milestoneStatus = pgEnum("milestone_status", ["open", "closed"]);
export const requirementStatus = pgEnum("requirement_status", [
  "draft",
  "approved",
  "implemented",
  "verified",
  "failed",
  "obsolete",
]);
export const requirementPriority = pgEnum("requirement_priority", ["must", "should", "could", "wont"]);
export const verificationMethod = pgEnum("verification_method", [
  "test",
  "analysis",
  "inspection",
  "demonstration",
]);
export const testStatus = pgEnum("test_status", ["planned", "running", "passed", "failed", "blocked"]);
export const decisionStatus = pgEnum("decision_status", [
  "proposed",
  "accepted",
  "rejected",
  "superseded",
  "deprecated",
]);
export const changeStatus = pgEnum("change_status", [
  "draft",
  "proposed",
  "approved",
  "implemented",
  "verified",
  "rejected",
]);
export const releaseStatus = pgEnum("release_status", ["draft", "published"]);
export const tokenPurpose = pgEnum("token_purpose", ["email_verification", "password_reset", "email_change"]);
export const integrationProvider = pgEnum("integration_provider", ["github", "discord", "slack", "google_drive"]);
export const uploadStatus = pgEnum("upload_status", ["pending", "completed", "aborted"]);
export const entityType = pgEnum("entity_type", [
  "project",
  "file",
  "folder",
  "snapshot",
  "issue",
  "task",
  "milestone",
  "requirement",
  "test",
  "test_run",
  "decision",
  "change",
  "notebook_entry",
  "release",
  "commit",
  "comment",
  "user",
  "organization",
]);

// ─── Identity ───────────────────────────────────────────────────────────────
export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    passwordHash: text("password_hash"),
    username: text("username").notNull(),
    displayName: text("display_name").notNull(),
    avatarUrl: text("avatar_url"),
    bio: text("bio"),
    company: text("company"),
    location: text("location"),
    website: text("website"),
    timezone: text("timezone").notNull().default("UTC"),
    isDemo: boolean("is_demo").notNull().default(false),
    lastActiveOrgId: uuid("last_active_org_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_key").on(t.email), uniqueIndex("users_username_key").on(t.username)],
);

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 of the session token. The raw token only ever lives in the cookie. */
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    providerLogin: text("provider_login"),
    /** AES-256-GCM encrypted access token (see server/crypto). */
    accessTokenEnc: text("access_token_enc"),
    scope: text("scope"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("oauth_provider_account_key").on(t.provider, t.providerAccountId),
    uniqueIndex("oauth_user_provider_key").on(t.userId, t.provider),
  ],
);

export const authTokens = pgTable(
  "auth_tokens",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: tokenPurpose("purpose").notNull(),
    tokenHash: text("token_hash").notNull(),
    data: jsonb("data").$type<Record<string, string>>(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("auth_tokens_hash_key").on(t.tokenHash), index("auth_tokens_user_idx").on(t.userId)],
);

export const apiTokens = pgTable(
  "api_tokens",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    prefix: text("prefix").notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("api_tokens_hash_key").on(t.tokenHash), index("api_tokens_user_idx").on(t.userId)],
);

// ─── Organizations ──────────────────────────────────────────────────────────
export const organizations = pgTable(
  "organizations",
  {
    id: id(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    website: text("website"),
    plan: plan("plan").notNull().default("free"),
    /** Billing hooks: populated once a payment provider is wired in. */
    billingCustomerId: text("billing_customer_id"),
    billingSubscriptionId: text("billing_subscription_id"),
    storageUsedBytes: bigint("storage_used_bytes", { mode: "number" }).notNull().default(0),
    isDemo: boolean("is_demo").notNull().default(false),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("organizations_slug_key").on(t.slug)],
);

export const organizationMembers = pgTable(
  "organization_members",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: orgRole("role").notNull().default("engineer"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("org_members_org_user_key").on(t.organizationId, t.userId),
    index("org_members_user_idx").on(t.userId),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: orgRole("role").notNull().default("engineer"),
    tokenHash: text("token_hash").notNull(),
    invitedBy: uuid("invited_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("invitations_token_key").on(t.tokenHash), index("invitations_org_idx").on(t.organizationId)],
);

// ─── Projects ───────────────────────────────────────────────────────────────
export const projects = pgTable(
  "projects",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    type: projectType("type").notNull().default("robotics"),
    status: projectStatus("status").notNull().default("active"),
    visibility: projectVisibility("visibility").notNull().default("organization"),
    /** "owner/name" of a linked GitHub repository. */
    repository: text("repository"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("projects_slug_key").on(t.slug), index("projects_org_idx").on(t.organizationId)],
);

export const projectMembers = pgTable(
  "project_members",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: projectRole("role").notNull().default("engineer"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("project_members_key").on(t.projectId, t.userId),
    index("project_members_user_idx").on(t.userId),
  ],
);

/** Per-project sequence numbers (REQ-001, ISS-042, …) — incremented atomically. */
export const projectCounters = pgTable(
  "project_counters",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    value: integer("value").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.kind] })],
);

export const labels = pgTable(
  "labels",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("#8a8f98"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("labels_project_name_key").on(t.projectId, t.name)],
);

// ─── Files & versions ───────────────────────────────────────────────────────
export const folders = pgTable(
  "folders",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    name: text("name").notNull(),
    /** Materialized path, e.g. "/cad/chassis". Unique per project. */
    path: text("path").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("folders_project_path_key").on(t.projectId, t.path), index("folders_parent_idx").on(t.parentId)],
);

export const files = pgTable(
  "files",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    folderId: uuid("folder_id").references(() => folders.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    /** Full path including name, e.g. "/cad/chassis.step". */
    path: text("path").notNull(),
    kind: text("kind").notNull().default("other"),
    mimeType: text("mime_type").notNull(),
    size: bigint("size", { mode: "number" }).notNull().default(0),
    currentVersionId: uuid("current_version_id"),
    versionCount: integer("version_count").notNull().default(0),
    description: text("description"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedBy: uuid("updated_by").references(() => users.id, { onDelete: "set null" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("files_project_path_live_key").on(t.projectId, t.path).where(sql`deleted_at is null`),
    index("files_folder_idx").on(t.folderId),
    index("files_project_updated_idx").on(t.projectId, t.updatedAt),
  ],
);

export const fileVersions = pgTable(
  "file_versions",
  {
    id: id(),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    storageKey: text("storage_key").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    mimeType: text("mime_type").notNull(),
    checksum: text("checksum"),
    message: text("message"),
    /** Extracted metadata (dimensions, units, CAD header fields, line counts…). */
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    restoredFromVersionId: uuid("restored_from_version_id"),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("file_versions_file_number_key").on(t.fileId, t.number),
    index("file_versions_project_idx").on(t.projectId, t.createdAt),
  ],
);

/** Direct-to-storage upload sessions (presigned PUT / multipart). */
export const uploads = pgTable(
  "uploads",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    fileName: text("file_name").notNull(),
    folderId: uuid("folder_id"),
    targetFileId: uuid("target_file_id"),
    mimeType: text("mime_type").notNull(),
    size: bigint("size", { mode: "number" }).notNull(),
    multipartUploadId: text("multipart_upload_id"),
    partCount: integer("part_count"),
    message: text("message"),
    status: uploadStatus("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("uploads_project_idx").on(t.projectId)],
);

/** Project-level version (a named snapshot of every file's current revision). */
export const snapshots = pgTable(
  "snapshots",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    tag: text("tag"),
    fileCount: integer("file_count").notNull().default(0),
    /** Summary of changes relative to the previous snapshot. */
    changeSummary: jsonb("change_summary")
      .$type<{ added: number; modified: number; removed: number }>()
      .notNull()
      .default({ added: 0, modified: 0, removed: 0 }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("snapshots_project_number_key").on(t.projectId, t.number)],
);

export const snapshotEntries = pgTable(
  "snapshot_entries",
  {
    snapshotId: uuid("snapshot_id")
      .notNull()
      .references(() => snapshots.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => files.id, { onDelete: "cascade" }),
    fileVersionId: uuid("file_version_id")
      .notNull()
      .references(() => fileVersions.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
  },
  (t) => [primaryKey({ columns: [t.snapshotId, t.fileId] })],
);

// ─── Planning: milestones, issues, tasks ────────────────────────────────────
export const milestones = pgTable(
  "milestones",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    dueDate: date("due_date"),
    status: milestoneStatus("status").notNull().default("open"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("milestones_project_number_key").on(t.projectId, t.number)],
);

export const issues = pgTable(
  "issues",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    status: issueStatus("status").notNull().default("open"),
    priority: priority("priority").notNull().default("none"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    milestoneId: uuid("milestone_id").references(() => milestones.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("issues_project_number_key").on(t.projectId, t.number),
    index("issues_project_status_idx").on(t.projectId, t.status),
    index("issues_assignee_idx").on(t.assigneeId),
  ],
);

export const issueLabels = pgTable(
  "issue_labels",
  {
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.issueId, t.labelId] })],
);

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    status: taskStatus("status").notNull().default("todo"),
    priority: priority("priority").notNull().default("none"),
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    milestoneId: uuid("milestone_id").references(() => milestones.id, { onDelete: "set null" }),
    parentId: uuid("parent_id"),
    dueDate: date("due_date"),
    sortOrder: integer("sort_order").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("tasks_project_number_key").on(t.projectId, t.number),
    index("tasks_project_status_idx").on(t.projectId, t.status),
    index("tasks_assignee_idx").on(t.assigneeId),
    index("tasks_parent_idx").on(t.parentId),
    index("tasks_milestone_idx").on(t.milestoneId),
  ],
);

export const taskLabels = pgTable(
  "task_labels",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    labelId: uuid("label_id")
      .notNull()
      .references(() => labels.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.labelId] })],
);

export const taskDependencies = pgTable(
  "task_dependencies",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    dependsOnId: uuid("depends_on_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.dependsOnId] })],
);

// ─── Systems engineering: requirements, tests, decisions, changes ──────────
export const requirements = pgTable(
  "requirements",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    rationale: text("rationale"),
    priority: requirementPriority("priority").notNull().default("should"),
    status: requirementStatus("status").notNull().default("draft"),
    verificationMethod: verificationMethod("verification_method").notNull().default("test"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    parentId: uuid("parent_id"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("requirements_project_number_key").on(t.projectId, t.number)],
);

export const tests = pgTable(
  "tests",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    procedure: text("procedure"),
    /** Acceptance criterion, e.g. "500 N minimum". */
    criteria: text("criteria"),
    expected: text("expected"),
    status: testStatus("status").notNull().default("planned"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("tests_project_number_key").on(t.projectId, t.number),
    index("tests_project_status_idx").on(t.projectId, t.status),
  ],
);

export type Measurement = { name: string; value: number; unit: string; min?: number | null; max?: number | null };

export const testRuns = pgTable(
  "test_runs",
  {
    id: id(),
    testId: uuid("test_id")
      .notNull()
      .references(() => tests.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    status: testStatus("status").notNull(),
    actual: text("actual"),
    notes: text("notes"),
    measurements: jsonb("measurements").$type<Measurement[]>().notNull().default([]),
    /** Source for automated runs, e.g. "ci:github-actions" or "manual". */
    source: text("source").notNull().default("manual"),
    runBy: uuid("run_by").references(() => users.id, { onDelete: "set null" }),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("test_runs_test_number_key").on(t.testId, t.number),
    index("test_runs_project_idx").on(t.projectId, t.runAt),
  ],
);

export type DecisionAlternative = { name: string; pros?: string | null; cons?: string | null; chosen?: boolean };

export const decisions = pgTable(
  "decisions",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    context: text("context"),
    decision: text("decision").notNull(),
    alternatives: jsonb("alternatives").$type<DecisionAlternative[]>().notNull().default([]),
    rationale: text("rationale"),
    consequences: text("consequences"),
    status: decisionStatus("status").notNull().default("proposed"),
    supersededById: uuid("superseded_by_id"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("decisions_project_number_key").on(t.projectId, t.number)],
);

export type ChangeItem = { parameter: string; from: string; to: string };

/** Engineering change records (ECR/ECO) — CHANGE-024 "Reinforced front mounting bracket". */
export const changes = pgTable(
  "changes",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    reason: text("reason").notNull(),
    description: text("description"),
    items: jsonb("items").$type<ChangeItem[]>().notNull().default([]),
    result: text("result"),
    status: changeStatus("status").notNull().default("proposed"),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    implementedAt: timestamp("implemented_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("changes_project_number_key").on(t.projectId, t.number)],
);

// ─── Notebook ───────────────────────────────────────────────────────────────
export const notebookEntries = pgTable(
  "notebook_entries",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    entryDate: date("entry_date").notNull(),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    /** Immutable: author and creation time can never be changed by the API. */
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    revisionCount: integer("revision_count").notNull().default(1),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("notebook_project_number_key").on(t.projectId, t.number),
    index("notebook_project_date_idx").on(t.projectId, t.entryDate),
  ],
);

export const notebookRevisions = pgTable(
  "notebook_revisions",
  {
    id: id(),
    entryId: uuid("entry_id")
      .notNull()
      .references(() => notebookEntries.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    editedBy: uuid("edited_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("notebook_revisions_key").on(t.entryId, t.revision)],
);

// ─── Releases & source ──────────────────────────────────────────────────────
export type ReleaseManifest = {
  snapshot?: { id: string; number: number; name: string } | null;
  firmwareCommit?: string | null;
  requirements: { total: number; verified: number; failed: number };
  tests: { total: number; passed: number; failed: number; items: { ref: string; name: string; status: string }[] };
  issuesClosed: { ref: string; title: string }[];
  changes: { ref: string; title: string }[];
  decisions: { ref: string; title: string }[];
};

export const releases = pgTable(
  "releases",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
    name: text("name").notNull(),
    notes: text("notes"),
    status: releaseStatus("status").notNull().default("draft"),
    snapshotId: uuid("snapshot_id").references(() => snapshots.id, { onDelete: "set null" }),
    firmwareCommit: text("firmware_commit"),
    manifest: jsonb("manifest").$type<ReleaseManifest>(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("releases_project_tag_key").on(t.projectId, t.tag)],
);

export const commits = pgTable(
  "commits",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sha: text("sha").notNull(),
    message: text("message").notNull(),
    authorName: text("author_name"),
    authorLogin: text("author_login"),
    url: text("url"),
    branch: text("branch"),
    committedAt: timestamp("committed_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("commits_project_sha_key").on(t.projectId, t.sha),
    index("commits_project_date_idx").on(t.projectId, t.committedAt),
  ],
);

// ─── Traceability graph ─────────────────────────────────────────────────────
/**
 * Typed, directed edges between engineering artifacts in a project.
 * This is the foundation of Forgebase's traceability and knowledge graph:
 * requirement → decision → file revision → commit → test → change → release.
 */
export const links = pgTable(
  "links",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourceType: entityType("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    targetType: entityType("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    /** e.g. "verifies", "implements", "references", "blocks", "fixes", "attachment". */
    relation: text("relation").notNull().default("references"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("links_unique_key").on(t.sourceType, t.sourceId, t.targetType, t.targetId, t.relation),
    index("links_source_idx").on(t.sourceType, t.sourceId),
    index("links_target_idx").on(t.targetType, t.targetId),
    index("links_project_idx").on(t.projectId),
  ],
);

// ─── Collaboration ──────────────────────────────────────────────────────────
export const comments = pgTable(
  "comments",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    targetType: entityType("target_type").notNull(),
    targetId: uuid("target_id").notNull(),
    parentId: uuid("parent_id"),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("comments_target_idx").on(t.targetType, t.targetId, t.createdAt)],
);

export const commentReactions = pgTable(
  "comment_reactions",
  {
    commentId: uuid("comment_id")
      .notNull()
      .references(() => comments.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.commentId, t.userId, t.emoji] })],
);

export const notifications = pgTable(
  "notifications",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    url: text("url"),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.createdAt)],
);

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    inApp: boolean("in_app").notNull().default(true),
    email: boolean("email").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.userId, t.type] })],
);

export const activities = pgTable(
  "activities",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    /** Dotted verb, e.g. "file.uploaded", "test.failed", "release.published". */
    verb: text("verb").notNull(),
    targetType: entityType("target_type"),
    targetId: uuid("target_id"),
    /** Human reference at the time of the event, e.g. "TEST-024" or "chassis-v3.step". */
    targetLabel: text("target_label"),
    targetTitle: text("target_title"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index("activities_project_idx").on(t.projectId, t.createdAt),
    index("activities_org_idx").on(t.organizationId, t.createdAt),
    index("activities_actor_idx").on(t.actorId, t.createdAt),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    requestId: text("request_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index("audit_logs_org_idx").on(t.organizationId, t.createdAt),
    index("audit_logs_actor_idx").on(t.actorId, t.createdAt),
  ],
);

// ─── Integrations & webhooks ────────────────────────────────────────────────
export const integrations = pgTable(
  "integrations",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    provider: integrationProvider("provider").notNull(),
    /** Non-secret configuration (repo name, channel name, event filters). */
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    /** Encrypted secret material (webhook URL, bot token). Never returned to clients. */
    secretEnc: text("secret_enc"),
    enabled: boolean("enabled").notNull().default(true),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("integrations_org_idx").on(t.organizationId),
    index("integrations_project_idx").on(t.projectId),
  ],
);

export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: id(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    /** "github" (X-Hub-Signature-256) or "generic" (X-Forgebase-Signature). */
    kind: text("kind").notNull(),
    description: text("description"),
    secretEnc: text("secret_enc").notNull(),
    enabled: boolean("enabled").notNull().default(true),
    lastDeliveryAt: timestamp("last_delivery_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("webhook_endpoints_project_idx").on(t.projectId)],
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: id(),
    endpointId: uuid("endpoint_id")
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: "cascade" }),
    event: text("event").notNull(),
    status: text("status").notNull(),
    error: text("error"),
    payloadSize: integer("payload_size").notNull().default(0),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("webhook_deliveries_endpoint_idx").on(t.endpointId, t.receivedAt)],
);

// ─── Search ─────────────────────────────────────────────────────────────────
export const searchDocuments = pgTable(
  "search_documents",
  {
    id: id(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    entityType: entityType("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    ref: text("ref"),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    url: text("url").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    tsv: tsvector("tsv").generatedAlwaysAs(
      sql`setweight(to_tsvector('english', coalesce(ref, '') || ' ' || title), 'A') || setweight(to_tsvector('english', left(body, 20000)), 'B')`,
    ),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("search_entity_key").on(t.entityType, t.entityId),
    index("search_tsv_idx").using("gin", t.tsv),
    index("search_title_trgm_idx").using("gin", sql`${t.title} gin_trgm_ops`),
    index("search_org_idx").on(t.organizationId),
  ],
);

// ─── Infrastructure ─────────────────────────────────────────────────────────
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});
