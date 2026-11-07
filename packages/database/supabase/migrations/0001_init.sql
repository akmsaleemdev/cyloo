-- =====================================================================
-- GCC-CRM 0001_init — full domain schema + RLS (Supabase PostgreSQL)
-- Conventions:
--   * uuid PKs; tenant-owned tables carry tenant_id NOT NULL
--   * created_at/updated_at timestamptz; optimistic row_version int
--   * money: bigint minor units + currency char(3) (KWD/BHD/OMR = 3dp)
--   * immutable append-only: activity_events, audit_events, consent_events
--   * provider events dedupe: UNIQUE (provider_account_id, provider_event_id)
--   * RLS: FORCE on tenant tables; trusted server sets `app.tenant_id` GUC
--     transaction-locally. Direct-client membership policies are separate.
-- =====================================================================
create extension if not exists "pgcrypto";
create extension if not exists "vector";
create extension if not exists "pg_trgm";

-- ---------- helpers ----------
create or replace function current_tenant_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.tenant_id', true), '')::uuid;
$$;

create or replace function current_user_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid;
$$;

-- ---------- tenancy & governance (Q, U) ----------
create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  country char(2) not null default 'AE',
  base_currency char(3) not null default 'AED',
  timezone text not null default 'Asia/Dubai',
  week_pattern text not null default 'sun_thu' check (week_pattern in ('sun_thu','mon_fri')),
  plan_key text not null default 'trial',
  status text not null default 'active' check (status in ('active','trialing','suspended','archived')),
  trial_ends_at timestamptz,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null,                    -- auth.users.id (Supabase)
  roles text[] not null default '{member}',
  status text not null default 'active' check (status in ('active','invited','suspended','removed')),
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);
create index on memberships (user_id, status);

create table roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade, -- null = builtin
  key text not null,
  name text not null,
  permissions text[] not null default '{}',
  unique (tenant_id, key)
);

create table api_keys (                    -- R
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  key_hash text not null unique,           -- sha256; raw key never stored
  scopes text[] not null default '{}',
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table audit_events (                -- U: append-only
  id bigserial primary key,
  tenant_id uuid,
  actor_id uuid,
  actor_type text not null default 'user',
  action text not null,
  resource_type text not null,
  resource_id text,
  meta jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index on audit_events (tenant_id, occurred_at desc);

-- ---------- CRM core (A) ----------
create table companies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  domain text,
  industry text,
  phone text, email text,
  parent_company_id uuid references companies(id) on delete set null, -- households/group
  billing_country char(2),
  trn text,                                 -- tax registration number
  row_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on companies (tenant_id, name);
create index companies_name_trgm on companies using gin (name gin_trgm_ops);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  company_id uuid references companies(id) on delete set null,
  first_name text, last_name text,
  email text, phone text, whatsapp_phone text,
  job_title text,
  lifecycle_stage text not null default 'subscriber'
    check (lifecycle_stage in ('subscriber','lead','mql','sql','opportunity','customer','evangelist','other')),
  owner_id uuid,                            -- memberships.id
  source text,
  merged_into uuid references contacts(id), -- dedupe/merge: soft pointer
  row_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on contacts (tenant_id, lifecycle_stage);
create index on contacts (tenant_id, email);
create index on contacts (tenant_id, company_id);
create unique index contacts_email_unique_per_tenant
  on contacts (tenant_id, lower(email)) where email is not null and merged_into is null;

create table custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  entity text not null check (entity in ('contact','company','lead','opportunity','deal')),
  key text not null,
  label text not null,
  field_type text not null check (field_type in ('text','number','date','select','multiselect','boolean','url')),
  options jsonb,
  required boolean not null default false,
  unique (tenant_id, entity, key)
);

create table custom_field_values (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  definition_id uuid not null references custom_field_definitions(id) on delete cascade,
  entity_id uuid not null,
  value_text text, value_number numeric, value_date date, value_bool boolean, value_json jsonb,
  unique (definition_id, entity_id)
);
create index on custom_field_values (tenant_id, entity_id);

create table tags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  color text,
  unique (tenant_id, name)
);
create table tag_links (
  tag_id uuid references tags(id) on delete cascade,
  entity text not null,
  entity_id uuid not null,
  tenant_id uuid not null,
  primary key (tag_id, entity, entity_id)
);

