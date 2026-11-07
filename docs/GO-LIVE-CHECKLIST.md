# CYLOO — Go-Live Readiness Checklist

## Database & Core Architecture Audit Status (Updated 2026-11-07)

- [x] **Static Schema Inventory & Contract Check**:
  - Reconciled 85 runtime registered tables with 111 SQL declared tables across 4 migrations (`0001_init.sql`, `0002_phase4.sql`, `0003_runtime_reconciliation.sql`, `0004_zero_trust_authorization.sql`).
  - Zero missing tables between runtime registry, API literal calls, and migrations (`node scripts/check-schema-contract.mjs` exits with code 0).
  - 100% RLS declaration coverage across all 111 declared relations.
- [x] **Automated Monorepo Test Suites**:
  - All 111 tests passing (14 in `@crm/shared`, 97 in `@crm/api`).
  - Zero TypeScript typecheck errors in strict mode across `@crm/shared`, `@crm/integrations`, `@crm/api`.
- [x] **Production Build Verification**:
  - Next.js 15 App Router production build succeeded (20 static/dynamic routes compiled).
- [x] **PostgreSQL Persistence Adapter**:
  - Implemented `PostgresStore` (`apps/api/src/common/postgres-store.ts`) with parameterized SQL query execution, transaction support, connection pooling, RLS GUC (`app.tenant_id`) scoping, optimistic locking via `row_version`, and error translation.
  - Wired in `apps/api/src/common/store.ts` via `createStore()`; production startup immediately fails closed if `NODE_ENV === 'production'` and `DATABASE_URL` is missing.
- [x] **Zero-Trust Authorization & Live Database Migration**:
  - Authored migration `0004_zero_trust_authorization.sql` with departments, teams, team memberships, and tamper-evident client-denied support access audit tables.
  - Successfully connected Supabase CLI and pushed migration `0004_zero_trust_authorization.sql` to live remote project `cyloocrm` (`lehaslsprgbvkmbvaldh`, region `ap-southeast-2`).
  - Generated authoritative TypeScript database types from the live remote schema into `packages/database/supabase/database.types.ts` (141 kB).
- [ ] **Live Staging PostgreSQL Execution**:
  - Run pgTAP suite (`packages/database/supabase/tests/rls.test.sql`) against live PostgreSQL once Docker runner is available.
- [ ] **External Credentials & Integration Approvals**:
  - Meta App Review & WABA registration for live WhatsApp Cloud API sending.
  - Payment gateway merchant account activation (Stripe / Telr / HyperPay).
  - Live AI model provider API keys (OpenAI / Anthropic / AWS Bedrock).

---

## A. Execution Sequence (Requires Owner Credentials)
1. **Supabase Staging Rehearsal**:
   - Preview migration history: `supabase db push --dry-run --workdir packages/database`
   - Apply migration 0004 to staging project.
   - Run pgTAP tests against live staging database.
2. **Vercel Web Deployment**:
   - Import `apps/web` into Vercel.
   - Set environment variables (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_ENV`).
   - Configure custom domain and SSL certificates.
3. **API & Worker Hosting (AWS ECS Fargate)**:
   - Build and publish Docker container images for API and workers.
   - Set secrets via AWS Secrets Manager (`DATABASE_URL`, `APP_ENCRYPTION_KEY`, `DEV_AUTH_SECRET`).
   - Configure health check probe at `/api/v1/health`.
4. **Third-Party Provider Onboarding**:
   - Meta Business Manager verification & WABA phone registration.
   - Verified DNS records (SPF, DKIM, DMARC) for transactional email provider.
   - Regional GCC payment gateway merchant activation.
5. **Disaster Recovery & PITR Drill**:
   - Perform test point-in-time recovery to an isolated staging branch and verify data integrity.

---

## B. Public Launch Acceptance Gates

| Gate | Status | Evidence / Requirement |
|---|---|---|
| **Multi-tenant isolation (service layer)** | ✅ Passed | 97/97 API E2E tests passing with strict tenant boundary checks |
| **Monorepo Typecheck & Build** | ✅ Passed | TypeScript strict mode clean; Next.js 20 routes packaged |
| **Schema Contract Reconciliation** | ✅ Passed | 85 runtime tables mapped to 111 SQL tables, 0 gaps |
| **PostgreSQL Persistence Adapter** | ✅ Implemented | `PostgresStore` implemented; fails closed if `DATABASE_URL` absent in prod |
| **Database RLS runtime execution** | ⛔ Blocked | Requires live staging Supabase push & pgTAP execution with Docker |
| **Real payment gateway sandbox** | ⛔ Blocked | Adapter state machine tested; requires live gateway API keys |
| **WhatsApp live message delivery** | ⛔ Blocked | Webhook & consent engine tested; requires Meta WABA approval |
| **Live AI provider calls** | ⛔ Blocked | Governed tool harness passes; requires OpenAI/Anthropic/Bedrock keys |
| **Disaster recovery PITR drill** | ⛔ Blocked | Local snapshot/restore tested; staging restore drill pending |

---

## C. Known Limitations at Go-Live
1. **Arabic Localization**: UI chrome, navigation, typography, and RTL layout complete; long-form knowledge base articles remain English-first.
2. **Inbox Realtime**: Fallback 8-second polling active until Supabase Realtime WebSocket subscription is wired in production web client.
3. **External Messaging Channels**: Unconfigured providers honestly surface HTTP 409 `CHANNEL_UNCONFIGURED` and display missing prerequisite requirements in UI.
4. **Voice Telephony**: Local telephony consent model implemented; live SIP trunk / Twilio binding deferred until regional telco approval.
