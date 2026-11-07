# Supabase production configuration guide

## 1. Project creation
1. supabase.com → New project → Organization `gcc-crm`.
2. **Region**: pick the closest to GCC users — `me-central1` (Middle East,
   Bahrain) where available, else `ap-south-1` (Mumbai) or `eu-central-1`.
   Record the choice in the residency section of the remediation register.
3. Strong DB password → store in the secret manager, never in git.

## 2. Credentials & placement (never client-side)
| Credential | Where it lives | Notes |
|---|---|---|
| `DATABASE_URL` (pooled, port 6543, **NOBYPASSRLS role**) | API/worker server env | runtime role; RLS enforced |
| `MIGRATION_DATABASE_URL` (direct, port 5432, privileged) | CI/CD secrets ONLY | migrations never serve traffic |
| `SUPABASE_ANON_KEY` | web (browser-safe by design) | RLS is the real boundary |
| `SUPABASE_SERVICE_ROLE_KEY` | server/worker ONLY | bypasses RLS — treat as root |
| `SUPABASE_URL` | web + server | |

## 3. Schema & migrations

The Supabase config and ordered migrations live in
`packages/database/supabase/`. The API still uses `MemoryStore`; there is no
PostgreSQL adapter, so setting `DATABASE_URL` does not enable persistence.
Do not run a production migration until existing SQL Editor changes and
migration history have been reconciled.

```bash
supabase migration list --remote --workdir packages/database
supabase db push --dry-run --remote --workdir packages/database
```

The linked project must be confirmed as isolated staging. Only after reviewing
the diff and obtaining explicit approval, apply with
`supabase db push --remote --workdir packages/database`. Generate types from
the migrated staging catalog with `npm run db:types -w @crm/database`; inspect
and commit the generated `packages/database/supabase/database.types.ts`. Types
have been generated from the currently migrated staging schema.

The source migrations declare 104 tables and RLS policies, but this is not
evidence they have been applied or tested. The policies depend on
`current_tenant_id()` and a trusted transaction-local `app.tenant_id`; no API
PostgreSQL adapter currently sets that context. Run the authored pgTAP suite
against local Supabase with Docker/Podman before considering RLS verified:

```sql
select count(*) from pg_tables where schemaname='public' and rowsecurity;
select tablename, policyname from pg_policies
where schemaname='public' order by tablename, policyname;
```

These queries inspect catalog presence only; they do not prove tenant isolation.

## 4. Auth (cutover for the web login)
- Enable Email provider; confirm templates for verification + password reset.
- Turn on leak-protection + MFA (TOTP) for all users; enforce for owner/admin
  roles via the app policy hook (U module).
- JWT secret rotation: rotate annually; app validates `aud`/`exp`/`iss`.

## 5. Storage / Realtime / pgvector
- Private buckets; signed URLs only (15-min expiry);
  MIME allowlist + size caps enforced server-side before upload.
- Realtime: enable on `conversations` + `messages` for inbox live updates
  (replaces the 8s poll — phase: post-cutover polish).
- pgvector: `0001_init` enables the extension; `knowledge_chunks.embedding`
  is `vector(1536)` with an HNSW index — embeddings come from the provider
  adapter once keys exist.

## 6. Backups / restore drills / performance
- Daily PITR (Pro plan) + weekly logical dump to private storage.
- **Restore drill quarterly**: restore to a throwaway branch → run the e2e
  isolation suite against it → record results (runbook: docs/runbooks).
- Index verification: `explain (analyze)` on the hot paths (contacts by
  tenant+email, conversations by tenant+status, messages by conversation).
- Connection pooling: use the pooled 6543 endpoint for app runtime; set pool
  max per the plan tier; never open the 5432 direct port to apps.