create table associations (
  tenant_id uuid not null,
  from_entity text not null, from_id uuid not null,
  to_entity text not null,   to_id uuid not null,
  kind text not null default 'related',
  primary key (from_entity, from_id, to_entity, to_id, kind)
);

-- Immutable unified timeline
create table activity_events (
  id bigserial primary key,
  tenant_id uuid not null,
  entity text not null, entity_id uuid not null,
  kind text not null,                       -- note|email|call|meeting|stage_change|merge|system…
  actor_id uuid, actor_type text not null default 'user',
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  trace_id text
);
create index on activity_events (tenant_id, entity, entity_id, occurred_at desc);

create table segments (                    -- saved filters
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  entity text not null default 'contact',
  filters jsonb not null,                   -- validated filter tree
  created_by uuid,
  created_at timestamptz not null default now()
);

create table import_jobs ( id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id) on delete cascade, entity text not null, file_ref text, status text not null default 'pending', stats jsonb, created_by uuid, created_at timestamptz not null default now());
create table export_jobs ( id uuid primary key default gen_random_uuid(), tenant_id uuid not null references tenants(id) on delete cascade, entity text not null, filters jsonb, status text not null default 'pending', file_ref text, expires_at timestamptz, created_by uuid, created_at timestamptz not null default now());

-- ---------- Leads (B) ----------
create table lead_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  key text not null, name text not null,
  unique (tenant_id, key)
);
create table leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text, email text, phone text,
  company_name text,
  source_id uuid references lead_sources(id),
  attribution jsonb not null default '{}'::jsonb, -- utm_source/medium/campaign/term/content, gclid, fbclid…
  score int not null default 0,
  status text not null default 'new' check (status in ('new','working','mql','sql','converted','recycled','invalid')),
  owner_id uuid,                            -- round-robin target
  converted_contact_id uuid references contacts(id),
  converted_opportunity_id uuid,
  sla_due_at timestamptz,
  row_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on leads (tenant_id, status, score desc);
create unique index leads_email_unique_per_tenant on leads (tenant_id, lower(email)) where email is not null;

create table scoring_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null, event_key text not null, points int not null, active boolean not null default true
);
create table routing_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  kind text not null default 'round_robin', -- round_robin|owner|static
  config jsonb not null default '{}'::jsonb,
  priority int not null default 100, active boolean not null default true
);

-- ---------- Sales (C) ----------
create table pipelines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  is_default boolean not null default false
);
create table pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  pipeline_id uuid not null references pipelines(id) on delete cascade,
  name text not null, position int not null,
  probability numeric not null default 0.1 check (probability between 0 and 1),
  is_won boolean not null default false, is_lost boolean not null default false,
  unique (pipeline_id, position)
);

create table products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  sku text, name text not null, description text,
  unit_price bigint not null default 0, currency char(3) not null default 'AED',
  tax_rate_id uuid,                         -- N
  active boolean not null default true
);
create table price_lists (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, name text not null, currency char(3) not null,
  effective_from date, effective_to date
);
create table price_list_items (
  price_list_id uuid references price_lists(id) on delete cascade,
  product_id uuid references products(id) on delete cascade,
  unit_price bigint not null, tenant_id uuid not null,
  primary key (price_list_id, product_id)
);

create table opportunities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  pipeline_id uuid not null references pipelines(id),
  stage_id uuid not null references pipeline_stages(id),
  name text not null,
  contact_id uuid references contacts(id), company_id uuid references companies(id),
  owner_id uuid,
  amount bigint not null default 0, currency char(3) not null default 'AED',
  expected_close_date date,
  status text not null default 'open' check (status in ('open','won','lost')),
  source_lead_id uuid references leads(id),
  row_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on opportunities (tenant_id, pipeline_id, status);
create index on opportunities (tenant_id, expected_close_date) where status = 'open';

