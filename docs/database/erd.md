# Conceptual ERD (current SQL plus identified gaps)

This diagram summarizes core SQL relationships, not every column or an
assertion that runtime persistence is implemented. Relationships drawn as
tenant-owned should be strengthened with tenant-aware composite constraints
where the parent is tenant-owned.

```mermaid
erDiagram
  tenants ||--o{ memberships : contains
  tenants ||--o{ companies : owns
  tenants ||--o{ contacts : owns
  companies ||--o{ contacts : associates
  tenants ||--o{ leads : owns
  contacts ||--o{ leads : converts_from
  tenants ||--o{ pipelines : owns
  pipelines ||--o{ pipeline_stages : defines
  tenants ||--o{ opportunities : owns
  pipeline_stages ||--o{ opportunities : stage
  tenants ||--o{ quotes : owns
  quotes ||--o{ quote_lines : contains
  tenants ||--o{ channels : configures
  channels ||--o{ conversations : receives
  conversations ||--o{ messages : contains
  conversations ||--o{ ai_conversations : may_contextualize
  ai_conversations ||--o{ ai_messages : contains
  ai_conversations ||--o{ agent_runs : executes
  tenants ||--o{ workflows : owns
  workflows ||--o{ workflow_versions : versions
  workflow_versions ||--o{ workflow_runs : executes
  workflow_runs ||--o{ workflow_steps : contains
  tenants ||--o{ staff : employs
  staff ||--o{ availability_rules : schedules
  staff ||--o{ appointments : assigned
  tenants ||--o{ tickets : owns
  tickets ||--o{ ticket_comments : contains
  tenants ||--o{ campaigns : owns
  campaigns ||--o{ campaign_sends : records
  tenants ||--o{ invoices : bills
  invoices ||--o{ invoice_lines : contains
  tenants ||--o{ audit_events : records
```

Migration 0003 adds the tenant-scoped AI conversation and message relations
and uses `agent_runs` as the canonical run entity. Composite AI conversation
and message relationships are declared in SQL. This ERD describes source
migrations only; those migrations have not been executed against PostgreSQL.

Additional integrity issue: existing SQL foreign keys often reference
single-column IDs without `(tenant_id, parent_id)` constraints. Tenant RLS on
each table does not by itself ensure a child points to a parent in the same
tenant.
