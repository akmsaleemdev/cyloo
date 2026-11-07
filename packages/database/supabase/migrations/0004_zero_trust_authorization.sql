-- Zero-trust authorization foundation. This migration adds organization
-- structure and support-access records; it does not activate support access.
begin;

create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, name)
);

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  department_id uuid,
  name text not null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, name),
  foreign key (tenant_id, department_id) references departments (tenant_id, id)
);

create unique index if not exists memberships_tenant_id_id
  on memberships (tenant_id, id);
alter table memberships add column if not exists department_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'memberships_department_same_tenant_fk') then
    alter table memberships add constraint memberships_department_same_tenant_fk
      foreign key (tenant_id, department_id) references departments (tenant_id, id) not valid;
  end if;
end
$$;

create table if not exists team_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  team_id uuid not null,
  membership_id uuid not null,
  status text not null default 'active' check (status in ('active', 'inactive', 'removed')),
  created_at timestamptz not null default now(),
  unique (tenant_id, team_id, membership_id),
  foreign key (tenant_id, team_id) references teams (tenant_id, id) on delete cascade,
  foreign key (tenant_id, membership_id) references memberships (tenant_id, id) on delete cascade
);
create index if not exists team_memberships_member_idx
  on team_memberships (tenant_id, membership_id, status);
create index if not exists team_memberships_team_idx
  on team_memberships (tenant_id, team_id, status);

-- Department/team scope and explicit assignment fields are additive and
-- nullable so existing tenant data remains valid until it is classified.
alter table companies add column if not exists department_id uuid;
alter table companies add column if not exists team_id uuid;
alter table contacts add column if not exists department_id uuid;
alter table contacts add column if not exists team_id uuid;
alter table leads add column if not exists department_id uuid;
alter table leads add column if not exists team_id uuid;
alter table opportunities add column if not exists department_id uuid;
alter table opportunities add column if not exists team_id uuid;
alter table tasks add column if not exists department_id uuid;
alter table tasks add column if not exists team_id uuid;
alter table tickets add column if not exists assignee_id uuid;
alter table tickets add column if not exists department_id uuid;
alter table tickets add column if not exists team_id uuid;
alter table conversations add column if not exists department_id uuid;
alter table conversations add column if not exists team_id uuid;
alter table campaigns add column if not exists department_id uuid;
alter table campaigns add column if not exists team_id uuid;
alter table campaigns add column if not exists owner_id uuid;
alter table audiences add column if not exists owner_id uuid;
alter table audiences add column if not exists department_id uuid;
alter table audiences add column if not exists team_id uuid;
alter table invoices add column if not exists owner_id uuid;
alter table invoices add column if not exists department_id uuid;
alter table invoices add column if not exists team_id uuid;
alter table quotes add column if not exists owner_id uuid;
alter table quotes add column if not exists department_id uuid;
alter table quotes add column if not exists team_id uuid;

do $$
declare
  table_name text;
begin
  foreach table_name in array array['companies', 'contacts', 'leads', 'opportunities', 'tasks', 'tickets', 'conversations', 'campaigns', 'audiences', 'invoices', 'quotes']
  loop
    if not exists (
      select 1 from pg_constraint
      where conname = table_name || '_department_same_tenant_fk'
    ) then
      execute format(
        'alter table %I add constraint %I foreign key (tenant_id, department_id) references departments (tenant_id, id) not valid',
        table_name, table_name || '_department_same_tenant_fk'
      );
    end if;
    if not exists (
      select 1 from pg_constraint
      where conname = table_name || '_team_same_tenant_fk'
    ) then
      execute format(
        'alter table %I add constraint %I foreign key (tenant_id, team_id) references teams (tenant_id, id) not valid',
        table_name, table_name || '_team_same_tenant_fk'
      );
    end if;
  end loop;