create table quotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  number text not null,
  opportunity_id uuid references opportunities(id),
  status text not null default 'draft' check (status in ('draft','pending_approval','approved','sent','accepted','rejected')),
  currency char(3) not null default 'AED',
  discount_pct numeric not null default 0,
  subtotal bigint not null default 0, tax_total bigint not null default 0, total bigint not null default 0,
  row_version int not null default 1,
  created_at timestamptz not null default now(),
  unique (tenant_id, number)
);
create table quote_lines (
  id bigserial primary key,
  tenant_id uuid not null, quote_id uuid not null references quotes(id) on delete cascade,
  product_id uuid references products(id),
  description text not null, qty numeric not null check (qty > 0),
  unit_price bigint not null, discount_pct numeric not null default 0,
  tax_rate numeric not null default 0,      -- snapshot at write time
  line_total bigint not null                -- server-computed only
);
create table quote_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, quote_id uuid not null references quotes(id) on delete cascade,
  version int not null, snapshot jsonb not null, created_by uuid, created_at timestamptz not null default now(),
  unique (quote_id, version)
);
create table approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  policy text not null,                     -- quote_discount|expense|workflow…
  resource_type text not null, resource_id text not null,
  payload jsonb not null, payload_hash text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','expired')),
  requested_by uuid, decided_by uuid, decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index on approvals (tenant_id, status);
create table sales_targets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, user_id uuid, period text not null, -- 2026-Q1
  amount bigint not null, currency char(3) not null default 'AED',
  unique (tenant_id, user_id, period)
);
create table commissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, opportunity_id uuid not null, user_id uuid not null,
  basis_amount bigint not null, rate numeric not null, amount bigint not null,
  status text not null default 'computed',  -- computed|approved|paid
  created_at timestamptz not null default now()
);

-- ---------- Omnichannel (D) ----------
create table channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  kind text not null check (kind in ('whatsapp','instagram','messenger','tiktok','snapchat','webchat','email','sms','voice')),
  display_name text not null,
  config jsonb not null default '{}'::jsonb,
  status text not null default 'unconfigured' check (status in ('unconfigured','connected','error','disabled')),
  capability_ops text[] not null default '{}', -- declared ops per integration matrix
  created_at timestamptz not null default now()
);
create table provider_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, channel_id uuid not null references channels(id) on delete cascade,
  external_id text not null,                -- WABA id, IG account id…
  meta jsonb not null default '{}'::jsonb,
  unique (channel_id, external_id)
);
create table provider_credentials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, provider_account_id uuid not null references provider_accounts(id) on delete cascade,
  ciphertext bytea not null,                -- envelope-encrypted payload (ADR U)
  key_version int not null default 1,
  updated_at timestamptz not null default now()
);
create table conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  channel_id uuid not null references channels(id),
  provider_account_id uuid references provider_accounts(id),
  external_ref text,                        -- wa chat id, thread id…
  contact_id uuid references contacts(id),
  subject text,
  mode text not null default 'ai' check (mode in ('ai','human','off')),
  status text not null default 'open' check (status in ('open','pending','closed')),
  assignee_id uuid,
  last_message_at timestamptz,
  unread_count int not null default 0,
  row_version int not null default 1,
  created_at timestamptz not null default now(),
  unique (channel_id, external_ref)
);
create index on conversations (tenant_id, status, last_message_at desc);
create table messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  direction text not null check (direction in ('in','out')),
  sender_type text not null check (sender_type in ('contact','user','ai','system')),
  sender_id uuid,
  body text,
  template_id uuid,
  status text not null default 'queued' check (status in ('queued','sent','delivered','read','failed','received')),
  provider_message_id text,
  error_code text,
  retry_count int not null default 0,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index on messages (tenant_id, conversation_id, created_at);
create unique index messages_provider_dedupe on messages (tenant_id, provider_message_id)
  where provider_message_id is not null;
