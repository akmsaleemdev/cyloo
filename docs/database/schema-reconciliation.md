# Schema reconciliation

## Executive decision

Do **not** connect the current API to the migrated schema by adding a generic
SQL adapter around `Db`. `Db` takes JavaScript predicate callbacks (`find`,
`one`, `tfind`, `tone`); these cannot be safely or efficiently translated into
parameterized SQL. First define repository/query contracts and reconcile the
actual table and column semantics.

No Supabase staging catalog was available. All dispositions below are
source-based and remain unverified against live data.

## Runtime names reconciled in 0003

The migration adds tenant-scoped `ai_conversations`, `ai_messages`,
`dsar_requests`, `outbound_webhooks`, `webhook_deliveries`, and `social_posts`;
it adds a minimal `users` profile referencing `auth.users`. It maps runtime
AI executions to the existing `agent_runs` table and ticket counters to the
new `number_sequences` relation. The API registry also includes existing SQL
`quote_lines`. The unused `social_accounts` registration was removed.

These are schema declarations, not proof that every API field or operation
has been exercised through PostgreSQL. There is no PostgreSQL adapter yet.

## Authorization foundation in 0004

The additive 0004 migration adds departments, teams, membership-to-team links,
nullable same-tenant department/team assignment columns, ticket assignees, and
owner scoping for invoices, quotes, campaigns, and audiences.
It also separates platform identities from tenant membership roles and creates
bounded support-access request, approval and audit tables. Support tables are
RLS-enabled with no client policies, so the support workflow remains
unavailable until trusted authentication, MFA, independent approvals,
tenant-admin approval, expiry/revocation checks and per-operation audit writes
are implemented end-to-end.

The API authorization helpers now separate platform/sensitive permissions
from tenant wildcards, restrict role delegation and apply assignment,
department and team scopes to primary CRM, lead, sales, commerce, marketing,
task, ticket and inbox paths. Broad module wildcards do not imply tenant-wide
record access; that requires an explicit `*.read_all`/`*.write_all` permission
or an owner/admin role. This is not a production cutover: every
background/service path, PostgreSQL repository predicates and live RLS behavior
still require integration and staging verification.

## SQL tables not in the registry

The 26 SQL-only relations are intentionally not registered as runtime
collections because no direct API table calls use them. They include
`associations`, `commissions`, `dashboard_widgets`, `dashboards`, `export_jobs`,
`files`, `import_jobs`, `integration_logs`, `journey_steps`, `metric_snapshots`,
`platform_memberships`, `plan_versions`, `plans`, `price_list_items`,
`price_lists`, `report_definitions`, `report_runs`, `sales_targets`,
`subscriptions`, `support_access_approvals`, `support_access_audit`,
`support_access_requests`, `tag_links`, `tags`, `tenant_domains`, and
`usage_aggregates`. No direct usage does not establish
that these are safe to remove; they remain schema-only/future-owned.

`agent_runs` is used by the API as the canonical AI-run relation. These
schema-only tables remain classified but are not automatically safe to remove.

## Data integrity and migration risks

1. Many tenant-owned foreign keys reference a record UUID without including
   `tenant_id`; DB constraints therefore do not themselves prove same-tenant
   parentage. Add composite unique keys/FKs where practical and retain service
   authorization checks.
2. `webhook_events.tenant_id` remains nullable for pre-resolution events.
   Migration 0003 adds RLS that rejects null tenant IDs for tenant roles. A
   trusted server-side ingest path and bounded payload retention are still
   required.
3. Migration 0003 adds tenant RLS for `tenant_domains` and `resellers`, plus
   tenant-owned role policies and read-only access for built-in roles. These
   policies have not been executed against PostgreSQL.
4. Migration 0003 replaces the permissive `audit_insert` policy and adds
   mutation-rejecting triggers for `audit_events` and `activity_events`.
   Grants, owner/superuser bypass behavior and triggers still need live tests.
5. The policy helper relies on the custom `app.tenant_id` GUC rather than
   directly checking Supabase `auth.uid()` membership. This requires a
   trusted server-only connection model, correct per-transaction GUC setup,
   strict grants and pool reset semantics. None is wired or tested yet.
6. `0003_runtime_reconciliation.sql` enables RLS for newly added tenant
   tables. Static source checks detect coverage for all declared relations;
   this is not runtime verification. Add coverage whenever a tenant relation
   is introduced.
7. Supabase CLI configuration is checked in. The four-digit migration names
   and migration-history behavior have not been verified against local or
   staging Postgres in this environment.
8. Generated Supabase types are not checked in because no database has been
   available to generate authoritative types from.

## Safe resolution order

1. Capture live staging migration history/catalog and backup; classify existing
   relations before applying 0003.
2. Verify fresh bootstrap and upgrade paths with a PostgreSQL/Supabase instance.
3. Generate authoritative database types and compare actual column contracts
   with all API reads/writes.
4. Move modules to typed repositories and parameterized PostgreSQL queries;
   verify affected API behavior and transaction semantics.
5. Run two-tenant RLS, privilege, concurrency, migration-upgrade and restore
   tests before approving a production migration.

No destructive SQL or production migration was run.
