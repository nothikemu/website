# Forgebase

**The engineering workspace for teams that build real things.**

Forgebase is a workspace for robotics and hardware teams. It keeps CAD, drawings, schematics, firmware, test data, requirements, tests, decisions, engineering changes and a lab notebook in one versioned, searchable place. It also links them to each other, so a team can trace any part of its system:

```
Requirement → Decision → CAD revision → Code → Test → Failure → Change → Release
```

Every artifact has history, context, ownership and relationships. That traceability is what sets Forgebase apart from "GitHub for robots."

![Project overview](public/screenshots/overview.jpg)

---

## Contents

- [Features](#features)
- [Architecture](#architecture)
- [Local setup](#local-setup)
- [Environment variables](#environment-variables)
- [Database](#database)
- [Storage](#storage)
- [Authentication](#authentication)
- [Deployment](#deployment)
- [Portable Windows app](#portable-windows-app)
- [API](#api)
- [Security](#security)
- [Testing](#testing)
- [Folder structure](#folder-structure)
- [What's not done yet](#whats-not-done-yet)

Deeper documentation: [`docs/architecture.md`](docs/architecture.md) · [`docs/security.md`](docs/security.md) · [`docs/api.md`](docs/api.md) · [`docs/database.md`](docs/database.md)

---

## Features

| Area | What works today |
|---|---|
| **Accounts** | Email/password signup, login, logout, email verification, password reset, change password, delete account, GitHub & Google OAuth (sign-in and account linking), profile (username, display name, avatar, bio, organization, location, website, timezone), personal API tokens |
| **Organizations** | Multiple orgs per user, roles (Owner, Admin, Engineer, Viewer), email invitations, member management, plans and usage limits, security audit log |
| **Projects** | Types (robotics, mechanical, …), status, organization-wide or private visibility, per-project roles, dashboard with health computed from real signals |
| **Files** | Folders; upload (direct to object storage, multipart for large files); rename, move, delete (trash) and restore; download; previews (images, video, PDF, code, Markdown, CSV tables, interactive 3D for STL); metadata extraction (STEP header/protocol/units, STL triangles, KiCad, PDF, PNG/JPEG, CSV) |
| **Versioning** | Per-file revision history, line diffs for text and code, metadata and checksum comparison for binary/CAD files, restore of any revision; project **versions** (snapshots) you can compare and restore |
| **Issues / Tasks** | Issues with status, priority, labels, assignee, milestone and links to requirements, tests and decisions; Kanban task board (drag and drop) and list view, subtasks, dependencies, due dates; milestones whose progress comes from linked tasks |
| **Systems engineering** | Requirements (MoSCoW, verification method, owner); a **traceability matrix**; tests with criteria, procedures and run history (measurements, limits, attachments); engineering decisions with alternatives; an engineering change log (CHANGE records with parameter-level from → to) |
| **Notebook** | Dated, attributed entries with immutable timestamps; amendments are kept as numbered revisions; tags, Markdown, references, @mentions |
| **Releases** | Pin a project version and a firmware commit; release notes generated from recorded activity; manifest that freezes requirement and test state at publish |
| **Collaboration** | Threaded comments with Markdown, @mentions, reactions and file attachments on every record; notifications with per-type preferences (in-app and email); activity feed |
| **Search** | Global full-text and fuzzy search (PostgreSQL `tsvector` + `pg_trgm`), always scoped to what the caller can access; ⌘K command palette |
| **Integrations** | GitHub (link a repo, import commits, auto-link `ISS-012` and `fixes ISS-012`), Discord and Slack channel notifications, inbound signed webhooks for GitHub pushes and CI test results; Google Drive interface only |
| **Forge (AI)** | Optional project assistant: retrieval over the project's own records with OpenAI, Anthropic or Google as swappable providers. Without a provider it shows the retrieved records instead of an answer |

References like `REQ-001`, `TEST-004`, `DEC-002`, `CHANGE-007`, `ISS-012`, `TASK-031` and `NB-005` written anywhere (descriptions, comments, notebook entries, commit messages) become traceability links and clickable chips.

## Architecture

```
Browser ─┬─ Server Components (SSR pages) ──┐
         └─ fetch /api/v1/* (client actions) ┤
                                             ▼
        HTTP layer   src/server/http/api.ts  — auth (cookie | bearer), CSRF, rate limit,
                                               zod validation, request IDs, error mapping
                                             ▼
        Services     src/server/services/*   — business logic; every call starts with
                                               requireProject()/requireOrg() (authz)
           │                 │                       │
           ▼                 ▼                       ▼
    PostgreSQL (Drizzle)  Object storage       Event bus → activity feed, notifications,
    + search index        (S3 / R2 / local)    Discord/Slack, (queue-ready)
```

- **Next.js 16 (App Router), React 19, TypeScript (strict).** Pages are server-rendered and call services directly. Client components mutate through the documented REST API, so the UI and external clients use the same code path.
- **Drizzle ORM on PostgreSQL**, with SQL migrations in `drizzle/`.
- **One authorization service** (`src/server/authz`). Services never accept a raw ID without first resolving the caller's access to the owning project or organization.
- **Domain events** (`src/server/events`). Services emit events and subscribers write the activity feed, deliver notifications and post to integrations. The bus is in-process and awaited, which is serverless-safe. It can be swapped for a durable queue without touching subscribers.
- **Storage abstraction** (`src/server/storage`). Drivers for S3-compatible storage (AWS S3, Cloudflare R2, Supabase Storage, MinIO) and the local filesystem.
- **AI abstraction** (`src/server/ai`). Provider adapters call the vendor APIs with plain `fetch`, with no vendor SDKs.

See [`docs/architecture.md`](docs/architecture.md).

## Local setup

Requirements: Node.js ≥ 20.11, PostgreSQL ≥ 14 (with the `pg_trgm` extension available).

```bash
git clone <repo> forgebase && cd forgebase
npm install

# 1. Database
createdb forgebase                       # or use Docker / Supabase
cp .env.example .env                     # then fill AUTH_SECRET and ENCRYPTION_KEY:
#   openssl rand -base64 48   → AUTH_SECRET
#   openssl rand -base64 32   → ENCRYPTION_KEY

npm run db:migrate                       # applies drizzle/*.sql

# 2. Optional demo workspace (clearly labeled demo data)
npm run db:seed                          # sign in: demo@forgebase.dev / forgebase-demo

# 3. Run
npm run dev                              # http://localhost:3000
```

With the default `STORAGE_DRIVER=local` and `EMAIL_DRIVER=console`, files go to `./.storage` and emails (verification, password reset, invitations) are printed to the server log, so you can follow the links locally.

Useful scripts:

| Script | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` / `lint` / `format` | TypeScript, ESLint, Prettier |
| `npm test` | Vitest suite (needs a `forgebase_test` database, see [Testing](#testing)) |
| `npm run db:generate` | Generate a migration after editing `src/server/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` / `db:reset-demo` | Create or recreate the demo workspace (removes only `is_demo` rows) |
| `node scripts/capture-screenshots.mjs` | Regenerate landing-page screenshots from the running app |

## Environment variables

All secrets come from the environment and are validated at boot in `src/server/env.ts`. None are hardcoded. See `.env.example`.

| Variable | Required | Description |
|---|---|---|
| `APP_URL` | yes | Public base URL (OAuth callbacks, email links, webhook URLs) |
| `DATABASE_URL` | yes | PostgreSQL connection string. Transaction poolers (`:6543`, `pgbouncer=true`) are detected automatically. |
| `AUTH_SECRET` | yes | ≥ 32 chars. Signs OAuth state and local-storage URLs. |
| `ENCRYPTION_KEY` | yes | ≥ 32 chars. AES-256-GCM key for stored OAuth tokens, webhook URLs and webhook secrets. |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | no | Enables GitHub sign-in and the live GitHub integration |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | no | Enables Google sign-in |
| `STORAGE_DRIVER` | no | `local` (default, development only) or `s3` |
| `STORAGE_LOCAL_DIR` | no | Directory for the local driver (default `.storage`) |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` | with `s3` | S3-compatible bucket |
| `EMAIL_DRIVER` | no | `console` (default) or `smtp` |
| `SMTP_URL`, `EMAIL_FROM` | with `smtp` | e.g. `smtps://user:pass@smtp.resend.com:465` |
| `AI_PROVIDER` | no | `none` (default), `openai`, `anthropic` or `google` |
| `AI_MODEL`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY` | no | Forge provider settings |
| `LOG_LEVEL` | no | `debug` / `info` / `warn` / `error` |
| `ERROR_TRACKING_DSN` | no | Turns on the error-reporter hook in `instrumentation.ts` (Sentry-ready) |

## Database

PostgreSQL schema, normalized, with UUID keys and timestamps. Defined in `src/server/db/schema.ts`; migrations live in `drizzle/`. The first migration enables `pg_trgm`.

Main tables: `users`, `sessions`, `oauth_accounts`, `auth_tokens`, `api_tokens`, `organizations`, `organization_members`, `invitations`, `projects`, `project_members`, `folders`, `files`, `file_versions`, `uploads`, `snapshots`, `snapshot_entries`, `milestones`, `issues`, `tasks`, `task_dependencies`, `labels`, `requirements`, `tests`, `test_runs`, `decisions`, `changes`, `notebook_entries`, `notebook_revisions`, `releases`, `commits`, `links`, `comments`, `comment_reactions`, `notifications`, `notification_preferences`, `activities`, `audit_logs`, `integrations`, `webhook_endpoints`, `webhook_deliveries`, `search_documents`, `rate_limits`.

The **`links`** table is the traceability and knowledge graph: typed, directed edges between any two artifacts in a project. See [`docs/database.md`](docs/database.md).

## Storage

Large files never go into PostgreSQL. Uploads work in three steps:

1. `POST /api/v1/projects/{p}/uploads` checks permissions, extension, plan file-size limit and org storage quota, then returns a **presigned PUT URL**. Files over 64 MB get presigned **multipart** URLs.
2. The browser uploads directly to storage and shows progress.
3. `POST …/uploads/{id}/complete` HEADs the object to verify its size, sniffs magic bytes (rejecting executables and mislabelled content), extracts metadata, computes a SHA-256 checksum, then records the revision. Uploading identical content is detected and skipped.

Downloads use **signed GET URLs that expire after 5 minutes**. They are served as attachments, except for previews of images, video and PDF; SVG is always an attachment.

| Provider | Configuration |
|---|---|
| AWS S3 | `STORAGE_DRIVER=s3`, `S3_REGION`, `S3_BUCKET`, keys |
| Cloudflare R2 | `S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com`, `S3_REGION=auto` |
| Supabase Storage | `S3_ENDPOINT=https://<ref>.supabase.co/storage/v1/s3`, `S3_FORCE_PATH_STYLE=true`, S3 access keys from the dashboard |
| MinIO | `S3_ENDPOINT=http://localhost:9000`, `S3_FORCE_PATH_STYLE=true` |

Configure CORS on the bucket so the app origin can `PUT` and read the `ETag` header (needed for multipart uploads).

## Authentication

Authentication is implemented in-house (`src/server/auth`) rather than with Auth.js. Auth.js's credentials provider forces stateless JWT sessions, while Forgebase needs revocable server-side sessions (password changes sign out other devices; deleting an account kills its sessions), plus first-class email verification and reset flows.

- **Passwords**: scrypt (N=2¹⁵, r=8, p=1) with per-hash parameters, constant-time verification, and timing equalization for unknown emails.
- **Sessions**: a 256-bit random token in an `httpOnly`, `SameSite=Lax` cookie (`Secure` in production). Only its SHA-256 hash is stored. 30-day sliding expiry.
- **OAuth**: GitHub and Google through [arctic](https://arcticjs.dev), with state and PKCE in a signed short-lived cookie. A verified provider email is linked to an existing account; otherwise a new account is created.
- **Email tokens**: single-use, hashed, expiring (24 h for verification, 1 h for reset). Verification needs an explicit click (POST) so email link scanners can't consume the token.
- **API tokens**: `fbp_…` personal access tokens, stored hashed, with optional expiry, used as `Authorization: Bearer`.

To set up OAuth apps, use these callback URLs:

- GitHub: `{APP_URL}/api/auth/oauth/github/callback`
- Google: `{APP_URL}/api/auth/oauth/google/callback`

## Deployment

**Vercel + Supabase + Cloudflare R2** (recommended):

1. Create a Supabase project. Use the **pooled** connection string (port 6543) as `DATABASE_URL`, and run `DATABASE_URL=<direct url> npm run db:migrate` from CI or locally.
2. Create an R2 bucket and an API token, set the `S3_*` variables, and add a CORS rule for your domain (`PUT`, `GET`, expose `ETag`).
3. Import the repo in Vercel and set all the environment variables (`APP_URL` = production URL, `EMAIL_DRIVER=smtp` + `SMTP_URL`).
4. Deploy. `/api/health` reports database and storage status for uptime checks.

Any Node 20+ host also works (`npm run build && npm start`). Don't use `STORAGE_DRIVER=local` on serverless hosts. **Never run `db:seed` in production.** The script refuses unless `SEED_ALLOW_PRODUCTION=1` is set.

## Portable Windows app

A single-user copy that runs from a folder: no installer, no admin rights, no database server.

```bash
desktop/build.sh win      # → dist/Forgebase-win.zip  (needs Go, curl, zip)
desktop/build.sh linux    # → dist/Forgebase-linux.zip
```

The zip contains `Forgebase.exe` (a small Go launcher), a portable Node.js runtime in `runtime/`, and the Next.js standalone server in `app/`. On launch it:

- creates `%LOCALAPPDATA%\Forgebase` (or `~/.forgebase`) and generates secrets into `config.json`;
- runs migrations against an embedded PostgreSQL (PGlite, `DATABASE_URL=pglite:<dir>`);
- loads the demo workspace on first run;
- serves on `http://localhost:3737` (or the next free port) and opens the browser.

Only one copy runs per data folder (`running.json`); launching again reopens the browser. Emails are printed in the console window. End-user instructions are in [`desktop/README.txt`](desktop/README.txt). The test suite runs against PGlite with `TEST_DATABASE_URL=pglite:<dir>`.

## API

A versioned REST API at `/api/v1`. Responses are JSON, request bodies are validated with zod schemas (`src/lib/validation.ts`), and status codes are standard (`201` created, `204` no content, `401`, `402` plan limit, `403`, `404`, `409`, `413`, `415`, `422` validation, `429` rate limited). Errors look like:

```json
{ "error": { "code": "validation_failed", "message": "Title is required", "issues": [{ "path": "title", "message": "…" }] }, "requestId": "…" }
```

```bash
curl -H "Authorization: Bearer $FORGEBASE_TOKEN" \
     "https://forgebase.example/api/v1/projects/cargo-transport-robot/requirements"
```

The full endpoint reference is in [`docs/api.md`](docs/api.md). `GET /api/v1` returns a machine-readable index.

## Security

Multi-tenant isolation is enforced in one place: every service resolves `requireProject(actor, ref, permission)` or `requireOrg(…)` before touching data. All project-scoped queries then filter by the authorized project's ID, so an ID taken from another organization finds nothing and returns **404**. Other measures: CSRF origin checks on cookie-authenticated mutations, PostgreSQL-backed rate limiting, zod validation on every input, parameterized queries only, no raw HTML rendering of user Markdown, security headers, encrypted third-party secrets, signed storage URLs, an audit log, and safe error responses that carry a request ID and never a stack trace. See [`docs/security.md`](docs/security.md).

## Testing

```bash
createdb forgebase_test   # with pg_trgm available
npm test
```

The suite runs against a real PostgreSQL database (`TEST_DATABASE_URL`, default `postgres://forgebase:forgebase@localhost:5432/forgebase_test`), which is recreated from migrations on each run:

- `tests/isolation.test.ts` covers the core guarantee: **a user from Organization A can never read or modify Organization B's data.** It is exercised through services and through the HTTP handlers, including attempts to mix an authorized project with foreign record IDs.
- `tests/permissions.test.ts` covers the role matrix, viewer/engineer/admin enforcement, private projects, ownership rules and immediate revocation.
- `tests/auth.test.ts` covers signup, verification, login, CSRF, logout, password reset and session revocation, enumeration resistance, and rate limiting.
- `tests/files.test.ts` covers signed URLs, token tampering and expiry, blocked executables, MIME and magic-byte validation, quotas, and revision semantics.
- `tests/smoke.test.ts` runs one end-to-end engineering workflow across every service.
- `tests/e2e/smoke.mjs` is a browser smoke test (Playwright) against a running server: signup → org → project → upload → issue → comment → ⌘K search.

## Folder structure

```
drizzle/                 SQL migrations
docs/                    architecture, security, API, database
public/screenshots/      landing-page images captured from the real app
scripts/                 migrate, seed (+ CAD/PNG/PDF generators), screenshot capture
src/
  app/
    (auth)/              login, signup, reset, verify, invite
    (app)/(main)/        dashboard, notifications, settings, organizations, org/[slug], project/new
    (app)/project/[slug] overview, files, versions, issues, tasks, milestones, requirements,
                         tests, decisions, changes, notebook, releases, activity, forge, settings
    api/                 auth, v1 REST API, inbound webhooks, local storage, health
    page.tsx             landing page
  components/
    ui/                  primitives (button, inputs, dialog, menu, markdown, …)
    app/                 shell, sidebar, command palette, activity feed, status glyphs
    files/ project/ org/ settings/ forms/ auth/ marketing/
  lib/                   shared (client + server): validation schemas, refs, plans, status, dates
  server/
    auth/                passwords, sessions, OAuth, current user
    authz/               permission model & access resolution
    db/                  schema & client
    events/              event bus & subscribers
    services/            domain logic (one module per area)
    storage/             S3 + local drivers
    search/              index & query
    integrations/        GitHub, Discord/Slack, Drive interface, catalog
    ai/                  provider adapters & Forge
    http/                API wrapper & errors
    observability/       logger, request context, error tracker
  proxy.ts               optimistic auth redirects (Next 16 "proxy", formerly middleware)
tests/                   Vitest suites + e2e smoke
```

## What's not done yet

These parts are honest stubs, isolated behind interfaces:

- **Billing**: organizations carry a `plan`, and limits (projects, storage, file size, AI) are enforced. `billing_customer_id` and `billing_subscription_id` are reserved, but no payment provider is connected. Owners can switch self-serve plans freely during the beta.
- **Google Drive import**: `src/server/integrations/drive.ts` defines the adapter. Drive OAuth scopes aren't requested yet.
- **CAD-aware diffs**: binary revisions are compared by extracted metadata and checksum. `diffVersions` is the extension point for geometry-level diffs.
- **Background jobs**: the event bus runs in-process. Move `dispatch` to a queue worker (Inngest, QStash, SQS) when integrations or email volume need it.
- **GitHub mock adapter**: when `GITHUB_CLIENT_ID` is unset in development, repository import uses a clearly labeled local mock. It is never used in production.