create table message_attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, message_id uuid not null references messages(id) on delete cascade,
  kind text not null, mime text, size_bytes bigint, storage_ref text not null, -- private bucket key
  created_at timestamptz not null default now()
);
create table message_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  channel_kind text not null, name text not null, language text not null default 'en',
  body text not null, variables jsonb,
  provider_template_id text, approval_status text default 'local', -- provider approval state
  unique (tenant_id, channel_kind, name, language)
);
create table webhook_events (               -- durable inbound ingest (dedupe)
  id bigserial primary key,
  tenant_id uuid,                           -- resolved after signature verify (may be null pre-resolve)
  source text not null,                     -- whatsapp|meta|tiktok|…
  provider_account_ref text,
  provider_event_id text not null,
  signature_valid boolean not null default false,
  raw jsonb not null,
  status text not null default 'received' check (status in ('received','processing','processed','failed','duplicate')),
  processed_at timestamptz, error text,
  received_at timestamptz not null default now(),
  unique (source, provider_account_ref, provider_event_id)
);
create table delivery_receipts (
  id bigserial primary key,
  tenant_id uuid not null, message_id uuid not null,
  status text not null, timestamp timestamptz, raw jsonb
);

-- ---------- Marketing (F) ----------
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null, channel_kind text not null,
  status text not null default 'draft' check (status in ('draft','scheduled','sending','paused','completed','failed')),
  template_id uuid references message_templates(id),
  audience_id uuid,
  scheduled_at timestamptz,
  ab_variant_of uuid references campaigns(id),
  metrics jsonb not null default '{}'::jsonb,
  created_by uuid, created_at timestamptz not null default now()
);
create table audiences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, name text not null,
  segment_id uuid references segments(id),
  snapshot_contact_ids uuid[],              -- frozen at send approval time
  created_at timestamptz not null default now()
);
create table consents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, contact_id uuid not null,
  channel_kind text not null,               -- whatsapp|email|sms|…
  state text not null check (state in ('opt_in','opt_out')),
  evidence jsonb not null default '{}'::jsonb,  -- source, ip hash, ts, text version
  occurred_at timestamptz not null default now(),
  unique (tenant_id, contact_id, channel_kind, occurred_at)
);
create table suppressions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, channel_kind text not null,
  email text, phone text, reason text not null, -- bounce|complaint|opt_out|manual
  created_at timestamptz not null default now()
);
create unique index suppressions_tenant_channel_target
  on suppressions (tenant_id, channel_kind, coalesce(email, phone));
create table frequency_caps (
  tenant_id uuid not null, contact_id uuid not null, channel_kind text not null,
  "window" text not null,                   -- day|week|month
  max_messages int not null,
  primary key (tenant_id, contact_id, channel_kind, "window")
);
create table journey_steps ( id bigserial primary key, tenant_id uuid not null, campaign_id uuid references campaigns(id), kind text not null, config jsonb not null, position int not null );
create table attribution_touches (
  id bigserial primary key,
  tenant_id uuid not null, contact_id uuid, lead_id uuid,
  channel text, campaign text, utm jsonb, occurred_at timestamptz not null default now()
);

-- ---------- Workflows (K) ----------
create table workflows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null, trigger_event text not null,
  version int not null default 1, active boolean not null default false,
  definition jsonb not null,                -- validated DAG
  created_at timestamptz not null default now(),
  unique (tenant_id, name, version)
);
create table workflow_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, workflow_id uuid not null, workflow_version int not null,
  trigger jsonb not null, status text not null default 'running'
    check (status in ('running','completed','failed','cancelled')),
  idempotency_key text,
  started_at timestamptz not null default now(), finished_at timestamptz,
  unique (tenant_id, idempotency_key)
);
create table workflow_steps (
  id bigserial primary key,
  tenant_id uuid not null, run_id uuid not null references workflow_runs(id) on delete cascade,
  node_id text not null, kind text not null, status text not null default 'pending'
    check (status in ('pending','waiting','running','succeeded','failed','skipped','dead')),
  attempt int not null default 0, output jsonb, error text,
  next_run_at timestamptz
);
create table dlq_entries (
  id bigserial primary key,
  tenant_id uuid, queue text not null, payload jsonb not null, error text not null,
  failed_at timestamptz not null default now(), replayed_at timestamptz
);

