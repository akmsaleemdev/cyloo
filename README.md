# enterprise-crm

Multi-tenant AI CRM + omnichannel engagement SaaS for the GCC — clean
monorepo. Docs in [`docs/`](docs/) (PRD, architecture + ADRs, threat model,
deployment runbooks for [AWS](docs/DEPLOYMENT-AWS.md) and
[Vercel](docs/DEPLOYMENT-VERCEL.md), integration inventory, go-live checklist).

```
apps/
  web/          Next.js CRM (apps router, RTL, dark/light)
  api/          NestJS backend — 15 domain modules, /api/v1 + OpenAPI
  ai-service/   FastAPI model gateway (provider-agnostic, honest fallback)
workers/
  messaging/    BullMQ consumer (inbox events, outbound webhooks)
  automation/   BullMQ consumer (workflow steps, DLQ replay)
packages/
  shared/       domain core: zod schemas, GCC money, RBAC, TenantStore
  database/     schema authority: SQL migrations with FORCE RLS
  integrations/ channel capability descriptors + adapter contracts
  ui/           design-system tokens (single CSS source of truth)
infrastructure/
  aws/          ECR push, ECS task definitions
  terraform/    bootstrap: ECR, logs, SNS, GitHub OIDC deploy role
docker/         production Dockerfiles + dev compose
.github/workflows/  CI (tests+builds) and AWS deploy (OIDC, auto-rollback)
```

## Quick start (local dev — MemoryStore per ADR-0004)
```bash
npm install
npm run build          # shared → integrations → api → web (ordered)
npm test               # 11 core unit + 90 API e2e
npm run build -w @crm/web
npm start -w @crm/api  # API :3001
npm run dev -w @crm/web
```

## Test evidence
- `npm test` → **101 checks** (11 core unit + 90 API e2e across 6 phases)
- CI: [.github/workflows/ci.yml](.github/workflows/ci.yml) — install → build
  (ordered) → unit → typecheck → e2e → web build → secret scan
- Blocked gates (runtime RLS, live providers) tracked in
  [docs/remediation-register.md](docs/remediation-register.md)

## Legacy
The original BMSSYS reference build lives at the repo root (`app/`, 108-check
suite) and is preserved untouched; this monorepo is the deployable product.
