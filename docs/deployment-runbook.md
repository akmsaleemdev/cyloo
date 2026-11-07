# CYLOO — Deployment Runbook & Disaster Recovery Guide

## 1. Environment Architecture

```
                    ┌─────────────────────────┐
                    │      Route 53 / DNS     │
                    │   (Custom Domain / SSL) │
                    └────────────┬────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 │                               │
                 ▼                               ▼
       ┌───────────────────┐           ┌───────────────────┐
       │   Vercel Edge     │           │   AWS ALB (ECS)   │
       │   Next.js 15 Web  │           │   NestJS 11 API   │
       │   App Router      │           │   FastAPI AI Svc  │
       └───────────────────┘           └─────────┬─────────┘
                                                 │
                                                 ▼
                                       ┌───────────────────┐
                                       │ Supabase Postgres │
                                       │ Versioned Schema  │
                                       │ FORCE RLS Active  │
                                       └───────────────────┘
```

---

## 2. Pre-Deployment Quality Gates

Before any deployment to Staging or Production, the following local gates must be confirmed green:
1. **Schema Check**: `node scripts/check-schema-contract.mjs` (0 gaps, 0 un-migrated tables).
2. **Typecheck**: `npm run typecheck` (zero TypeScript errors).
3. **Automated Suite**: `npm test` (all 111 unit/E2E tests pass).
4. **Production Build**: `npm run build` (Next.js and NestJS compile clean).
5. **Secrets Hygiene**: Confirm no `.env` files or credentials are committed to version control.

---

## 3. Database Migration Runbook

All database changes are additive, ordered, and version-controlled under `packages/database/supabase/migrations/`:
- `0001_init.sql`: Core schema, multi-tenant tables, baseline RLS.
- `0002_phase4.sql`: Workflow automation, campaigns, and advanced analytics.
- `0003_runtime_reconciliation.sql`: AI transcripts, DSAR, webhooks, and number sequences.
- `0004_zero_trust_authorization.sql`: Departments, teams, team memberships, and zero-trust support access tables.

### Staging Migration Execution
```bash
# 1. Inspect remote differences without applying
supabase db push --dry-run --workdir packages/database

# 2. Apply migrations to staging database
supabase db push --workdir packages/database

# 3. Verify applied migrations
supabase migration list --workdir packages/database
```

### Production Migration Safety Rules
- Migrations must be run and verified on staging before production.
- Production migrations require an explicit owner approval gate in CI/CD (`.github/workflows/aws-deploy.yml`).
- Destructive commands (`DROP TABLE`, `TRUNCATE`, destructive alter) are strictly prohibited.

---

## 4. Application Service Deployment

### A. Web Frontend (Vercel)
- **Deployment Trigger**: Push to `main` branch deploys to Preview; manual release tag promotes to Production.
- **Environment Variables**:
  - `NEXT_PUBLIC_API_URL`: Public URL of the backend NestJS API (e.g. `https://api.cyloo.io`).
  - `NEXT_PUBLIC_APP_ENV`: `production` or `staging`.

### B. Backend API & Workers (AWS ECS Fargate)
1. **Container Build & Push**:
   ```bash
   docker build -f docker/Dockerfile.api -t $ECR_REPO/cyloo-api:$GIT_SHA .
   docker push $ECR_REPO/cyloo-api:$GIT_SHA
   ```
2. **Task Definition Update**: Register updated image tag in `taskdef-api.json`.
3. **Rolling Service Update**: Deploy with 200% maximum / 100% minimum healthy percentage.
4. **Health Probe Verification**:
   ```bash
   curl -fI https://api.cyloo.io/api/v1/health
   ```

---

## 5. Rollback Procedures

### Scenario A: Web Frontend Failure
- **Action**: In the Vercel Dashboard, select the previous stable deployment and click **Promote to Production** (instant zero-downtime rollback).

### Scenario B: API Service Failure
- **Action**: In AWS ECS, update the service task definition revision back to `n-1`:
  ```bash
  aws ecs update-service --cluster cyloo-prod --service cyloo-api --task-definition cyloo-api:<previous-revision>
  ```

### Scenario C: Database Data Corruption / Migration Anomaly
Because migrations are strictly additive, schema rollback does not require immediate table drops. If data corruption occurs:
1. **Point-In-Time Recovery (PITR)**:
   - Access Supabase Dashboard -> Database -> Backups.
   - Initiate Point-in-Time Recovery to a timestamp immediately prior to migration execution (e.g., `T-5 minutes`).
   - Restore to a verified staging branch and run `npm test` against the restored catalog.
2. **Application Drain**: Put API in maintenance mode (`MAINTENANCE_MODE=true`) while PITR completes to prevent inconsistent transactional writes.

---

## 6. Disaster Recovery & PITR Drill Checklist
- [x] Verified in-memory snapshot/restore logic in `packages/shared/src/store.ts` (`snapshotTenant` / `restoreTenant`).
- [ ] Schedule bi-monthly automated staging PITR restore drill to a temporary branch.
- [ ] Measure RTO (Recovery Time Objective): target < 30 minutes.
- [ ] Measure RPO (Recovery Point Objective): target < 5 minutes via continuous WAL archiving.

