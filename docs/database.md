# Database

PostgreSQL 14+ with the `pg_trgm` extension. The schema is defined in `src/server/db/schema.ts` (Drizzle) and versioned as SQL migrations in `drizzle/`.

```bash
npm run db:generate   # after editing schema.ts → new drizzle/NNNN_*.sql
npm run db:migrate    # apply
```

## Conventions

- `uuid` primary keys (`gen_random_uuid()`); `created_at` and `updated_at` are `timestamptz` (updated through Drizzle's `$onUpdate`).
- Every project-scoped table has an indexed `project_id` with `ON DELETE CASCADE`, so deleting a project removes its data.
- Authorship columns (`created_by`, `author_id`, `uploaded_by`, …) use `ON DELETE SET NULL`. Engineering history survives account deletion.
- Human references use per-project sequences in `project_counters (project_id, kind, value)`, incremented with an atomic `INSERT … ON CONFLICT … RETURNING`. Uniqueness is enforced by `(project_id, number)` indexes.
- Status, role and type columns are PostgreSQL enums.
- Binary content is never stored in the database, only object-storage keys.

## Entity overview

```
users ─┬─ sessions, oauth_accounts, auth_tokens, api_tokens, notification_preferences
       └─ organization_members ─── organizations ─┬─ invitations, integrations, audit_logs
                                                 └─ projects ─┬─ project_members, project_counters, labels
                                                              ├─ folders ─ files ─ file_versions      (uploads)
                                                              ├─ snapshots ─ snapshot_entries → file_versions
                                                              ├─ milestones ─ issues (issue_labels)
                                                              │            └─ tasks (task_labels, task_dependencies, parent_id)
                                                              ├─ requirements (parent_id)
                                                              ├─ tests ─ test_runs
                                                              ├─ decisions (superseded_by_id)
                                                              ├─ changes
                                                              ├─ notebook_entries ─ notebook_revisions
                                                              ├─ releases → snapshots
                                                              ├─ commits
                                                              ├─ links            (typed edges between any entities)
                                                              ├─ comments ─ comment_reactions
                                                              ├─ webhook_endpoints ─ webhook_deliveries
                                                              └─ activities, notifications, search_documents
```

## Key tables

| Table | Purpose / notable columns |
|---|---|
| `users` | `email` (unique, lower-cased), `username` (unique), `password_hash` (scrypt, nullable for OAuth-only), profile fields, `is_demo` |
| `sessions` | `id` = SHA-256 of the cookie token, `expires_at`, `last_seen_at`, IP and user agent |
| `organizations` | `slug`, `plan`, `storage_used_bytes`, `billing_customer_id`, `billing_subscription_id`, `is_demo` |
| `organization_members` | `(organization_id, user_id)` unique, `role` |
| `projects` | Globally unique `slug`, `type`, `status`, `visibility` (`organization`/`private`), `repository` |
| `files` | Logical file. Unique live `(project_id, path)` (partial index where `deleted_at is null`), `current_version_id`, `version_count`, soft delete |
| `file_versions` | Immutable revision: `number`, `storage_key`, `size`, `checksum` (SHA-256), `metadata` jsonb, `restored_from_version_id` |
| `uploads` | Pending presigned or multipart upload sessions |
| `snapshots` / `snapshot_entries` | Project versions: `(snapshot, file) → file_version, path` |
| `issues`, `tasks`, `requirements`, `tests`, `decisions`, `changes`, `notebook_entries` | Numbered per project. `decisions.alternatives` and `changes.items` are typed jsonb. |
| `test_runs` | `status`, `actual`, `measurements` jsonb `[{name,value,unit,min,max}]`, `source` (`manual`, `ci:*`) |
| `notebook_revisions` | Full text of every revision. The entry's author and `created_at` are never updated. |
| `releases` | `tag`, `snapshot_id`, `firmware_commit`, and `manifest` jsonb frozen at publish |
| `links` | `(source_type, source_id) → (target_type, target_id)` with `relation`. Unique per edge, indexed both directions. |
| `activities` | Human feed: `verb`, `target_type/id/label/title`, `metadata`. Indexed by project, org and actor plus time. |
| `audit_logs` | Security trail with IP, user agent and request ID |
| `search_documents` | Projection for search: generated weighted `tsvector`, GIN index, trigram index on `title` |
| `rate_limits` | Fixed-window counters (`key`, `count`, `reset_at`) |

## Demo data

`npm run db:seed` creates the **Forge Robotics** organization and its users, all flagged `is_demo = true`. It removes previous demo rows first, and `npm run db:reset-demo` does the same. Real organizations and users are never touched. The seed goes through the service layer, so activity, search, links and versions are all consistent, and it back-dates timestamps so the story ends on the day you run it.
