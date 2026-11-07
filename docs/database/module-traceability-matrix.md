# 30-module schema and implementation traceability

“Present” means source-level API/schema evidence exists; it does **not** mean
production-ready or Postgres-backed. The current API is wired to `MemoryStore`,
and the 90 API E2E tests are in-memory. Supabase adapters, live RLS, and
provider integrations remain separate gates.

| # | Product module | Source coverage / tables | Status and gap |
|---:|---|---|---|
| 01 | Customer 360 | CRM API; companies, contacts, associations, custom fields, activity | Partial: `associations` SQL-only; no persistent adapter. |
| 02 | Lead Management | Leads API; leads, lead_sources, scoring_rules, routing_rules | Source implemented; storage is in-memory. |
| 03 | Sales Pipeline | Sales API; pipelines, stages, opportunities | Source implemented; tenant-aware FK contract needs hardening. |
| 04 | Sales Enablement and Quotations | quotes, quote_lines, quote_versions, approvals | Source implemented; runtime registry now includes `quote_lines`. |
| 05 | Account and Territory | companies and association schema | Partial: no clear territory model/API found. |
| 06 | Unified Inbox | inbox API; channels, conversations, messages, receipts | Source implemented; provider-account persistence and RLS need live verification. |
| 07 | WhatsApp Automation | Inbox/webhook/consent paths; channels, webhook_events, consents | Partial: provider delivery is unconfigured; unresolved webhook events require trusted server-side ingest. |
| 08 | Social Communication | social API and lead-form ingest | Partial: `social_accounts` is unused; provider/secret persistence contract missing. |
| 09 | Email, SMS and Voice | Integration abstractions and channel model | Partial: provider setup is unconfigured; voice/call persistence not established. |
| 10 | AI Agent Studio | AI API; agents, versions, tool invocations, knowledge, AI transcripts | Partial: AI conversation/message schema added; local deterministic path only; no PostgreSQL adapter. |
| 11 | AI Voice | AI service accepts a `voice` agent kind | Not end-to-end: no voice provider, call lifecycle or durable call schema found. |
| 12 | Workflow Automation | workflow API; workflows, versions, runs, steps, DLQ | Partial: domain bus is in-process; no transactional outbox or live queue integration evidence. |
| 13 | Predictive Intelligence | scoring rules and analytics support | Partial: no predictive model lifecycle/feature pipeline found. |
| 14 | Marketing Campaigns | marketing API; campaigns, audiences, campaign_sends, consents | Partial: number counter renamed `number_sequences`; no marketing sequence runtime schema. |
| 15 | Social Marketing | social API; runtime `social_posts` | Partial: SQL schema added; publishing adapters unverified. |
| 16 | Advertising Attribution | attribution_touches and lead-form ingest | Partial: no ad-account/campaign integration schema or live provider validation. |
| 17 | Website, Landing Pages and Forms | No matching API module/table group found | Not evidenced in current implementation; schema/API work required. |
| 18 | Helpdesk | service API; tickets, comments, queues, SLA, KB, CSAT/NPS | Source implemented; persistent storage not connected. |
| 19 | Scheduling | scheduling API; staff, availability, pages, appointments | Partial: in-memory serialization masks DB concurrency; add exclusion/locking strategy. |
| 20 | Tasks, Projects and Operations | ops API; tasks, notifications, audit | Partial: task operations exist; project model/API not found. |
| 21 | Customer Portal | portal_accounts, grants, portal login/API | Partial: Supabase identity integration not implemented; data remains in memory. |
| 22 | Commerce Orders | commerce API; products, quotes, invoices, payment links | Partial: no order/order-line entity or complete payment/refund lifecycle found. |
| 23 | Billing and Subscriptions | plans, plan_versions, subscriptions, usage schema | Schema-only: no registered/runtime billing repository or module callers found. |
| 24 | Revenue Analytics | analytics/report/snapshot SQL; marketing metrics | Partial: reporting SQL is largely unreferenced; no demonstrated persisted analytics pipeline. |
| 25 | Multi-Tenant SaaS | tenants, memberships, tenant guard, entitlements | Source-level dev tenancy exists; production auth and PostgreSQL tenant context are missing. |
| 26 | Super Admin and White Label | resellers, tenant_domains, platform routes | Partial: no explicit global platform-role model; reseller/domain RLS decisions unresolved. |
| 27 | Security and Governance | audit, consent, DSAR, retention code | Partial/high risk: DSAR schema and audit policy fix added; RLS not executed. |
| 28 | Integrations and Developer API | API keys, webhook API, integration package | Partial: webhook schemas and encrypted secret storage added; retries are not PostgreSQL-backed. |
| 29 | GCC Localization | currency/money helpers, tax versions, GCC timezone rules | Partial: tax rates require official human verification; fixed timezone support is limited. |
| 30 | Industry Extensions | platform industry-pack API and tests | Partial: template persistence and full pack lifecycle are not established. |

## Evidence needed to promote statuses

- PostgreSQL repositories with typed table/column contracts and production
  startup failing fast when `DATABASE_URL` is absent.
- Fresh and upgrade migration tests, followed by two-tenant RLS/API tests.
- Module-specific provider sandbox evidence for external channels/payments.
- Browser E2E tests for UI flows; existing API tests do not establish browser
  behavior or database persistence.
