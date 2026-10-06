# Architecture

Forgebase is a single Next.js 16 application with a strict internal layering. The point of the layering is to keep business rules and authorization in one place, so pages, the REST API, webhooks and scripts can never bypass them.

## Layers

| Layer | Location | Responsibility |
|---|---|---|
| UI | `src/app/**/page.tsx`, `src/components` | Server-rendered pages. Pages read data by calling services directly. Client components mutate through `/api/v1`. |
| HTTP | `src/server/http/api.ts`, `src/app/api/**/route.ts` | The `route()` wrapper: request ID, session/bearer auth, CSRF origin check, rate limiting, zod body/query parsing, error → status mapping, structured access logs. Route files are thin and call one service each. |
| Services | `src/server/services/*` | Business logic per area (files, snapshots, issues, tasks, milestones, requirements, tests, decisions, changes, notebook, releases, comments, links, integrations, webhooks, dashboard). Each public function takes an `Actor` and resolves access first. |
| Authorization | `src/server/authz` | `requireOrg` / `requireProject` with named permissions, the role model, and the SQL predicate for cross-project queries. |
| Data | `src/server/db` | Drizzle schema and client; migrations in `drizzle/`. |
| Infrastructure | `storage/`, `search/`, `events/`, `email/`, `ai/`, `integrations/`, `observability/`, `ratelimit.ts`, `crypto.ts` | Swappable adapters behind small interfaces. |

Shared code with no server dependencies (validation schemas, reference parsing, plans, status metadata) lives in `src/lib` and is used by both client and server.

## Request lifecycle (mutation)

1. A browser `PATCH /api/v1/projects/cargo-rover/issues/12` arrives with the session cookie.
2. `route()` assigns a request ID (an AsyncLocalStorage context, so logs and audit rows carry it), resolves the session, checks the `Origin` header, and applies the rate limit.
3. The handler validates the body with `updateIssueSchema` and calls `updateIssue(user, "cargo-rover", 12, input)`.
4. The service calls `requireProject(user, ref, "project.write")`, which either returns `{ project, org, role }` or throws 404/403. All queries that follow are filtered by `access.project.id`.
5. Within a transaction, the service writes the change, updates labels and links, and parses `REQ-001`-style references into links.
6. The service updates the search document and emits a domain event (`issue.closed`, …).
7. Subscribers write the activity row, deliver notifications (checking preferences, sending email if enabled) and forward the event to Discord or Slack.
8. The client calls `router.refresh()` and the server components re-render with fresh data.

## Engineering references & the knowledge graph

Every numbered artifact has a stable, human reference (`REQ-001`, `TEST-004`, `DEC-002`, `CHANGE-007`, `ISS-012`, `TASK-031`, `NB-005`). Numbers come from `project_counters` and are allocated atomically per project.

The `links` table stores typed, directed edges (`verifies`, `implements`, `fixes`, `affects`, `references`, `supersedes`, `attachment`) between any two entities in the same project. Edges are created:

- explicitly (link panels, test ↔ requirement, change ↔ issue fields),
- implicitly from text: descriptions, comments, notebook entries and commit messages are scanned for references,
- by integrations: commits referencing `ISS-012` produce `references` edges, and `fixes ISS-012` produces a `fixes` edge.

Requirement verification is **derived**, not stored. `verificationOf()` combines the current status of every test that `verifies` the requirement. The traceability matrix is a projection of the graph grouped by artifact type. Forge's retrieval uses the same graph and search index.

## Files, revisions and versions

- `files` is a logical file at a path. `file_versions` holds immutable revisions, each pointing at an object-storage key. Uploading to an existing path creates revision *n+1*. Restoring creates a new revision that points at the old key, so no bytes are copied and history is never rewritten.
- `snapshots` ("Version N") capture `(file, revision, path)` for every live file. Comparing two snapshots gives added / modified / renamed / removed. Restoring one creates new revisions for changed files and moves later files to the trash.
- Deleting a file is a soft delete (`deleted_at`), so versions and releases that reference it stay valid and the file can be restored.
- Metadata extraction (`src/server/files/inspect.ts`) is format-aware and best-effort. Binary diffs compare that metadata plus the SHA-256 checksum. A CAD-aware differ can be added per file kind in `diffVersions`.

## Event system

`src/server/events/bus.ts` is an in-process publisher/subscriber. `emit()` awaits every subscriber, which matters on serverless platforms where work after the response may be frozen, and isolates each subscriber's failures so a broken Discord webhook can never fail a user's request. To move to a durable queue, have `emit()` enqueue and run `dispatch()` in a worker. Subscribers don't change.

## Search

Each searchable entity is projected into `search_documents` with a generated, weighted `tsvector` (reference and title weighted A, body weighted B) and a trigram index on the title. Queries combine prefix full-text matching (`to_tsquery` with `:*`), trigram similarity, exact reference matches and `ILIKE`. They are **always** restricted to the caller's accessible project IDs. Textual file content (≤ 200 KB) is indexed too, so a string inside firmware or a CSV header is searchable.

## AI (Forge)

`src/server/ai/providers.ts` defines `AiProvider.complete()`, with adapters for OpenAI, Anthropic and Google built on `fetch`. `src/server/ai/forge.ts` builds a **context pack** from the project's own data for each action (search hits, failed runs, decisions, unverified requirements, activity, release-notes draft), then instructs the model to answer only from it and cite references. With no provider configured, or if the provider errors, Forge returns the context pack itself, so it never makes anything up. Forge is gated by plan (`PLANS[plan].ai`).

## Observability

- Structured JSON logs (`logger`) with the request ID and user ID attached automatically.
- `captureError()` sends errors through a replaceable reporter. `instrumentation.ts` is where a Sentry-compatible reporter is registered when `ERROR_TRACKING_DSN` is set.
- Every API response carries `x-request-id`. Error bodies include it, and 500s never include internals.
- `GET /api/health` checks the database and storage.
- Audit log rows (`audit_logs`) record security-relevant actions with actor, IP, user agent and request ID.

## Billing architecture

`organizations.plan` (`free | team | pro | enterprise`) drives the limits in `src/lib/plans.ts`, which are enforced server-side on project creation, upload start (per-file size and org storage quota) and Forge. `storage_used_bytes` is maintained transactionally on upload and deletion. Payment-provider IDs have reserved columns. Connecting Stripe means implementing the plan-change endpoint (`PATCH /api/v1/orgs/{org}/plan`) as a checkout/webhook flow.