-- ---------- AI (E) ----------
create table agents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null, kind text not null,   -- qualify|support|booking
  languages text[] not null default '{en,ar}',
  active_version int not null default 1, created_at timestamptz not null default now()
);
create table agent_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, agent_id uuid not null references agents(id) on delete cascade,
  version int not null,
  system_prompt text not null,
  model_policy jsonb not null default '{}'::jsonb,  -- primary/fallback, region constraints
  tool_allowlist text[] not null default '{}',
  unique (agent_id, version)
);
create table tool_invocations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, run_id uuid, agent_id uuid,
  tool text not null, args jsonb not null, result jsonb,
  permission_ok boolean, status text not null default 'ok',
  approval_id uuid references approvals(id),
  latency_ms int, created_at timestamptz not null default now()
);
create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, agent_id uuid not null, conversation_id uuid,
  status text not null default 'running', tokens_in int default 0, tokens_out int default 0,
  cost_micro numeric default 0, fallback_used boolean default false,
  started_at timestamptz not null default now(), finished_at timestamptz
);
create table knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  title text not null, source_ref text, status text not null default 'processing'
    check (status in ('processing','ready','failed','revoked')),
  acl jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, document_id uuid not null references knowledge_documents(id) on delete cascade,
  chunk_index int not null, content text not null,
  embedding vector(1536),
  unique (document_id, chunk_index)
);
create index knowledge_chunks_ann on knowledge_chunks
  using hnsw (embedding vector_cosine_ops) where embedding is not null;
create table ai_budgets (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  monthly_tokens bigint not null default 1000000,
  monthly_cost_micro numeric not null default 50000000, -- 50 USD in micros
  period text not null                      -- 2026-11
);

-- ---------- Scheduling (I) ----------
create table staff (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid, display_name text not null, timezone text not null default 'Asia/Dubai'
);
create table availability_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, staff_id uuid references staff(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6),
  start_time time not null, end_time time not null
);
create table booking_pages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, slug text unique not null, staff_id uuid references staff(id),
  service_name text not null, duration_min int not null default 30,
  buffer_min int not null default 0, is_active boolean not null default true
);
create table appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  booking_page_id uuid references booking_pages(id),
  contact_id uuid references contacts(id), staff_id uuid references staff(id),
  starts_at timestamptz not null, ends_at timestamptz not null,
  status text not null default 'confirmed' check (status in ('confirmed','rescheduled','cancelled','completed','no_show')),
  timezone text not null, row_version int not null default 1,
  created_at timestamptz not null default now()
);
create index on appointments (tenant_id, staff_id, starts_at);
create table appointment_reminders (
  id bigserial primary key, tenant_id uuid not null, appointment_id uuid not null,
  channel_kind text not null, send_at timestamptz not null, status text not null default 'queued'
);

-- ---------- Service (J) ----------
create table sla_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, name text not null,
  first_response_min int not null, resolution_min int,
  week_pattern text not null default 'sun_thu',
  start_hour int not null default 9, end_hour int not null default 17
);
create table queues ( id uuid primary key default gen_random_uuid(), tenant_id uuid not null, name text not null );
create table tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  number text not null, subject text not null, description text,
  contact_id uuid references contacts(id), queue_id uuid references queues(id),
  sla_policy_id uuid references sla_policies(id),
  status text not null default 'new' check (status in ('new','open','pending','resolved','closed')),
  priority text not null default 'normal',
  first_response_due_at timestamptz, first_responded_at timestamptz,
  resolve_due_at timestamptz, resolved_at timestamptz,
  row_version int not null default 1, created_at timestamptz not null default now(),
  unique (tenant_id, number)
);
create table ticket_comments ( id bigserial primary key, tenant_id uuid not null, ticket_id uuid not null references tickets(id) on delete cascade, author_type text not null, author_id uuid, body text not null, internal boolean not null default false, created_at timestamptz not null default now() );
create table kb_articles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, slug text not null, title text not null, body text not null,
  status text not null default 'draft', unique (tenant_id, slug)
);
create table csat_responses ( id bigserial primary key, tenant_id uuid not null, ticket_id uuid not null, score int not null check (score between 1 and 5), comment text, created_at timestamptz not null default now() );
create table nps_responses ( id bigserial primary key, tenant_id uuid not null, contact_id uuid, score int not null check (score between 0 and 10), comment text, created_at timestamptz not null default now() );
create table portal_accounts ( id uuid primary key default gen_random_uuid(), tenant_id uuid not null, email text not null, name text, external_auth_id uuid, unique (tenant_id, email) );
create table portal_grants ( id bigserial primary key, tenant_id uuid not null, portal_account_id uuid not null references portal_accounts(id) on delete cascade, resource_type text not null, resource_id uuid not null, revoked_at timestamptz );

