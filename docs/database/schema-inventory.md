# Database and runtime schema inventory

## Scope and evidence

This inventory compares `apps/api/src/common/store.ts`, direct database table
call sites under `apps/api/src`, and the ordered SQL in
`packages/database/supabase/migrations`. It is a source inventory only: no live
Supabase catalog or migration history was queried. See
[`../../reports/schema-diff.json`](../../reports/schema-diff.json) for the
machine-readable name-level comparison.

| Inventory | Count | Evidence |
|---|---:|---|
| Runtime MemoryStore registrations | 85 | `TABLES` in `apps/api/src/common/store.ts` |
| SQL tables created by 0001–0004 | 111 | Counted from checked-in migrations |
| Registered names without a SQL table | 0 | All runtime names now have a declared SQL relation |
| SQL names absent from the registry | 26 | Schema-only/future infrastructure; listed below and classified |
| Distinct API-referenced tables | 80 | All literal API references are registered and have SQL tables |
| API-referenced names with no SQL table | 0 | Verified by `npm run check:schema` |
| SQL tables without detected RLS | 0 | Static policy coverage only; live behavior remains untested |

The Supabase CLI configuration is present. Generated database types and typed
PostgreSQL repositories are not. `MemoryStore` remains the only store wired by
`apps/api/src/common/store.ts`, and production API startup now fails closed
instead of silently starting with in-memory persistence.

## Runtime tables

`activity_events`, `agent_runs`, `agent_versions`, `agents`, `ai_budgets`,
`ai_conversations`, `ai_messages`, `api_keys`,
`appointment_reminders`, `appointments`, `approvals`, `attribution_touches`,
`audiences`, `audit_events`, `availability_rules`, `booking_pages`,
`campaign_sends`, `campaigns`, `channels`, `companies`, `consents`, `contacts`,
`conversations`, `csat_responses`, `custom_field_definitions`,
`custom_field_values`, `departments`, `delivery_receipts`, `dlq_entries`, `dsar_requests`,
`frequency_caps`, `gateway_events`, `invoice_lines`, `invoices`, `kb_articles`,
`knowledge_chunks`, `knowledge_documents`, `lead_sources`, `leads`,
`memberships`, `message_attachments`, `message_templates`, `messages`,
`notifications`, `nps_responses`, `opportunities`, `outbound_webhooks`,
`payment_links`, `number_sequences`, `pipeline_stages`, `pipelines`, `portal_accounts`,
`portal_grants`, `products`, `provider_accounts`, `provider_credentials`,
`queues`, `quote_lines`, `quote_versions`, `quotes`, `resellers`, `roles`, `routing_rules`,
`scoring_rules`, `segments`, `sla_policies`,
`social_posts`, `staff`, `suppressions`, `tasks`, `tax_rate_versions`,
`tenants`, `ticket_comments`, `tickets`, `tool_invocations`, `usage_events`,
`team_memberships`, `teams`, `users`, `webhook_deliveries`, `webhook_events`, `workflow_runs`,
`workflow_steps`, `workflow_versions`, `workflows`.

## SQL migration tables by domain

- **Tenancy / CRM / operations:** tenants, memberships, roles, api_keys,
  audit_events, companies, contacts, custom_field_definitions,
  custom_field_values, tags, tag_links, associations, activity_events, segments,
  import_jobs, export_jobs, lead_sources, leads, scoring_rules, routing_rules,
  pipelines, pipeline_stages, opportunities, quotes, quote_lines, quote_versions,
  approvals, sales_targets, commissions, tasks, notifications.
- **Messaging / marketing / workflows:** channels, provider_accounts,
  provider_credentials, conversations, messages, message_attachments,
  message_templates, webhook_events, delivery_receipts, campaigns, audiences,
  consents, suppressions, frequency_caps, journey_steps, attribution_touches,
  workflows, workflow_runs, workflow_steps, dlq_entries, campaign_sends,
  workflow_versions.
- **AI / scheduling / service:** agents, agent_versions, tool_invocations,
  agent_runs, knowledge_documents, knowledge_chunks, ai_budgets, staff,
  availability_rules, booking_pages, appointments, appointment_reminders,
  sla_policies, queues, tickets, ticket_comments, kb_articles, csat_responses,
  nps_responses, portal_accounts, portal_grants.
- **Commerce / billing / analytics / platform:** products, price_lists,
  price_list_items, tax_rate_versions, payment_links, invoices, invoice_lines,
  gateway_events, plans, plan_versions, subscriptions, usage_events,
  usage_aggregates, resellers, tenant_domains, report_definitions, report_runs,
  dashboards, dashboard_widgets, metric_snapshots, files, integration_logs.

## Important implementation boundaries

- The API E2E suite constructs a fresh `MemoryStore`; test behavior does not
  exercise Postgres transactions or SQL RLS.
- `apps/api/src/common/events.ts` is an in-process event bus. Its comment
  describes a transactional outbox as a future `PgStore` cutover, but there is
  no outbox table in these migrations.
- The AI gateway is a separate FastAPI service. `ai_runs` was reconciled to
  SQL `agent_runs`; ticket/document counters were renamed from ambiguous
  `sequences` to `number_sequences`. `social_accounts` was removed from the
  runtime registry because no API call site uses it; revisit only with an
  implementing module.
- Database migrations have no verified live application status. Do not infer
  which SQL was applied in Supabase from local files.
