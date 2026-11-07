# Staging and test evidence

## Tests run in this environment (Updated 2026-11-07)

| Check | Result | What it proves |
|---|---|---|
| `npm test` | Passed: 10 API files / 97 tests, 14 shared tests (111 total) | API behavior against the test harness and test double; 100% passing across CRM, Inbox, AI, Marketing, Commerce, Workflow, Scheduling, Social, Service, Platform. |
| `npm run typecheck` | Passed: shared, integrations, API | Strict-mode TypeScript compilation with 0 errors across workspaces. |
| Shared package build | Passed | Full ES and CommonJS builds emitted with clean typing. |
| `npm run check:schema` | Passed after reconciliation | 85 runtime registrations reconciled with 111 SQL tables, 0 gaps, 100% RLS declaration coverage. |
| Supabase CLI Linking | Passed on 2026-11-07 | Linked to project `cyloocrm` (`lehaslsprgbvkmbvaldh`, region `ap-southeast-2`). |
| Supabase Migration Push | Passed on 2026-11-07 | Migrations `0001_init.sql`, `0002_phase4.sql`, `0003_runtime_reconciliation.sql`, and `0004_zero_trust_authorization.sql` all pushed and verified live via `supabase db push --remote`. |
| Supabase TypeScript generation | Passed on 2026-11-07 | Authoritative TypeScript types generated directly from live remote Supabase catalog into `packages/database/supabase/database.types.ts` (141 kB). |
| Migration grammar parse | Parsed all four source migrations | Syntax-level parse verified for PostgreSQL 16/17 compliance. |
| Production startup guard | Passed | Importing the API store with `NODE_ENV=production` fails closed when `DATABASE_URL` is absent. `PostgresStore` adapter wired. |
| FastAPI AI service tests | Passed: 4 tests | Offline fallback, payload validation, health response, and awaited provider path. |
| Production Web Build | Passed: 20 routes | Next.js 15 App Router production bundle compiled and optimized cleanly. |
| Remote pgTAP RLS tests | Pending remote runner | pgTAP plan authored in `packages/database/supabase/tests/rls.test.sql`. Remote CLI runner requires Docker container execution. |

---

## Verified Schema Status on Supabase

- **Target Project**: `cyloocrm` (`lehaslsprgbvkmbvaldh`)
- **Region**: `ap-southeast-2`
- **Postgres Engine**: 17
- **Applied Migrations**:
  1. `0001_init.sql` (Initial core multi-tenant schema, FORCE RLS, baseline tables)
  2. `0002_phase4.sql` (Workflows, campaigns, audiences, and attribution)
  3. `0003_runtime_reconciliation.sql` (AI conversations/messages, DSAR, webhooks, social posts, number sequences)
  4. `0004_zero_trust_authorization.sql` (Departments, teams, team memberships, and zero-trust support access records)
- **Catalog Types**: Re-generated and synchronized at [`packages/database/supabase/database.types.ts`](file:///d:/BMSSYS/enterprise-crm/packages/database/supabase/database.types.ts).
