begin;

select plan(6);

insert into public.tenants (id, name, slug)
values
  ('00000000-0000-4000-8000-000000000001', 'RLS Tenant A', 'rls-tenant-a'),
  ('00000000-0000-4000-8000-000000000002', 'RLS Tenant B', 'rls-tenant-b');

insert into public.contacts (tenant_id, first_name)
values
  ('00000000-0000-4000-8000-000000000001', 'Tenant A contact'),
  ('00000000-0000-4000-8000-000000000002', 'Tenant B contact');

set local role authenticated;
select set_config('app.tenant_id', '00000000-0000-4000-8000-000000000001', true);

select is(
  (select count(*)::int from public.contacts),
  1,
  'authenticated tenant can only read its own contacts'
);

select lives_ok(
  $$insert into public.contacts (tenant_id, first_name)
    values ('00000000-0000-4000-8000-000000000001', 'Allowed insert')$$,
  'tenant can insert a row for itself'
);

select throws_ok(
  $$insert into public.contacts (tenant_id, first_name)
    values ('00000000-0000-4000-8000-000000000002', 'Cross-tenant insert')$$,
  '42501',
  null,
  'tenant cannot insert a row for another tenant'
);

select throws_ok(
  $$insert into public.audit_events
    (tenant_id, action, resource_type)
    values ('00000000-0000-4000-8000-000000000002', 'test', 'test')$$,
  '42501',
  null,
  'audit insert policy cannot bypass tenant isolation'
);

select throws_ok(
  $$insert into public.webhook_events
    (tenant_id, source, provider_event_id, raw)
    values (null, 'test', 'unresolved-test', '{}'::jsonb)$$,
  '42501',
  null,
  'unresolved webhook payloads are not readable/writable by tenant role'
);

select is(
  (select count(*)::int from public.contacts where first_name = 'Tenant B contact'),
  0,
  'cross-tenant contact remains invisible'
);

select * from finish();
rollback;
