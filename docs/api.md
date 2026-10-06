# API reference (v1)

Base URL: `{APP_URL}/api/v1`. All requests and responses are JSON unless noted.

## Authentication

| Method | How |
|---|---|
| Browser session | `fb_session` cookie set by `/api/auth/login`. Mutations must send a same-origin `Origin` header (CSRF protection). |
| Personal access token | `Authorization: Bearer fbp_…`, created in **Settings → API tokens** or with `POST /api/v1/me/tokens`. Acts with the token owner's permissions. |

## Conventions

- `{project}` accepts a project **slug** or **UUID**. `{org}` accepts an organization slug or UUID.
- Numbered records (issues, tasks, requirements, tests, decisions, changes, notebook entries) are addressed by their per-project number: `ISS-012` → `/issues/12`.
- Bodies are validated with the zod schemas in `src/lib/validation.ts`. Unknown fields are ignored.
- Resources you can't access return **404**, even when they exist.
- Every response includes `x-request-id`.

### Status codes

| Code | Meaning |
|---|---|
| 200 / 201 / 204 | OK / created / no content |
| 400 | Malformed request (bad JSON, wrong content type) or a rejected operation |
| 401 | Not authenticated, or invalid token / signature |
| 402 | Plan limit reached (`plan_limit`) |
| 403 | Authenticated and can see the resource, but lacks permission; or a cross-site request was blocked |
| 404 | Not found **or not accessible** |
| 409 | Conflict (duplicate slug, tag or path) |
| 413 / 415 | File too large / file type or content rejected |
| 422 | Validation failed. `error.issues[]` lists field errors. |
| 429 | Rate limited. Respect `Retry-After`. |
| 500 | Internal error. Body contains only `requestId`. |

```json
{ "error": { "code": "validation_failed", "message": "Title is required", "issues": [{ "path": "title", "message": "Title is required" }] }, "requestId": "4f1c…" }
```

## Auth — `/api/auth`

| Method & path | Body | Notes |
|---|---|---|
| `POST /signup` | `{ email, password, displayName, username }` | Creates the account, sends verification and sets the session cookie. `201` |
| `POST /login` | `{ email, password }` | Rate limited per IP and per account |
| `POST /logout` | — | Revokes the current session |
| `POST /forgot-password` | `{ email }` | Always `200` |
| `POST /reset-password` | `{ token, password }` | Revokes all sessions |
| `POST /verify-email` | `{ token }` | |
| `POST /resend-verification` | — | |
| `GET /session` | — | `{ user \| null }` |
| `GET /oauth/{github\|google}?intent=login\|connect&next=/path` | — | Redirects to the provider |

## Me

| Method & path | Description |
|---|---|
| `GET /me` · `PATCH /me` · `DELETE /me` | Profile; update `{ displayName, username, bio, company, location, website, timezone, avatarUrl }`; delete account `{ confirm: <username>, password }` |
| `POST /me/password` | `{ currentPassword?, newPassword }` |
| `GET /me/tokens` · `POST /me/tokens` · `DELETE /me/tokens/{id}` | Personal access tokens. `POST { name, expiresInDays? }` returns `token` once. |
| `GET /me/notification-preferences` · `PUT …` | `{ preferences: [{ type, inApp, email }] }` |
| `DELETE /me/connections/{provider}` | Unlink GitHub or Google |
| `GET /notifications?unread=1` · `POST /notifications/read` | `{ ids: [uuid] \| "all" }` |
| `GET /search?q=&project=&type=issue,file&limit=` | Search, scoped to accessible projects. Returns `{ hits[], people[] }`. |
| `POST /invitations/{token}/accept` | Email must match and be verified |
| `GET /github/repos` | Repositories visible to your linked GitHub account |

## Organizations

