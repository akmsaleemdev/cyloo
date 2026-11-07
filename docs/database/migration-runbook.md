# Database migration runbook

## Current state

- Source migrations: `packages/database/supabase/migrations/0001_init.sql`,
  `0002_phase4.sql`, `0003_runtime_reconciliation.sql`, then additive
  `0004_zero_trust_authorization.sql`.
- Supabase CLI configuration is checked in. All three source migrations have
  been applied to the separate project the user designated as staging.
- Remote history confirms `0001`, `0002`, and `0003`; a subsequent dry run
  reports no pending migrations. The CLI labels that project's primary
  environment `production`; verify the intended staging designation in the
  Supabase dashboard before using it further.
- Migration `0004` is a new, unpushed source migration. It adds department/team
  and owner scoping for CRM, sales, finance, and marketing records, plus
  support-access records with no client-facing policies. Do not
  activate cross-tenant support access until trusted Supabase MFA validation,
  independent and tenant-admin approvals, expiry/revocation checks and
  per-operation auditing are implemented and tested.
- Remote table statistics report 104 tables and zero estimated nonzero rows.
  A schema dump and pgTAP run were blocked because Docker/Podman is unavailable.
- Do not run these files against production or an existing schema based only
  on this source inventory. Earlier SQL Editor runs may not be represented in
  CLI migration history.
- Rotate credentials that were exposed in chat. Do not place replacements in
  this repository or send them in chat.

## Staging-first procedure

1. Create/use an isolated staging Supabase project. Confirm a restorable
   snapshot, project ref, region, extensions and current migration history.
2. Initialize/link the Supabase CLI from the database workspace. Keep login
   and database credentials in the local CLI prompt/secret manager.
3. Run `supabase migration list --remote` and inspect the staging catalog before push.
   If tables already exist without matching history, stop and reconcile; do
   not fake migration history or blindly rerun `0001_init.sql`.
4. Validate CLI naming and order with `supabase db push --dry-run --remote`. Use only a
   disposable staging project for the initial bootstrap.
5. On the user-designated staging project, migrations 0001–0003 have been
   applied. Migration 0004 has not. Export and review the catalog,
   constraints, extensions, grants and policies before any further push.
6. Run API integration/RLS tests as real roles and two distinct tenants; pgTAP
   has not executed yet.
   Rehearse upgrades from an explicit prior snapshot, not only an empty DB.
7. Record migration version, backup ID, command, pass/fail, duration, locks,
   row counts and rollback/restore evidence in
   `staging-test-evidence.md`.
8. Production remains a separate approval gate. Require backup/PITR evidence,
   reviewed migration diff, dry run, lock estimate, monitoring owner and
   explicit user authorization before any production push.

## Rollback and recovery

Prefer forward-fix migrations for additive schema changes. For destructive or
data-transforming changes, require a rehearsed backup/PITR restore path and a
reviewed data reconciliation plan. Do not assume a SQL down migration reverses
external side effects or restores dropped data.

## Repository status

- `npm run db:push -w @crm/database` targets local Supabase by default. To
  preview a linked remote project use `supabase db push --dry-run --remote
  --workdir packages/database`; use `--remote` to apply only after confirming
  the link targets isolated staging and obtaining explicit approval.
- Types were generated to `packages/database/supabase/database.types.ts` from
  the user-designated staging project's public schema and passed a TypeScript
  syntax check. Re-run `npm run db:types -w @crm/database` after schema changes
  and review the diff before committing.
- `npm run db:verify-rls -w @crm/database` runs the local pgTAP suite and
  requires local Supabase containers. None of these commands was run here.
