-- Runtime/schema reconciliation. Additive only; inspect existing staging data
-- and migration history before applying to any database.
begin;

create extension if not exists "btree_gist";

-- The runtime represents AI transcripts separately from omnichannel messages.
create table if not exists ai_conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid,
  agent_id uuid,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version int not null default 1,
  unique (tenant_id, id)
);

create table if not exists ai_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  conversation_id uuid not null,
  run_id uuid,
  role text not null check (role in ('system', 'user', 'assistant', 'tool')),
  content text not null,
  citations jsonb not null default '[]'::jsonb,
  tools jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  row_version int not null default 1
);
create unique index if not exists contacts_tenant_id_id
  on contacts (tenant_id, id);
create unique index if not exists agents_tenant_id_id
  on agents (tenant_id, id);
create unique index if not exists ai_conversations_tenant_id_id
  on ai_conversations (tenant_id, id);
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ai_conversations_agent_same_tenant_fk'
  ) then
    alter table ai_conversations add constraint ai_conversations_agent_same_tenant_fk
      foreign key (tenant_id, agent_id) references agents (tenant_id, id);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'ai_messages_conversation_same_tenant_fk'
  ) then
    alter table ai_messages add constraint ai_messages_conversation_same_tenant_fk
      foreign key (tenant_id, conversation_id)
      references ai_conversations (tenant_id, id) on delete cascade;
  end if;
end
$$;
create index if not exists ai_messages_tenant_conversation_time
  on ai_messages (tenant_id, conversation_id, created_at, id);

-- agent_runs is the canonical run entity; the API uses it instead of a
-- second ai_runs table. Add engine for the current API contract.
alter table agent_runs add column if not exists engine text;
alter table agent_runs alter column agent_id drop not null;
create unique index if not exists agent_runs_tenant_id_id
  on agent_runs (tenant_id, id);
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'agent_runs_conversation_same_tenant_fk'
  ) then
    alter table agent_runs add constraint agent_runs_conversation_same_tenant_fk
      foreign key (tenant_id, conversation_id)
      references ai_conversations (tenant_id, id) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'ai_messages_run_same_tenant_fk'
  ) then
    alter table ai_messages add constraint ai_messages_run_same_tenant_fk
      foreign key (tenant_id, run_id) references agent_runs (tenant_id, id);
  end if;
end
$$;

-- Public profile mirror, never a replacement for Supabase Auth credentials.
create table if not exists users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists users_email_lower_idx on users (lower(email));

-- Number allocation is not the marketing-sequence domain.
create table if not exists number_sequences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  key text not null,
  next bigint not null default 1 check (next > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version int not null default 1,
  unique (tenant_id, key)
);

create table if not exists dsar_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  contact_id uuid not null,
  type text not null check (type in ('export', 'delete')),
  reason text not null,
  status text not null default 'received'
    check (status in ('received', 'processing', 'completed', 'rejected', 'failed')),
  requested_by uuid,
  result_summary jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version int not null default 1,
  foreign key (tenant_id, contact_id) references contacts (tenant_id, id)
    on delete restrict
);
create index if not exists dsar_requests_tenant_created
  on dsar_requests (tenant_id, created_at desc);

-- The API returns each signing secret once and stores only authenticated
-- ciphertext. APP_ENCRYPTION_KEY must be configured on the server.
create table if not exists outbound_webhooks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  url text not null,
  events text[] not null,
  secret_ciphertext text not null,
  secret_key_version int not null default 1,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version int not null default 1,
  check (url ~ '^https?://'),
  unique (tenant_id, id)
);
create index if not exists outbound_webhooks_tenant_created
  on outbound_webhooks (tenant_id, created_at desc);

create table if not exists webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  webhook_id uuid not null,
  event text not null,
  payload jsonb not null,
  status text not null default 'pending'
    check (status in ('pending', 'delivered', 'failed')),
  attempts int not null default 0 check (attempts >= 0),
  error text,
  next_attempt_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version int not null default 1,
  foreign key (tenant_id, webhook_id)
    references outbound_webhooks (tenant_id, id) on delete cascade
);
create index if not exists webhook_deliveries_tenant_hook_created
  on webhook_deliveries (tenant_id, webhook_id, created_at desc);
create index if not exists webhook_deliveries_pending
  on webhook_deliveries (next_attempt_at, created_at)
  where status = 'pending';

create table if not exists social_posts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  content text not null,
  channels text[] not null,
  language text not null check (language in ('en', 'ar')),
  status text not null default 'draft'
    check (status in ('draft', 'review', 'approved', 'scheduled', 'published')),
  scheduled_at timestamptz,
  published_at timestamptz,
  approvals jsonb not null default '[]'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  row_version int not null default 1
);
create index if not exists social_posts_tenant_status_schedule
  on social_posts (tenant_id, status, scheduled_at);

