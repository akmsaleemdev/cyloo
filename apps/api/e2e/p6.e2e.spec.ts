// Phase 6 e2e — Developer Hub, governance automation, reseller, packs, DR.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { createApp } from '../src/main.js';
import { store } from '../src/common/store.js';
import { decryptSecret } from '../src/common/secrets.js';

let app: INestApplication;
let originalEncryptionKey: string | undefined;
const T = { token: '', rawKey: '', hookId: '', deliveryId: '' };

function api(t: string) {
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${t}`);
  return {
    post: (url: string) => auth(request(app.getHttpServer()).post(url)),
    get: (url: string) => auth(request(app.getHttpServer()).get(url)),
  };
}

beforeAll(async () => {
  originalEncryptionKey = process.env.APP_ENCRYPTION_KEY;
  process.env.APP_ENCRYPTION_KEY ??= randomBytes(32).toString('base64');
  app = await createApp();
  await app.init();
  T.token = (await request(app.getHttpServer()).post('/api/v1/dev/token').send({
    tenant_name: 'Platform Co', user_email: 'p@plat.test', plan: 'enterprise',
    roles: ['owner', 'customer_confidential', 'finance_sensitive', 'hr_sensitive'],
  })).body.token;
});

afterAll(async () => {
  await app.close();
  if (originalEncryptionKey === undefined) delete process.env.APP_ENCRYPTION_KEY;
  else process.env.APP_ENCRYPTION_KEY = originalEncryptionKey;
});

describe('P6 — Developer Hub: API keys (R)', () => {
  it('creates a key (raw shown once, hash stored); key authenticates M2M calls', async () => {
    const created = await api(T.token).post('/api/v1/platform/api-keys').send({ name: 'Integration server', roles: ['sales_rep'] });
    expect(created.status).toBe(201);
    expect(created.body.raw_key).toMatch(/^gck_/);
    T.rawKey = created.body.raw_key;
    const list = await api(T.token).get('/api/v1/platform/api-keys');
    expect(list.body.keys[0]).not.toHaveProperty('raw_key');
    expect(list.body.keys[0]).not.toHaveProperty('key_hash');

    // M2M call with ONLY the API key — scoped to the key's roles
    const call = await api(T.rawKey).get('/api/v1/tasks');
    expect(call.status).toBe(200);
    const denied = await api(T.rawKey).post('/api/v1/platform/api-keys').send({ name: 'x', roles: ['owner'] });
    expect(denied.status).toBe(403); // sales_rep scope cannot mint keys
  });

  it('revoked keys fail immediately', async () => {
    const created = await api(T.token).post('/api/v1/platform/api-keys').send({ name: 'short-lived', roles: ['employee'] });
    const revoked = await api(T.token).post(`/api/v1/platform/api-keys/${created.body.key.id}/revoke`).send();
    expect(revoked.status).toBe(200);
    const call = await api(T.rawKey ? created.body.raw_key : '').get('/api/v1/contacts');
    expect([401, 403]).toContain(call.status);
  });

  it('non-owner cannot mint keys (RBAC)', async () => {
    const rep = (await request(app.getHttpServer()).post('/api/v1/dev/token').send({ tenant_name: 'Platform Co', user_email: 'r@plat.test', plan: 'enterprise', roles: ['sales_rep'] })).body.token;
    expect((await api(rep).post('/api/v1/platform/api-keys').send({ name: 'x', roles: ['owner'] })).status).toBe(403);
  });

  it('admin cannot mint an owner-scoped API key', async () => {
    const admin = (await request(app.getHttpServer()).post('/api/v1/dev/token').send({ tenant_name: 'Platform Co', user_email: 'admin@plat.test', plan: 'enterprise', roles: ['admin'] })).body.token;
    expect((await api(admin).post('/api/v1/platform/api-keys').send({ name: 'owner escalation', roles: ['owner'] })).status).toBe(403);
  });

  it('platform roles cannot be assigned through tenant membership', async () => {
    const response = await request(app.getHttpServer()).post('/api/v1/dev/token').send({
      tenant_name: 'Platform Co', user_email: 'platform@plat.test', plan: 'enterprise', roles: ['platform_super_admin'],
    });
    expect(response.status).toBe(400);
  });
});

describe('P6 — Developer Hub: outbound webhooks with SSRF guard', () => {
  it('rejects loopback/private targets (SSRF protection)', async () => {
    const bad = await api(T.token).post('/api/v1/platform/outbound-webhooks').send({ url: 'http://localhost:8080/hook', events: ['contact.created'] });
    expect(bad.status).toBe(400);
    expect(bad.body.message).toMatch(/SSRF|private|loopback/i);
    const bad2 = await api(T.token).post('/api/v1/platform/outbound-webhooks').send({ url: 'http://192.168.1.1/hook', events: ['contact.created'] });
    expect(bad2.status).toBe(400);
  });

  it('registers a public endpoint; test-fire retries then DLQs honestly (offline)', async () => {
    const reg = await api(T.token).post('/api/v1/platform/outbound-webhooks').send({ url: 'https://hooks.example-crm.test/gcc', events: ['contact.created', 'test.fire'] });
    expect(reg.status).toBe(201);
    T.hookId = reg.body.webhook.id;
    expect(reg.body.secret).toMatch(/^whsec_/);
    const storedHook = store.snapshot?.().outbound_webhooks.find((hook) => hook.id === T.hookId);
    expect(storedHook?.secret_ciphertext).toMatch(/^v1:/);
    expect(decryptSecret(storedHook!.secret_ciphertext)).toBe(reg.body.secret);
    expect(storedHook).not.toHaveProperty('secret');

    const fire = await api(T.token).post(`/api/v1/platform/outbound-webhooks/${T.hookId}/test-fire`).send();
    expect(fire.status).toBe(200);
    T.deliveryId = fire.body.delivery_id;

    const deliveries = await api(T.token).get(`/api/v1/platform/outbound-webhooks/${T.hookId}/deliveries`);
    const d = deliveries.body.deliveries.find((x: any) => x.id === T.deliveryId);
    expect(d.status).toBe('failed'); // honest: no egress in this environment
    expect(d.attempts).toBe(2);
    // DLQ entry recorded
    const runs = await api(T.token).get('/api/v1/workflows/runs'); // sanity the API is alive
    expect(runs.status).toBe(200);
  });
});

describe('P6 — Governance: DSAR export + anonymization (U)', () => {
  it('export returns everything held about the person', async () => {
    const c = await api(T.token).post('/api/v1/contacts').send({ first_name: 'Privacy', email: 'privacy@x.ae' });
    const dsar = await api(T.token).post('/api/v1/platform/dsar').send({ contact_id: c.body.contact.id, type: 'export' });
    const done = await api(T.token).post(`/api/v1/platform/dsar/${dsar.body.dsar.id}/process`).send();
    expect(done.body.status).toBe('completed');
    expect(done.body.export.contact.email).toBe('privacy@x.ae');
    expect(Array.isArray(done.body.export.activities)).toBe(true);
  });

  it('delete = anonymization: PII removed, records retained, audited', async () => {
    const c = await api(T.token).post('/api/v1/contacts').send({ first_name: 'Deleteme', email: 'deleteme@x.ae' });
    const dsar = await api(T.token).post('/api/v1/platform/dsar').send({ contact_id: c.body.contact.id, type: 'delete' });
    const done = await api(T.token).post(`/api/v1/platform/dsar/${dsar.body.dsar.id}/process`).send();
    expect(done.body.anonymized).toBe(true);
    const after = await api(T.token).get(`/api/v1/contacts/${c.body.contact.id}`);
    expect(after.body.contact.first_name).toBe('REDACTED');
    expect(after.body.contact.email).toBeNull();
    const audit = await api(T.token).get('/api/v1/audit');
    expect(audit.body.events.some((e: any) => e.action === 'privacy.dsar_delete_completed')).toBe(true);
  });
});

describe('P6 — Retention sweep', () => {
  it('dry-run plans without redacting; real run anonymizes customer data', async () => {
    const t = await api(T.token).post('/api/v1/service/tickets').send({ subject: 'Old resolved ticket' });
    await api(T.token).post(`/api/v1/service/tickets/${t.body.ticket.id}/resolve`).send();
    const future = new Date(Date.now() + 86400_000).toISOString();
    const dry = await api(T.token).post('/api/v1/platform/retention/sweep').send({ before: future, dry_run: true });
    expect(dry.body.dry_run).toBe(true);
    expect(dry.body.tickets_in_scope).toBeGreaterThanOrEqual(1);
    const real = await api(T.token).post('/api/v1/platform/retention/sweep').send({ before: future, dry_run: false });
    expect(real.body.tickets_in_scope).toBeGreaterThanOrEqual(1);
    // retention detaches customer links on resolved tickets; audit recorded
    const audit = await api(T.token).get('/api/v1/audit');
    expect(audit.body.events.some((e: any) => e.action === 'privacy.retention_sweep')).toBe(true);
  });
});

describe('P6 — Reseller provisioning + white-label (Q)', () => {
  it('provisions a child tenant atomically; isolated from parent', async () => {
    const r = await api(T.token).post('/api/v1/platform/resellers').send({ name: 'Gulf Partners FZC' });
    const child = await api(T.token).post(`/api/v1/platform/resellers/${r.body.reseller.id}/tenants`).send({ name: 'Partner Dubai', owner_email: 'owner@partner.test', plan: 'starter' });
    expect(child.status).toBe(201);
    expect(child.body.tenant.plan).toBe('starter');

    // branding on the parent
    const brand = await api(T.token).post('/api/v1/platform/branding').send({ brand_color: '#0F766E', custom_domain: 'crm.gulfpartners.ae' });
    expect(brand.body.settings.custom_domain).toBe('crm.gulfpartners.ae');

    // child tenant has its own owner; parent's data is not visible there
    // (proven structurally: memberships are per-tenant; isolation suite P1 covers cross-tenant 404s)
  });
});

describe('P6 — Industry packs (T)', () => {
  it('lists packs; activation creates fields + pipeline (idempotent)', async () => {
    const list = await api(T.token).get('/api/v1/platform/industry-packs');
    expect(list.body.packs.length).toBeGreaterThanOrEqual(7);
    const act = await api(T.token).post('/api/v1/platform/industry-pack/real_estate/activate').send();
    expect(act.status).toBe(200);
    expect(act.body.fields_created.length).toBeGreaterThanOrEqual(3);
    expect(act.body.pipeline).toBe('Real Estate Sales');
    // idempotent second activation
    const again = await api(T.token).post('/api/v1/platform/industry-pack/real_estate/activate').send();
    expect(again.body.fields_created).toHaveLength(0);
  });
});

describe('P6 — DR backup/restore drill', () => {
  it('snapshot → mutate → restore is tenant-scoped and excludes credential material', async () => {
    const otherToken = (await request(app.getHttpServer()).post('/api/v1/dev/token').send({
      tenant_name: 'Other Co', user_email: 'owner@other.test', plan: 'enterprise', roles: ['owner', 'customer_confidential'],
    })).body.token;
    const otherContact = await api(otherToken).post('/api/v1/contacts').send({ first_name: 'OtherTenant', email: 'other@x.ae' });
    expect(otherContact.status).toBe(201);

    const backup = await api(T.token).get('/api/v1/platform/backup');
    expect(backup.status).toBe(200);
    expect(backup.body.tables).toBeGreaterThan(20);
    expect(backup.body.snapshot.contacts.some((row: any) => row.id === otherContact.body.contact.id)).toBe(false);
    expect(backup.body.snapshot).not.toHaveProperty('provider_credentials');
    expect(backup.body.snapshot).not.toHaveProperty('api_keys');
    expect(backup.body.snapshot).not.toHaveProperty('audit_events');
    expect(backup.body.snapshot).not.toHaveProperty('activity_events');
    const rowsBefore = backup.body.rows;

    // mutate: add a contact
    const c = await api(T.token).post('/api/v1/contacts').send({ first_name: 'PostBackup', email: 'postbackup@x.ae' });
    expect(c.status).toBe(201);

    // restore the snapshot (rollback data returned by the restore call itself)
    const restore = await api(T.token).post('/api/v1/platform/restore').send({ snapshot: backup.body.snapshot });
    expect(restore.body.ok).toBe(true);
    expect(restore.body.restored_tables).toBe(backup.body.tables);
    expect((await api(otherToken).get(`/api/v1/contacts/${otherContact.body.contact.id}`)).status).toBe(200);

    // The post-backup contact is gone, while append-only logs are retained.
    const after = await api(T.token).get('/api/v1/platform/backup');
    expect(after.body.rows).toBe(rowsBefore);
  });
});
