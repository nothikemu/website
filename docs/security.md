# Security

Forgebase is multi-tenant. Its most important property is:

> **A user from Organization A must never be able to access private data belonging to Organization B — whatever IDs they put in a request.**

This document explains how that, and the rest of the security model, is enforced.

## Authorization model

| Org role | Can |
|---|---|
| Owner | Everything, including billing, ownership transfer and deleting the organization |
| Admin | Manage members, invitations, integrations, settings, audit log; **admin on every project** |
| Engineer | Create projects; create and edit content in projects they can see |
| Viewer | Read and comment on projects they can see |

A project's effective role (`effectiveProjectRole`):

- You must be a member of the project's organization. Otherwise you have no access, even if a stale `project_members` row exists.
- Owners and admins are project admins.
- On `organization`-visible projects, engineers are engineers and viewers are viewers. An explicit project membership can raise the role.
- On `private` projects, only explicit project members (plus owners and admins) have access.

Permissions are named (`project.read`, `project.comment`, `project.write`, `project.admin`, `org.members.manage`, …) and each maps to a minimum role.

### Enforcement

- **One entry point.** Every service function begins with `requireProject(actor, ref, perm)` or `requireOrg(actor, ref, perm)`. These resolve access with a single join over `projects ⨝ organization_members ⟕ project_members`.
- **Scoped queries.** Once a project is authorized, every query filters by `project_id = access.project.id`, and child records are addressed by `(project_id, number)` or `(project_id, id)`. Pairing an authorized project with another org's record ID finds nothing.
- **404, not 403**, when the caller has no access, so object existence can't be probed. 403 is only returned when the caller can see the object but lacks the permission.
- **Cross-project queries** (dashboard, search) use `accessibleProjectsCondition(userId)`, a SQL predicate. The search index is never queried unscoped.
- **Referenced IDs are validated**: assignees and owners must have access to the project; milestones, parent tasks and folders must belong to the same project; attachments and link targets must exist in the same project.
- **Webhooks** run with the permissions of the endpoint's creator, re-checked on every delivery. A revoked user's endpoint stops working.
- Tests: `tests/isolation.test.ts`, `tests/permissions.test.ts`.

## Authentication

- scrypt password hashing (parameters stored per hash), constant-time comparisons, and a dummy hash check for unknown emails (no timing oracle).
- Sessions: random 256-bit token in an `httpOnly; SameSite=Lax; Secure` cookie. The database stores only `sha256(token)`. Sliding 30-day expiry. All sessions are revoked on password reset, and other sessions on password change.
- Verification, reset and invitation tokens are random, hashed at rest, single-use and expiring. Reset responses are identical whether or not the email exists.
- OAuth state and PKCE verifier travel in a signed, 10-minute, `httpOnly` cookie scoped to the OAuth path. OAuth accounts are linked by provider account ID, or by a **verified** email only.
- Personal access tokens are hashed at rest, shown once, and can expire.
- Demo accounts cannot change their password or delete themselves.

## Request protections

- **CSRF**: cookie-authenticated `POST/PATCH/PUT/DELETE` requests must carry an `Origin` matching the app. Bearer-token requests are exempt because they carry no ambient credentials. JSON bodies must be `application/json`.
- **Rate limiting** (PostgreSQL fixed-window, `src/server/ratelimit.ts`): login (per IP and per account), signup, password reset, verification, invitations, uploads, Forge, webhooks, and a general API limit per user or IP. Responses use `429` with `Retry-After`.
- **Input validation**: every body and query string is parsed with zod. Bodies are capped at 1 MB (webhooks at 2 MB).
- **SQL injection**: queries go through Drizzle's parameterized builder or `sql` tagged templates. User input is never concatenated into SQL. The only `sql.raw` usage is in the offline seed script, with literal table names.
- **XSS**: Markdown is rendered with `react-markdown` and `skipHtml` (no raw HTML), links are restricted to `http(s)`, `/`, `#` and `mailto:`, and images to `https:` or `/api/`. React escapes everything else.
- **Security headers**: `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security` (`next.config.ts`). No `X-Powered-By` header.

## File security

- Uploads are authorized and reserved server-side, and objects get server-generated keys (`org/<id>/project/<id>/<uuid>`). User file names never become storage paths.
- Size is checked against the plan's per-file maximum and the org quota before a presigned URL is issued, then verified with `HEAD` after upload.
- Blocked extensions: executables, installers, scripts that run on open, and HTML.
- Content sniffing: PE, ELF and Mach-O are rejected, declared image/PDF/video/zip types must match their magic bytes, and SVGs containing script or event handlers are rejected.
- Downloads use signed URLs valid for 5 minutes. Files are served as `attachment` with `nosniff`. Inline display is only for image, video and PDF previews (never SVG). The local driver adds `Content-Security-Policy: sandbox`.
- The local storage driver's tokens are HMAC-signed, operation-specific and expiring. Keys are confined to the storage root (path traversal is rejected).

## Secrets

- All secrets come from environment variables, validated at startup. `.env` is git-ignored.
- OAuth access tokens, Discord/Slack webhook URLs and inbound webhook secrets are encrypted with AES-256-GCM (`ENCRYPTION_KEY`) and never returned to clients. Webhook secrets are shown once at creation.
- Server-only modules import `server-only`, so they can't be bundled into client code. Pages pass explicit, minimal user objects to client components (password hashes and emails never reach the browser).

## Auditing & errors

- `audit_logs` records signups, logins (including failures), password events, OAuth link and unlink, org creation, updates and deletion, role changes, invitations, member removal, plan changes, project creation, updates and deletion, integration changes, and webhook endpoint changes, each with IP, user agent and request ID. Admins can view it at `/org/{slug}/audit`.
- Unknown errors become `500 { code: "internal_error", requestId }`. Details are logged server-side and passed to the error reporter. Stack traces are never sent to clients.

## Reporting

Please report vulnerabilities privately to security@forgebase.dev.
