# GCC-CRM — Product Requirements (all modules A–U)

Multi-tenant, AI-powered CRM + omnichannel engagement SaaS for the GCC
(UAE, SA, QA, KW, BH, OM). Capability *categories* benchmarked against
HubSpot / Salesforce / Zoho CRM / GoHighLevel — original implementation,
no proprietary design/code copying.

Conventions: each module lists Capabilities, Core entities, and Phase-1
Acceptance criteria (later phases in backlog.md). Everything is traced in
traceability.csv. Blocked provider features are declared, never faked.

---

## A. Customer 360 CRM (Phase 1)
**Capabilities:** contacts, companies, households (company/parent grouping),
custom fields (definitions + values), tags, lifecycle stages, associations
(contact↔company, contact↔contact), activities + unified timeline,
segmentation (saved filters), dedupe/merge, CSV import/export.
**Entities:** tenants, users, memberships, roles, permissions, contacts,
companies, custom_field_definitions, custom_field_values, tags, tag_links,
associations, activity_events (immutable), segments, import_jobs/export_jobs.
**Phase-1 acceptance:** CRUD with server-side authz; contact↔company
association; timeline appends immutably; merge preserves history (merged_into
pointer + event); custom fields validated against definitions; tenant-scoped
list/filter/paginate; CSV export.

## B. Lead Hub (Phase 1 core, Phase 4 nurture)
**Capabilities:** multi-source capture (web form, API, imports, connector
ingest), UTM/attribution fields, scoring rules, qualification (MQL/SQL),
round-robin + ownership routing, SLA timers, nurture enrollment (→F/K),
conversion to opportunity/contact (source preserved), duplicate handling.
**Entities:** lead_sources, leads (with attribution JSONB), scoring_rules,
routing_rules, lead_sla_timers, conversions ledger.
**Phase-1 acceptance:** create lead with source+UTM persisted; dedupe by
(email, tenant); assignment via round-robin rule; score updates from events;
convert creates contact+opportunity atomically and marks lead converted
(idempotent).

## C. Sales Hub (Phase 1)
**Capabilities:** multiple pipelines, ordered stages, opportunities with
weighted forecast, Kanban (drag + keyboard alternative), quotes (versioned,
line items, discount approval), products & price lists, sales targets, tasks
(→L), commissions (recorded, computed from closed-won), approvals on
discount/amount thresholds.
**Entities:** pipelines, pipeline_stages, opportunities, products, price_lists,
quotes, quote_versions, quote_lines, approvals, sales_targets, commissions.
**Phase-1 acceptance:** multi-pipeline CRUD; stage moves validated (no skips
when configured); forecast = Σ weighted amount by close date; quote totals
from lines (no client-computed money); approval gate above tenant threshold.

## D. Omnichannel Inbox (Phase 2)
**Capabilities:** WhatsApp Business Platform, Instagram/Messenger (Meta),
TikTok Business Messaging (supported scope), Snapchat (supported marketing/
lead integrations), web chat widget, email, SMS, voice notes, Google Ads lead
attribution. Canonical conversation/message model normalized across
providers; media; assignments; status (open/pending/closed); tags; templates;
delivery receipts; retry policy; human takeover; 24h-window policy for WA.
**Entities:** channels, provider_accounts, provider_credentials (encrypted),
conversations, messages, message_attachments, message_templates,
delivery_receipts, webhook_events (dedupe key), routing/assignment rules.
**Acceptance (P2):** webhook endpoint acknowledges ≤200ms, persists raw event
durably, dedupes by provider event id, enqueues processing (outbox→BullMQ);
inbound messages create/append canonical conversation (out-of-order safe);
reply via provider adapter with status webhook updates; takeover switches
AI↔human and stops automation. **Blocked until provider credentials +
Meta/TikTok/Snapchat app review — adapters ship behind an "unconfigured"
state (never faked).**

## E. AI Agent Studio (Phase 3)
**Capabilities:** multilingual agents (AR/EN/HI/UR; MSA + Gulf dialects),
RAG over tenant knowledge, pgvector retrieval, tool calling (allowlisted,
permission-checked at action layer), lead qualification, support answers,
booking tools, approval gates for sensitive actions, prompt-injection
defenses, human handoff, evals + cost monitoring, per-tenant budgets.
**Entities:** agents, agent_versions, prompts, tools, tool_invocations,
knowledge_documents, knowledge_chunks, embeddings (pgvector), agent_runs,
handoff_events, eval_datasets, eval_runs, ai_budgets.
**Acceptance (P3):** agent answers only from permitted tenant corpus with
citations; tool calls re-verify user/tenant permissions server-side; external
actions require approval bound to payload hash; injection in retrieved docs
cannot expand permissions; provider outage → deterministic fallback; budget
cap enforced.