end
$$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contacts_owner_same_tenant_fk') then
    alter table contacts add constraint contacts_owner_same_tenant_fk
      foreign key (tenant_id, owner_id) references memberships (tenant_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'leads_owner_same_tenant_fk') then
    alter table leads add constraint leads_owner_same_tenant_fk
      foreign key (tenant_id, owner_id) references memberships (tenant_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'opportunities_owner_same_tenant_fk') then
    alter table opportunities add constraint opportunities_owner_same_tenant_fk
      foreign key (tenant_id, owner_id) references memberships (tenant_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tasks_assignee_same_tenant_fk') then
    alter table tasks add constraint tasks_assignee_same_tenant_fk
      foreign key (tenant_id, assignee_id) references memberships (tenant_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tickets_assignee_same_tenant_fk') then
    alter table tickets add constraint tickets_assignee_same_tenant_fk
      foreign key (tenant_id, assignee_id) references memberships (tenant_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'conversations_assignee_same_tenant_fk') then
    alter table conversations add constraint conversations_assignee_same_tenant_fk
      foreign key (tenant_id, assignee_id) references memberships (tenant_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'invoices_owner_same_tenant_fk') then
    alter table invoices add constraint invoices_owner_same_tenant_fk
      foreign key (tenant_id, owner_id) references memberships (tenant_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'quotes_owner_same_tenant_fk') then
    alter table quotes add constraint quotes_owner_same_tenant_fk
      foreign key (tenant_id, owner_id) references memberships (tenant_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'campaigns_owner_same_tenant_fk') then
    alter table campaigns add constraint campaigns_owner_same_tenant_fk
      foreign key (tenant_id, owner_id) references memberships (tenant_id, id) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'audiences_owner_same_tenant_fk') then
    alter table audiences add constraint audiences_owner_same_tenant_fk
      foreign key (tenant_id, owner_id) references memberships (tenant_id, id) not valid;
  end if;
end
$$;

-- Platform identities are separate from tenant membership roles. No client
-- policy permits role assignment or support-record access.
create table if not exists platform_memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  role_key text not null check (role_key in ('platform_super_admin', 'platform_support_admin')),
  active boolean not null default true,
  mfa_enrolled boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, role_key)
);

create table if not exists support_access_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  support_user_id uuid not null references auth.users(id),
  ticket_reference text not null,
  justification text not null,
  resource_types text[] not null check (cardinality(resource_types) > 0),
  permissions text[] not null check (cardinality(permissions) > 0),
  mfa_verified_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'denied', 'revoked', 'expired')),
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  tenant_approver_id uuid references auth.users(id),
  independent_approver_id uuid references auth.users(id),
  check (expires_at is null or (expires_at > created_at and expires_at <= created_at + interval '60 minutes')),
  check (tenant_approver_id is null or tenant_approver_id <> support_user_id),
  check (independent_approver_id is null or independent_approver_id <> support_user_id),
  check (
    tenant_approver_id is null or independent_approver_id is null
    or tenant_approver_id <> independent_approver_id
  ),
  check (
    status <> 'approved' or (
      mfa_verified_at is not null and approved_at is not null and expires_at is not null
      and tenant_approver_id is not null and independent_approver_id is not null
    )
  ),
  unique (tenant_id, id)
);
create index if not exists support_access_requests_pending
  on support_access_requests (tenant_id, status, created_at desc);
create index if not exists support_access_requests_support_user
  on support_access_requests (support_user_id, status, expires_at);

create table if not exists support_access_approvals (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references support_access_requests(id) on delete cascade,
  approver_id uuid not null references auth.users(id),
  approval_kind text not null check (approval_kind in ('tenant_admin', 'independent')),
  approved_at timestamptz not null default now(),
  unique (request_id, approver_id, approval_kind)
);

create table if not exists support_access_audit (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  request_id uuid not null,
  actor_id uuid references auth.users(id),
  action text not null,
  resource_type text,
  resource_id uuid,
  occurred_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb,
  foreign key (tenant_id, request_id) references support_access_requests (tenant_id, id) on delete restrict
);
create index if not exists support_access_audit_tenant_time
  on support_access_audit (tenant_id, occurred_at desc);
create trigger support_access_audit_append_only
  before update or delete on support_access_audit
  for each row execute function reject_audit_mutation();

-- New organization tables use the same tenant boundary. Support tables are
-- RLS-enabled with no client policies: access remains denied until a trusted
-- authorization service validates MFA, both approvers, scope, expiry and
-- revocation on every request.
alter table departments enable row level security;
alter table departments force row level security;
drop policy if exists tenant_isolation on departments;
create policy tenant_isolation on departments
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

alter table teams enable row level security;
alter table teams force row level security;
drop policy if exists tenant_isolation on teams;
create policy tenant_isolation on teams
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

alter table team_memberships enable row level security;
alter table team_memberships force row level security;
drop policy if exists tenant_isolation on team_memberships;
create policy tenant_isolation on team_memberships
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

alter table platform_memberships enable row level security;
alter table platform_memberships force row level security;
alter table support_access_requests enable row level security;
alter table support_access_requests force row level security;
alter table support_access_approvals enable row level security;
alter table support_access_approvals force row level security;
alter table support_access_audit enable row level security;
alter table support_access_audit force row level security;

commit;
