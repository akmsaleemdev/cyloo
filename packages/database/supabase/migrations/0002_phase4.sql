-- GCC-CRM 0002_phase4 — Phase 4 additions to 0001_init:
--   * consents.external_ref (P2 uses ref-based consent for portal-less channels)
--   * campaign_sends (per-recipient send ledger incl. skipped outcomes)
--   * workflow_versions table (0001 had version on workflows only)
--   * helpful indexes for analytics scans
alter table consents add column if not exists external_ref text;
create index if not exists consents_contact_channel on consents (tenant_id, contact_id, channel_kind, state);
create index if not exists consents_ref_channel on consents (tenant_id, external_ref, channel_kind, state);

create table if not exists campaign_sends (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  campaign_id uuid not null,
  contact_id uuid not null,
  channel_kind text not null,
  body text not null,
  status text not null default 'sent',      -- sent | skipped_no_consent | skipped_suppressed | skipped_frequency_cap
  sent_at timestamptz not null default now()
);
create index if not exists campaign_sends_cap on campaign_sends (tenant_id, contact_id, channel_kind, sent_at desc);
create index if not exists campaign_sends_campaign on campaign_sends (tenant_id, campaign_id);

create table if not exists workflow_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  workflow_id uuid not null,
  version int not null,
  definition jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (workflow_id, version)
);

create index if not exists workflows_trigger on workflows (tenant_id, trigger_event, active);
create index if not exists attribution_tenant_time on attribution_touches (tenant_id, occurred_at desc);

-- RLS on the new tenant tables
alter table campaign_sends enable row level security;
alter table campaign_sends force row level security;
create policy tenant_isolation on campaign_sends
  using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
alter table workflow_versions enable row level security;
alter table workflow_versions force row level security;
create policy tenant_isolation on workflow_versions
  using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