## F. Marketing Hub (Phase 4)
**Capabilities:** segments, visual campaign/journey builder, consent-aware
automation, triggers, drip campaigns, A/B testing, campaign analytics,
template library, suppression lists, frequency caps, attribution.
**Entities:** campaigns, campaign_variants, journeys, journey_steps,
audiences (segment snapshots), consents, consent_events, suppressions,
frequency_caps, marketing_emails/renders, attribution_touches.
**Acceptance (P4):** send only to consented, non-suppressed recipients
(re-checked at send time); frequency cap enforced; variant split tracked;
attribution links touches→leads/opportunities.

## G. Social Hub (Phase 5)
**Capabilities:** official-API scheduling, engagement inbox (comments),
content approval workflow, analytics. **Providers:** Meta (IG/FB) Graph API,
TikTok, Snapchat — only officially supported endpoints; no scraping.
**Entities:** social_accounts, social_posts, post_targets, comments,
approval_requests, social_metrics.
**Acceptance (P5):** schedule→publish via provider API; comments normalized
into engagement inbox; approval state machine (draft→review→approved→posted).

## H. Advertising Hub (Phase 5)
**Capabilities:** Google Ads, Meta Ads, TikTok Ads, Snapchat Ads connectors:
lead-form ingest, spend/impression metrics sync, UTM mapping, offline
conversion (C API / conversions APIs), CPL/CAC/ROAS dashboards.
**Entities:** ad_accounts, ad_campaigns, ad_metrics_daily, ad_lead_forms,
offline_conversions.
**Acceptance (P5):** OAuth connector health visible; nightly metrics sync
(idempotent upsert by date); lead forms create attributed leads; offline
conversion posts only consented events. **Requires developer-token /
app-review per provider — declared blocker until granted.**

## I. Scheduling Hub (Phase 3)
**Capabilities:** staff calendars, booking pages, availability rules,
resource allocation, timezone-aware (Asia/Dubai, Asia/Riyadh, Asia/Qatar,
Asia/Kuwait, Asia/Bahrain, Asia/Muscat) reminders, reschedule/cancel,
no-show detection, Google/Microsoft calendar sync (Phase 5 opt-in).
**Entities:** staff, availability_rules, resources, booking_pages,
appointments, appointment_reminders, calendar_integrations.
**Acceptance (P3):** double-booking prevented under concurrency; reminders
queued per timezone; cancellation frees slot; no-show flags after grace.

## J. Service Hub (Phase 5)
**Capabilities:** tickets, SLA policies (business calendars), queues,
escalations, knowledge base (shared with E), CSAT/NPS, customer portal,
AI assistance (draft replies).
**Entities:** tickets, ticket_comments, sla_policies, sla_timers, queues,
escalation_rules, kb_articles, csat_responses, portal_accounts, portal_grants.
**Acceptance (P5):** SLA computed on tenant business calendar; escalation on
breach; portal sees only granted tickets.

## K. Workflow Engine (Phase 4)
**Capabilities:** event triggers, conditions, branching, delays, schedules,
approvals, retries w/ backoff, idempotency keys, DLQ, workflow versioning,
dry-run, audit history.
**Entities:** workflow_definitions (versioned JSON), workflow_runs,
workflow_steps, workflow_events, dlq_entries.
**Acceptance (P4):** at-least-once execution with idempotent steps; failed
steps retry w/ backoff then DLQ + alert; dry-run produces plan without side
effects; every run auditable.

## L. Operations Hub (Phase 1 partial, Phase 4 full)
**Capabilities:** tasks with assignments/due dates, notifications, file
storage (signed URLs), approvals, team productivity views.
**Entities:** tasks, notifications, files, approvals, activity_feed.
**Phase-1 acceptance:** task CRUD + assignment + due reminders (via queue);
approval requests with decision audit.

## M. Analytics Hub (Phase 4/6)
**Capabilities:** report builder, revenue + funnel analytics, sales
performance, campaign ROI, response-time metrics, AI metrics, scheduled
reports (email/export).
**Entities:** report_definitions, report_runs, dashboards, dashboard_widgets,
metric_snapshots.
**Acceptance (P4):** funnel = leads→MQL→SQL→opportunity→won from recorded
events (not estimates); scheduled report re-checks recipient access at send.

## N. Commerce Hub (Phase 5)
**Capabilities:** product catalog (shared with C), quotations (shared),
VAT-aware tax computation (per-country rates as tenant configuration —
verified against official sources at implementation), payment links,
invoice integration, recurring billing, regional gateways (Stripe +
regional adapters behind one interface).
**Entities:** products, prices, tax_rates, payment_links, invoices,
subscriptions (tenant billing → Q), gateway_events.
**Acceptance (P5):** payment link → signed webhook → invoice state machine;
VAT snapshot on every line; no client-computed money.