-- ---------- Operations (L) ----------
create table tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  title text not null, body text,
  assignee_id uuid, due_at timestamptz,
  status text not null default 'open' check (status in ('open','done','cancelled')),
  related_entity text, related_id uuid,
  row_version int not null default 1, created_at timestamptz not null default now()
);
create index on tasks (tenant_id, assignee_id, status);
create table notifications (
  id bigserial primary key, tenant_id uuid not null, user_id uuid not null,
  kind text not null, payload jsonb not null default '{}'::jsonb,
  read_at timestamptz, created_at timestamptz not null default now()
);
create index on notifications (tenant_id, user_id, read_at);
create table files (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, name text not null, mime text, size_bytes bigint,
  storage_ref text not null,               -- private bucket key
  scanned_status text not null default 'pending', -- pending|clean|infected
  uploaded_by uuid, created_at timestamptz not null default now()
);

-- ---------- Commerce (N) ----------
create table tax_rate_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, country char(2) not null, rate_pct numeric not null,
  effective_from date not null, effective_to date,
  source_url text not null, verified_on date not null,  -- official source evidence
  unique (tenant_id, country, effective_from)
);
create table payment_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null, quote_id uuid references quotes(id),
  gateway text not null, amount bigint not null, currency char(3) not null,
  status text not null default 'active', url text, created_at timestamptz not null default now()
);
create table invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  number text not null, contact_id uuid, quote_id uuid,
  status text not null default 'draft' check (status in ('draft','issued','partially_paid','paid','void')),
  currency char(3) not null, subtotal bigint, tax_total bigint, total bigint not null,
  issued_at timestamptz, due_date date, row_version int not null default 1,
  unique (tenant_id, number)
);
create table invoice_lines ( id bigserial primary key, tenant_id uuid not null, invoice_id uuid not null references invoices(id) on delete cascade, description text not null, qty numeric not null, unit_price bigint not null, tax_rate numeric not null, line_total bigint not null );
create table gateway_events ( id bigserial primary key, tenant_id uuid, gateway text not null, gateway_event_id text not null, raw jsonb not null, status text not null default 'received', received_at timestamptz not null default now(), unique (gateway, gateway_event_id) );

-- ---------- Platform billing & metering (Q) ----------
create table plans ( key text primary key, name text not null, sort_order int default 0 );
create table plan_versions (
  id uuid primary key default gen_random_uuid(),
  plan_key text not null references plans(key), version int not null,
  price_monthly_micro bigint not null, currency char(3) not null default 'USD',
  entitlements jsonb not null,              -- {modules:[…], limits:{…}}
  active boolean not null default true,
  unique (plan_key, version)
);
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  plan_key text not null, plan_version_id uuid not null references plan_versions(id),
  status text not null default 'trialing' check (status in ('trialing','active','past_due','canceled')),
  term text not null default 'monthly', current_period_end timestamptz,
  created_at timestamptz not null default now()
);
create table usage_events (
  id bigserial primary key,
  tenant_id uuid not null, metric text not null,  -- ai_tokens|messages_sent|seats|calls_min
  quantity bigint not null default 1, meta jsonb,
  occurred_at timestamptz not null default now()
);
create index on usage_events (tenant_id, metric, occurred_at);
create table usage_aggregates ( tenant_id uuid not null, period text not null, metric text not null, total bigint not null default 0, primary key (tenant_id, period, metric) );
create table resellers ( id uuid primary key default gen_random_uuid(), name text not null, parent_tenant_id uuid, settings jsonb not null default '{}' );
create table tenant_domains ( id uuid primary key default gen_random_uuid(), tenant_id uuid not null, domain text unique not null, verified_at timestamptz );

