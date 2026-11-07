# GCC-CRM — Production Readiness Report (2026-11-05, all phases delivered)

## Verified evidence (this environment, actual runs)

```
packages/shared (vitest)    11/11 passed
apps/api    (supertest e2e) 90/90 passed   [P1:16 P2:17 P3:18 P4:16 P5:12 P6:11]
apps/web    next build      ✓ 20 routes, strict TS
load probe  (dev store)     c=20: 735 rps, p50 19ms, p95 54ms
                            c=50: 894 rps, p50 42ms, p95 129ms  (0 errors, ~1550 reqs)
```

## Delivered by phase (all 21 modules A–U touched)
- **P0**: PRD (A–U), architecture + ADR-0003..0011, SQL schema (0001/0002) with
  FORCE RLS on all tenant tables, threat model, integration matrix, UI
  sitemap, traceability (75+ rows), remediation register.
- **P1** Q/U/S/A/B/C/L: atomic tenancy, RBAC+entitlements, tenant isolation
  (cross-tenant 404s proven), contacts/companies/custom-fields/merge,
  leads (attribution, scoring, round-robin, idempotent convert),
  pipelines/opportunities/weighted forecast, server-computed quotes +
  discount approvals, tasks. GCC money (2/3dp) unit-tested.
- **P2** D/R: canonical conversations, durable webhook ingest (verify→persist→
  dedupe→retry→DLQ), web-chat adapter live, capability descriptors with
  honest unconfigured states, consent/suppression gates, human takeover.
- **P3** E/I: governed tool layer (server-side permission re-checks), payload-
  hash approvals, per-tenant budgets, tenant-scoped RAG with citations +
  revocation, injection-resistance eval, handoff; scheduling with GCC tz
  slots and concurrency-safe double-booking prevention.
- **P4** F/K/M: versioned workflow DAGs (idempotent replay, branch conditions,
  retry→DLQ, dry-run), consent-aware campaigns (per-recipient gates, A/B,
  templates, frequency caps, attribution), funnel/performance analytics.
- **P5** J/G/H/N/O: tickets + calendar SLA + idempotent escalation, CSAT/NPS,
  portal with granted-only isolation; verified-tax-rate gate, invoice state
  machine, signed gateway webhook (dedupe, partial/full); social approval
  machine (provider publish refused honestly); ads lead ingest.
- **P6** R/U/Q/T: hashed API keys (M2M auth, instant revocation), SSRF-guarded
  HMAC outbound webhooks, DSAR export/anonymization, retention sweeps,
  reseller provisioning + branding, 7 industry packs, rate limiting, security
  headers, DR snapshot/restore drill (suite-verified), load probe.

## Honest production-readiness checklist

| Gate | Status |
|---|---|
| Multi-tenant isolation tests | ✅ 90/90 (service layer) |
| Database RLS verified at runtime | ⛔ BLOCKED — no Supabase/Postgres reachable; SQL + pgTAP plan delivered (R-01) |
| Supabase Auth / SSO / MFA | ⛔ at cutover (dev-token adapter behind the same guard contract) |
| Real payments gateway | ⛔ sandbox double only (contract proven: HMAC, dedupe, partial/full) |
| WhatsApp/IG/TikTok/Snapchat/email/SMS/voice live sending | ⛔ credentials + app reviews (declared; UI shows unconfigured) |
| Live AI model calls (OpenAI/Bedrock/Vertex via FastAPI) | ⛔ no keys; governance harness runs offline and gates the adapter |
| Playwright visual baselines / a11y audits | ⛔ no browsers in env |
| DAST + external pen test | ⛔ require staging |
| Load test at production scale | ⛔ dev-store probe only (numbers above are NOT production evidence) |
| Redis/BullMQ, PITR backups, Redis rate limits | ⛔ cutover items (contracts proven in-process) |

**Verdict**: NOT production ready. The API is wired only to `MemoryStore`;
there is no PostgreSQL adapter, and migrations/RLS have not been executed.
Migration 0003 and pgTAP coverage are source artifacts that still require
fresh/upgrade validation in isolated staging. This report's earlier
"credentials + adapter" cutover claim is not accurate.

## Known limitations (full list in remediation-register.md)
1. RLS/pgTAP unexecuted (R-01, highest).
2. Arabic covers UI chrome; long-form content EN-first.
3. Deterministic AI engine (no provider keys); FastAPI service stubbed as the
   cutover boundary.
4. Inbox poll-based (8s) in the web UI; realtime channels at cutover.
5. Journey visual canvas scheduled as post-cutover polish.