-- Existing API expects tenant ownership on reseller records.
alter table resellers add column if not exists tenant_id uuid references tenants(id) on delete cascade;
update resellers
set tenant_id = parent_tenant_id
where tenant_id is null and parent_tenant_id is not null;
create index if not exists resellers_tenant_idx on resellers (tenant_id);

-- Runtime table names are resolved explicitly:
-- ai_runs -> agent_runs; sequences -> number_sequences.
-- quote_lines was already present in SQL but missing from the runtime registry.

-- RLS for relations omitted by the original tenant-policy list.
alter table ai_conversations enable row level security;
alter table ai_conversations force row level security;
drop policy if exists ai_conversations_tenant_isolation on ai_conversations;
create policy ai_conversations_tenant_isolation on ai_conversations
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

alter table ai_messages enable row level security;
alter table ai_messages force row level security;
drop policy if exists ai_messages_tenant_isolation on ai_messages;
create policy ai_messages_tenant_isolation on ai_messages
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

alter table number_sequences enable row level security;
alter table number_sequences force row level security;
drop policy if exists number_sequences_tenant_isolation on number_sequences;
create policy number_sequences_tenant_isolation on number_sequences
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

alter table dsar_requests enable row level security;
alter table dsar_requests force row level security;
drop policy if exists dsar_requests_tenant_isolation on dsar_requests;
create policy dsar_requests_tenant_isolation on dsar_requests
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

alter table outbound_webhooks enable row level security;
alter table outbound_webhooks force row level security;
drop policy if exists outbound_webhooks_tenant_isolation on outbound_webhooks;
create policy outbound_webhooks_tenant_isolation on outbound_webhooks
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

alter table webhook_deliveries enable row level security;
alter table webhook_deliveries force row level security;
drop policy if exists webhook_deliveries_tenant_isolation on webhook_deliveries;
create policy webhook_deliveries_tenant_isolation on webhook_deliveries
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

alter table social_posts enable row level security;
alter table social_posts force row level security;
drop policy if exists social_posts_tenant_isolation on social_posts;
create policy social_posts_tenant_isolation on social_posts
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

alter table resellers enable row level security;
alter table resellers force row level security;
drop policy if exists resellers_tenant_isolation on resellers;
create policy resellers_tenant_isolation on resellers
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

alter table tenant_domains enable row level security;
alter table tenant_domains force row level security;
drop policy if exists tenant_domains_tenant_isolation on tenant_domains;
create policy tenant_domains_tenant_isolation on tenant_domains
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

alter table webhook_events enable row level security;
alter table webhook_events force row level security;
drop policy if exists webhook_events_tenant_isolation on webhook_events;
create policy webhook_events_tenant_isolation on webhook_events
  using (tenant_id is not null and tenant_id = current_tenant_id())
  with check (tenant_id is not null and tenant_id = current_tenant_id());

alter table roles enable row level security;
alter table roles force row level security;
drop policy if exists roles_read_builtin_or_tenant on roles;
create policy roles_read_builtin_or_tenant on roles for select
  using (tenant_id is null or tenant_id = current_tenant_id());
drop policy if exists roles_insert_tenant on roles;
create policy roles_insert_tenant on roles for insert
  with check (tenant_id is not null and tenant_id = current_tenant_id());
drop policy if exists roles_update_tenant on roles;
create policy roles_update_tenant on roles for update
  using (tenant_id is not null and tenant_id = current_tenant_id())
  with check (tenant_id is not null and tenant_id = current_tenant_id());
drop policy if exists roles_delete_tenant on roles;
create policy roles_delete_tenant on roles for delete
  using (tenant_id is not null and tenant_id = current_tenant_id());

alter table users enable row level security;
alter table users force row level security;
drop policy if exists users_self_read on users;
create policy users_self_read on users for select using (id = auth.uid());
drop policy if exists users_self_insert on users;
create policy users_self_insert on users for insert with check (id = auth.uid());
drop policy if exists users_self_update on users;
create policy users_self_update on users for update
  using (id = auth.uid()) with check (id = auth.uid());

-- Fix the original permissive audit insert policy. Permissive policies OR
-- together, so WITH CHECK (true) defeated the tenant_id policy on inserts.
drop policy if exists audit_insert on audit_events;
create policy audit_insert on audit_events for insert
  with check (tenant_id is not null and tenant_id = current_tenant_id());

-- Make append-only behavior a database invariant, not only a privilege recipe.
create or replace function reject_audit_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'append-only record cannot be changed';
end;
$$;
drop trigger if exists audit_events_append_only on audit_events;
create trigger audit_events_append_only
  before update or delete on audit_events
  for each row execute function reject_audit_mutation();
drop trigger if exists activity_events_append_only on activity_events;
create trigger activity_events_append_only
  before update or delete on activity_events
  for each row execute function reject_audit_mutation();

commit;