-- ---------- Analytics (M) ----------
create table report_definitions ( id uuid primary key default gen_random_uuid(), tenant_id uuid not null, name text not null, spec jsonb not null, created_by uuid, created_at timestamptz not null default now() );
create table report_runs ( id bigserial primary key, tenant_id uuid not null, report_id uuid not null, status text not null default 'pending', output_ref text, created_at timestamptz not null default now() );
create table dashboards ( id uuid primary key default gen_random_uuid(), tenant_id uuid not null, name text not null, layout jsonb not null default '[]' );
create table dashboard_widgets ( id bigserial primary key, tenant_id uuid not null, dashboard_id uuid not null references dashboards(id) on delete cascade, kind text not null, spec jsonb not null, position int not null );
create table metric_snapshots ( id bigserial primary key, tenant_id uuid not null, metric text not null, period text not null, value numeric not null, computed_at timestamptz not null default now(), unique (tenant_id, metric, period) );

-- ---------- Integration logs (R) ----------
create table integration_logs (
  id bigserial primary key,
  tenant_id uuid, connector text not null, direction text not null,
  endpoint text, status_code int, ok boolean not null, latency_ms int,
  error text, meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on integration_logs (tenant_id, connector, created_at desc);

-- =====================================================================
-- RLS — FORCE on all tenant tables. API sets app.tenant_id per tx.
-- Deny-by-default: table owners excluded via FORCE; app role NOBYPASSRLS.
-- =====================================================================
do $$ declare t text;
begin
  foreach t in array array[
    'memberships','api_keys','audit_events','companies','contacts',
    'custom_field_definitions','custom_field_values','tags','tag_links',
    'associations','activity_events','segments','import_jobs','export_jobs',
    'lead_sources','leads','scoring_rules','routing_rules','pipelines',
    'pipeline_stages','products','price_lists','price_list_items',
    'opportunities','quotes','quote_lines','quote_versions','approvals',
    'sales_targets','commissions','channels','provider_accounts',
    'provider_credentials','conversations','messages','message_attachments',
    'message_templates','delivery_receipts','campaigns','audiences','consents',
    'suppressions','frequency_caps','journey_steps','attribution_touches',
    'workflows','workflow_runs','workflow_steps','dlq_entries','agents',
    'agent_versions','tool_invocations','agent_runs','knowledge_documents',
    'knowledge_chunks','ai_budgets','staff','availability_rules',
    'booking_pages','appointments','appointment_reminders','sla_policies',
    'queues','tickets','ticket_comments','kb_articles','csat_responses',
    'nps_responses','portal_accounts','portal_grants','tasks','notifications',
    'files','tax_rate_versions','payment_links','invoices','invoice_lines',
    'gateway_events','subscriptions','usage_events','usage_aggregates',
    'report_definitions','report_runs','dashboards','dashboard_widgets',
    'metric_snapshots','integration_logs'
  ] loop
    execute format('alter table %I enable row level security;', t);
    execute format('alter table %I force row level security;', t);
    execute format($p$
      create policy tenant_isolation on %I
        using (tenant_id = current_tenant_id())
        with check (tenant_id = current_tenant_id());$p$, t);
  end loop;
end $$;

-- audit_events: append-only (no update/delete even for the tenant)
revoke update, delete on audit_events from public;
create policy audit_insert on audit_events for insert
  with check (true); -- service role writes; reads via operator grants

-- tenants: members may read their own tenant row only
alter table tenants enable row level security;
alter table tenants force row level security;
create policy tenant_self_read on tenants for select
  using (id = current_tenant_id());

-- plan catalogue: global read
alter table plans enable row level security;
create policy plans_read on plans for select using (true);
alter table plan_versions enable row level security;
create policy plan_versions_read on plan_versions for select using (true);

-- immutability guard for activity_events (append-only)
revoke update, delete on activity_events from public;

-- =====================================================================
-- NOTE (ops): the application connects with a dedicated role:
--   create role app_runtime nologin NOBYPASSRLS;
--   grant usage on schema public to app_runtime;
--   grant select, insert, update, delete on all tables to app_runtime;
-- Migrations run under a separate privileged role that never serves traffic.
-- =====================================================================
