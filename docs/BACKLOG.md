# Phased implementation backlog (acceptance criteria per phase)

## Phase 0 — Foundations ✅ (this delivery)
Docs: PRD (A–U), architecture+ADRs, ERD/SQL+RLS, threat model, integration
matrix, UI sitemap, traceability, test strategy, remediation register.
**Exit:** all 21 modules mapped; tenant-security design approved-in-repo.

## Phase 1 — Tenancy, governance, CRM core (current)
Scope: Q(foundation), U, S(foundation), A, B(core), C(core), L(core).
- packages/shared: zod schemas, money (3 currencies @3dp), RBAC matrix, tenant context
- gcc-crm/apps/api (NestJS): tenancy guard, contacts/companies/leads/
  pipelines/opportunities/tasks/timeline/audit modules; MemoryStore dev
  double (ADR-0004); REST /api/v1 + OpenAPI
- gcc-crm/apps/web (Next.js): shell, login, dashboard, contacts, deals kanban
- packages/database/supabase/migrations/0001_init.sql + 0002 phase-4 schema
**Acceptance:** API tests prove: cross-tenant 404 (no leak), RBAC 403,
timeline append-only, merge preserves history, quote totals server-computed,
lead convert idempotent, forecast = weighted sum. Web `next build` green.
CI: install→lint→typecheck→tests→build.

## Phase 2 — Inbox & webhook pipeline ✅ (implemented 2026-11-05)
Delivered: canonical conversation/message model; webhook ingest (verify →
durable persist → dedupe by provider event id → retry/DLQ); web-chat adapter
(first-party, widget-key auth); capability descriptors per integration matrix
with unconfigured states; sandbox configure endpoint (labelled test double);
outbound gates (channel status → consent ledger → suppression list);
human takeover + close; message forward-only status machine incl. out-of-order
receipts; inbox UI (split-pane, takeover, close) + channels UI; consent +
suppression endpoints (PDPL evidence). **Evidence: 17 new e2e checks
(33/33 total API).** Blocked (declared): WhatsApp/IG/Messenger/TikTok/Snapchat
credentials + app reviews; email/SMS provider accounts. BullMQ/Redis cutover
per ADR-0008 keeps the queue contract.

## Phase 3 — AI Agent Studio + Scheduling ✅ (implemented 2026-11-05)
Delivered: agent registry + versioned system prompts; governed tool layer
(5 tools, server-side permission re-check, honest denials); approval-gated
external email bound to payload hash; per-tenant AI budgets (plan-capped,
owner override); tenant-scoped RAG with local embeddings + citations +
revocation; injection-resistance eval; human handoff notifications; chat
history. Scheduling: staff/availability/booking pages, GCC-timezone slots
(fixed offsets, no DST), concurrency-safe double-booking prevention,
reminders, reschedule/cancel/no-show. **Evidence: 18 new e2e checks (51/51
total API).** Blocked (declared): live model calls (no provider keys —
deterministic engine per ADR-0009); pgvector at Supabase cutover;
Google/Microsoft calendar sync (Phase 5).

## Phase 4 — Marketing, workflows, analytics ✅ (implemented 2026-11-05)
Delivered: Workflow Engine (versioned DAGs, event triggers from CRM/leads/
sales, idempotent replay, retry→DLQ, dry-run, step audit); Marketing Hub
(campaigns with per-recipient consent → suppression → frequency-cap gates,
segment-snapshot audiences, template rendering, A/B variants, attribution
touches, honest per-recipient outcomes); Analytics (funnel, per-owner sales
performance, campaign metrics, response times — from recorded data only).
**Evidence: 16 new e2e checks (67/67 total API).** Blocked (declared):
email/WhatsApp provider delivery (test double), visual journey canvas
(Phase 6), scheduled report delivery (Phase 6).

## Phase 5 — Social, ads, service, commerce, voice ✅ (implemented 2026-11-05)
Delivered: Service Hub (tickets, SLA due-dates on sun_thu/mon_fri business
calendars with GCC fixed offsets, first-response tracking, idempotent breach
escalation sweep, resolve/reopen, CSAT/NPS + satisfaction summary, KB, portal
accounts/grants with granted-only portal API and portal-token guard support);
Commerce Hub (verified-tax-rate regulatory gate with source evidence, VAT
snapshots, KWD/BHD/OMR 3dp, invoice state machine, sandbox payment links,
signed gateway webhook with event dedupe + partial/full payment); Social
approval machine (draft→review→approved→scheduled→published; provider publish
refused as PROVIDER_UNCONFIGURED, labelled sandbox publish for pipeline
testing); Ads lead-form ingest with attribution + honest connector registry.
**Evidence: 12 new e2e checks (79/79 total API).** Blocked (declared): real
gateway (Stripe/regional), social provider APIs (app review), telephony/voice,
Google/Microsoft calendar sync.

## Phase 6 — Packs, white-label, hardening ✅ (implemented 2026-11-05)
Delivered: Developer Hub (hashed API keys with M2M auth + immediate
revocation; outbound webhooks with SSRF-guarded registration, HMAC signing,
retry→DLQ, delivery log); Governance automation (DSAR export + anonymizing
delete, retention sweeps with dry-run); Reseller/white-label (reseller
provisioning of child tenants, branding settings); Industry packs (7 GCC
verticals as configuration: custom fields + pipelines, idempotent
activation); Hardening (rate limiting on credential endpoints, security
headers, load probe script, DR backup/restore drill verified by suite).
**Evidence: 11 new e2e checks (90/90 total API) + load probe.**
Blocked (declared): Playwright visual baselines (no browsers in env), DAST
and external penetration test (need staging), k6 (use scripts/load.mjs probe),
Redis-backed rate limits and PITR backups (Supabase cutover).