## O. AI Voice Hub (Phase 5)
**Capabilities:** inbound/outbound telephony via supported providers
(Twilio or regional SIP), transcription, call summaries, voice assistant
(same tool layer as E), booking, routing, consent-gated recording +
retention. **Requires telephony credentials + local number provisioning —
declared blocker.**

## P. Conversion Hub (Phase 6)
**Capabilities:** hosted landing pages, forms, web chat (from D), booking
widgets (from I), website events (JS snippet → /collect), multilingual
content (AR/EN variants).
**Entities:** landing_pages, forms, form_submissions, chat_widgets,
website_events.
**Acceptance (P6):** form submission → lead with attribution; pageview/form
events deduped and attributed.

## Q. Multi-Tenant SaaS Hub (Phase 1 foundation, Phase 6 full)
**Capabilities:** tenant onboarding, trials, plans, usage metering, billing,
feature entitlements, limits, white-label (logo/colors/domain), reseller
workspaces (parent→child tenants), custom domains.
**Entities:** tenants, plans, plan_versions, subscriptions, entitlements,
usage_events, usage_aggregates, billing_customers, invoices (platform),
resellers, tenant_domains, branding_settings.
**Phase-1 acceptance:** signup → tenant + owner + membership atomic; plan
entitlements gate module APIs; usage metering rows written for metered
actions; trial expiry check server-side.

## R. Developer Hub (Phase 2+, Phase 6 full)
**Capabilities:** REST API (OpenAPI), webhooks (outbound, signed, retries),
OAuth 2.1 (PKCE) for connectors, API keys (hashed, scoped), connector health,
credentials vault (encrypted at rest), docs + sandbox tenant.
**Entities:** api_keys, oauth_clients, oauth_tokens, outbound_webhooks,
webhook_deliveries, integration_logs.
**Acceptance (P6):** outbound webhook HMAC-signed w/ retry+DLQ; key rotation;
health dashboard per connector.

## S. GCC Localization Hub (cross-cutting, Phase 1 foundation)
**Capabilities:** RTL + Arabic-first UX; currencies AED/SAR/QAR/KWD/BHD/OMR
(minor units: 2, except KWD/BHD/OMR = 3); VAT configuration per country
(tenant-configured, official-source verified before production); business
calendars (Sun–Thu vs Mon–Fri); ar-SA/ar-AE date & number formatting;
PDPL/privacy controls (consent registry, DSAR workflows); country-specific
retention + residency settings.
**Phase-1 acceptance:** money stored in minor units with per-currency
precision; locale switch EN↔AR with RTL; business calendar drives SLA/
availability; consent + DSAR tables exist and are enforced in flows that use
personal data.

## T. Industry Packs (Phase 6)
Real estate (listings, viewings, RERA-style pipeline), healthcare (consent,
appointment types, no PHI in AI prompts without policy), automotive (vin,
test drives), education (programs, applicants), hospitality (rooms, events),
retail (stores, POS sync), professional services (engagements, time).
Implemented as configuration + extension tables over the same domain core,
activated by plan entitlement.

## U. Governance Hub (Phase 1 foundation)
RBAC (tenant roles) + ABAC (ownership/sensitivity/branch), tenant isolation
(RLS + service-layer scope), SSO (SAML/OIDC via Supabase Auth or adapter —
Phase 6), MFA (enforceable policy), audit logs (immutable), secrets management
(env/secret-manager; app-level envelope encryption for provider credentials),
privacy requests (DSAR), data retention policies, DR (PITR backups + restore
test runbook).
**Phase-1 acceptance:** every object access authorized server-side; RLS
policies + isolation tests; admin actions audited; DSAR export workflow.

---

## Module dependency map (build order)
```
Q(tenancy/entitlements) ─┬─ U(governance) ─┬─ A(CRM 360) ──┬─ C(sales) ── N(commerce)
S(localization)──────────┘                 ├─ B(leads) ────┤
                                           │               └─ M(analytics)
                                           ├─ D(omni inbox) ── E(AI studio) ─ O(voice)
                                           │       │              └─ J(service)
                                           │       └─ F(marketing) ── G(social)
                                           ├─ K(workflows) ← triggers from all
                                           ├─ I(scheduling) ← E booking, J tickets
                                           └─ L(operations)
H(ads) → B(leads) → A · P(conversion) → B/A · R(developer) wraps all · T(packs) configures A/C/I/J
```
Phases: P1 = Q,U,S,A,B,C,L(core) · P2 = D,R(core),webhook pipeline ·
P3 = E,I · P4 = F,K,M · P5 = G,H,J,N,O · P6 = P,T,Q(full),R(full),hardening.