| Method & path | Permission |
|---|---|
| `GET /orgs` · `POST /orgs { name, slug, description? }` | any user |
| `GET /orgs/{org}` · `PATCH` · `DELETE { confirm: <slug> }` | read · admin · owner |
| `GET /orgs/{org}/members` | read (emails visible to admins only) |
| `PATCH /orgs/{org}/members/{userId} { role }` · `DELETE …` | admin (owner changes need owner); members can remove themselves |
| `GET /orgs/{org}/invitations` · `POST { emails[], role }` · `DELETE /{id}` | admin |
| `GET /orgs/{org}/activity?cursor=` | read |
| `GET /orgs/{org}/audit-log?before=&limit=` | admin |
| `GET /orgs/{org}/integrations` · `PATCH /{id} { enabled?, events? }` · `DELETE /{id}` | read · project or org admin |
| `PATCH /orgs/{org}/plan { plan }` | owner |
| `POST /orgs/{org}/switch` | read. Sets the active organization. |

## Projects

| Method & path | Notes |
|---|---|
| `GET /projects?org=` | Accessible projects |
| `POST /projects` | `{ organization, name, slug?, description?, type, visibility, scaffold }`. Enforces the plan's project limit. |
| `GET /projects/{project}` · `PATCH` · `DELETE { confirm: <slug> }` | `PATCH { name?, description?, type?, status?, visibility?, repository? }` needs project admin |
| `GET /projects/{project}/members` · `POST { userId, role }` · `DELETE /{userId}` | Explicit project roles (admin) |
| `GET /projects/{project}/activity?cursor=&limit=` | Paginated, newest first |
| `GET /projects/{project}/labels` | |

### Files

| Method & path | Notes |
|---|---|
| `GET /files?folder={uuid}` | Directory listing (`folders[]`, `files[]`, `breadcrumbs[]`) |
| `GET /folders` · `POST { name, parentId? }` · `PATCH /{id} { name?, parentId? }` · `DELETE /{id}` | Deleting a folder moves its files to the trash |
| `POST /uploads` | `{ fileName, size, folderId?, fileId?, message? }` → `{ uploadId, mode: "single", url, headers }` or `{ mode: "multipart", partSize, parts: [{ partNumber, url }] }` |
| *(client)* `PUT {url}` | Upload bytes directly to storage. Keep each part's `ETag`. |
| `POST /uploads/{id}/complete` | `{ parts?: [{ partNumber, etag }] }` → `{ file, version, unchanged }` |
| `DELETE /uploads/{id}` | Abort |
| `GET /files/{id}` | File, revisions and preview kind |
| `PATCH /files/{id}` | `{ name?, folderId?, description? }` (rename or move) |
| `DELETE /files/{id}` · `POST /files/{id}/undelete` · `GET /trash` | Soft delete and restore |
| `GET /files/{id}/download?version=&inline=1&format=json` | `302` to a signed URL (5 min), or `{ url }` |
| `GET /files/{id}/content?version=` | Text content (≤ 2 MB) |
| `GET /files/{id}/diff?a={versionId}&b={versionId}` | `{ mode: "text", hunks, stats }` or `{ mode: "metadata", rows }` |
| `POST /files/{id}/restore { versionId, message? }` | Creates a new revision |

### Versions (project snapshots)

| Method & path | Notes |
|---|---|
| `GET /versions` · `POST { name, description?, tag? }` | `409` if nothing changed since the last version |
| `GET /versions/pending` | Changes since the latest version |
| `GET /versions/{n}` · `POST /versions/{n}/restore` | |
| `GET /versions/compare?a=1&b=3` | |

### Work items

All of these follow the same pattern: `GET /{collection}` (filters as query params), `POST /{collection}`, `GET|PATCH|DELETE /{collection}/{number}`.

