# RLS policy inventory and gaps

## Source-level policy coverage

The migrations contain a dynamic `tenant_isolation` policy block, plus
special-case policies and later policies for newly reconciled relations.
Static source checking detects RLS enablement/policy declarations for all 111
declared tables. This does not prove the migrations executed or behave
correctly in Supabase.

| Relation class | Current policy | Risk / required test |
|---|---|---|
| Tenant tables in the 0001 loop | `tenant_id = current_tenant_id()` for use/check; FORCE RLS | Verify app transaction sets tenant GUC; test two tenants, writes, reads, updates and deletes. |
| `tenants` | Select where `id = current_tenant_id()` | Verify members can only resolve their authorized tenant; current function trusts a custom GUC. |
| `plans`, `plan_versions` | RLS enabled, global `USING (true)` read policy | Restrict writes to migration/operator role; verify grants. |
| `audit_events` | 0003 replaces permissive insert policy with a tenant check; adds mutation-rejecting trigger | Test as actual runtime role; verify grants, owner bypass and trigger behavior. |
| `campaign_sends`, `workflow_versions` | Tenant policy added in 0002 | Run the two-tenant policy tests against the migrated database. |
| `invoices`, `quotes`, `campaigns`, `audiences` | Tenant RLS plus 0004 owner/department/team columns; API applies record scope | Backfill/assign legacy rows and test same-tenant record visibility; API-only scope is not a substitute for PostgreSQL enforcement. |
| `resellers` | 0003 adds tenant RLS after populating tenant ownership from `parent_tenant_id` | Global platform administration path is not represented; review whether this tenant ownership matches intended model. |
| `roles` | 0003 allows built-in role reads and tenant-scoped writes | Confirm no other permissive policy and review privilege escalation boundaries. |
| `departments`, `teams`, `team_memberships` | 0004 applies tenant-only RLS; API scopes records by department/team/assignment | Backfill scope, test manager/team-leader boundaries, and verify database predicates after a PostgreSQL adapter exists. |
| `platform_memberships`, `support_access_*` | 0004 enables and forces RLS with no client policies | Access is intentionally denied until a trusted workflow verifies MFA, two distinct approvals, ≤60-minute expiry, revocation and each audited operation. |
| `tenant_domains` | 0003 adds tenant policy | Platform verification/ownership transfer requires a separate trusted operation. |
| `webhook_events` | 0003 denies unresolved `tenant_id IS NULL` rows to tenant roles | Inbound server ingest needs a restricted trusted role; define payload retention. |
| Supabase `auth.users` | Not created by migrations | Keep in `auth` schema; `public.users` is a minimal profile with self policies. |
| Storage buckets / objects | No storage policies in these migrations | Do not upload sensitive files until private-bucket and object-ownership policies are added and tested. |

## Policy design concerns

- Policies use `current_setting('app.tenant_id', true)` via
  `current_tenant_id()`, not a direct `auth.uid()` membership check. This can
  work only behind a trusted API connection that sets and clears tenant context
  transaction-locally and runs with a non-bypass role. The API currently has
  no PostgreSQL adapter.
- Do not give browser `anon`/authenticated roles direct table access until
  JWT-to-membership authorization and policy tests are designed. A publishable
  key is not a tenant authorization boundary.
- `REVOKE ... FROM PUBLIC` alone does not establish least privilege for a
  separately granted runtime role. Apply explicit grants/revokes and verify
  `rolbypassrls`, table grants, sequences, functions and default privileges.
- Review every nullable tenant key, parent-only relationship, view, function,
  trigger, storage object path and service-role operation.
- Department/team columns are nullable for legacy data. Unclassified records
  must remain inaccessible to non-owner/admin users unless individually
  assigned; do not broaden access to make legacy records visible.

## Required staging matrix

Test unauthenticated, tenant member, tenant admin, platform operator and
cross-tenant identities. For each applicable table, assert permitted and
denied `SELECT`, `INSERT`, `UPDATE` and `DELETE`; verify a mismatched-tenant
foreign key is rejected; verify tenant context does not leak across pooled
connections. The authored pgTAP suite is unrun in this environment; Docker/Podman is
unavailable, and no staging database has been inspected.