| Collection | Create body (main fields) | Filters |
|---|---|---|
| `issues` | `title, description?, status, priority, assigneeId?, milestoneId?, labels[], links { requirements[], tests[], decisions[] }` | `state=open\|closed\|all, status, assignee, label, milestone, priority, q` |
| `tasks` | `title, description?, status, priority, assigneeId?, milestoneId?, parentId?, dueDate?, labels[], dependsOn[]` | `assignee, milestone, q` |
| `requirements` | `title, description?, rationale?, priority (must…wont), status, verificationMethod, ownerId?, parentId?` | `status, q` |
| `tests` | `name, description?, procedure?, criteria?, expected?, ownerId?, requirements[]` | `status, q` |
| `decisions` | `title, decision, context?, alternatives [{ name, pros?, cons?, chosen? }], rationale?, consequences?, status, ownerId?, supersedes?` | `status, q` |
| `changes` | `title, reason, description?, items [{ parameter, from, to }], result?, status, links { issues[], requirements[], tests[], decisions[], files[] }` | `status, q` |
| `notebook` | `title, body, entryDate (YYYY-MM-DD), tags[]`. `PATCH` (author only) creates a revision. | `tag, author, q, before` |

Other endpoints:

| Method & path | Notes |
|---|---|
| `GET /requirements/traceability` | Matrix rows: requirement and linked artifacts |
| `POST /tests/{n}/runs` | `{ status, actual?, notes?, measurements [{ name, value, unit, min?, max? }], runAt?, attachments [fileId], source? }` |
| `GET /milestones` · `POST { title, description?, dueDate? }` · `PATCH /{id}` · `DELETE /{id}` | Progress is computed from tasks |
| `GET /releases` · `POST { tag, name, notes?, snapshotId?, firmwareCommit?, publish }` | Notes are generated when omitted |
| `POST /releases/draft-notes { snapshotId?, firmwareCommit? }` | Preview the generated notes and manifest |
| `GET|PATCH|DELETE /releases/{tag}` | Published releases are immutable except for name and notes |
| `GET /comments?targetType=&targetId=` · `POST { targetType, targetId, parentId?, body, attachments[] }` | Threaded comments; mentions notify |
| `PATCH /comments/{id} { body }` · `DELETE /comments/{id}` · `POST /comments/{id}/reactions { emoji }` | |
| `POST /links { sourceType, sourceId, targetRef \| (targetType, targetId), relation }` · `DELETE /links/{id}` | e.g. `targetRef: "REQ-004"` |
| `POST /forge { action, question }` | `action`: `ask`, `summarize_activity`, `summarize_decisions`, `failing_requirements`, `test_failures`, `release_notes`, `unresolved_issues` |

### Integrations & webhooks (project)

| Method & path | Notes |
|---|---|
| `GET /integrations` | |
| `POST /integrations/github { repository: "owner/name" }` · `POST /integrations/github/sync` | Admin. Imports recent commits. |
| `POST /integrations/channels { provider: discord\|slack, webhookUrl, events[] }` | Admin. Sends a test message. |
| `GET /webhooks` · `POST { kind: github\|generic, description? }` · `DELETE /{id}` | Admin. `POST` returns the `secret` once. |

## Inbound webhooks — `POST /api/webhooks/{endpointId}`

Signature: `HMAC-SHA256(secret, rawBody)` as `sha256=<hex>`.

- **GitHub** (`kind: github`): configure the endpoint URL and secret in the repository's webhook settings. The header is `X-Hub-Signature-256`. `push` events import commits and link references, and `ping` is acknowledged.
- **Generic** (`kind: generic`): the header is `X-Forgebase-Signature`. Payloads:

```jsonc
{ "event": "test.run", "test": "TEST-004", "status": "passed", "actual": "0.8 °/min",
  "measurements": [{ "name": "drift", "value": 0.8, "unit": "deg/min", "max": 1.5 }], "source": "ci:hil-rig" }
{ "event": "ci.status", "name": "firmware-build", "status": "success", "commit": "a1b2c3d", "url": "https://…" }
{ "event": "deployment", "environment": "rover-01", "version": "v0.3.1", "status": "success" }
```

## Health — `GET /api/health`

`200 { status: "ok", checks: { database, storage }, latencyMs }`, or `503` when degraded.
