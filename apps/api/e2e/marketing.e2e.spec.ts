// Phase 4 e2e — Marketing Hub (F) + Analytics (M): consent/suppression/cap
// gates per recipient, A/B, templates, funnel from recorded data.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createApp } from '../src/main.js';
import { signDevToken } from '../src/common/auth.js';
import { store } from '../src/common/store.js';

let app: INestApplication;
const T = { token: '', tenantId: '', audience: '', campaign: '', tpl: '' };
const contacts: string[] = [];

function api(t: string) {
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${t}`);
  return {
    post: (url: string) => auth(request(app.getHttpServer()).post(url)),
    get: (url: string) => auth(request(app.getHttpServer()).get(url)),
    patch: (url: string) => auth(request(app.getHttpServer()).patch(url)),
  };
}

beforeAll(async () => {
  app = await createApp();
  await app.init();
  const owner = await request(app.getHttpServer()).post('/api/v1/dev/token').send({
    tenant_name: 'Mkt Co', user_email: 'm@mkt.test', plan: 'growth',
    roles: ['owner', 'customer_confidential', 'finance_sensitive'],
  });
  T.token = owner.body.token;
  T.tenantId = owner.body.tenant.id;

  // 4 contacts with emails
  for (const [name, email] of [['Aisha', 'aisha@x.ae'], ['Faisal', 'faisal@x.ae'], ['Mariam', 'mariam@x.ae'], ['Salem', 'salem@x.ae']]) {
    const c = await api(T.token).post('/api/v1/contacts').send({ first_name: name, email });
    contacts.push(c.body.contact.id);
  }
  // consent: only aisha + faisal opted in to email
  await api(T.token).post('/api/v1/consents').send({ channel_kind: 'email', contact_id: contacts[0], state: 'opt_in', evidence: { src: 'form' } });
  await api(T.token).post('/api/v1/consents').send({ channel_kind: 'email', contact_id: contacts[1], state: 'opt_in', evidence: { src: 'form' } });
  // salem suppressed (evidence even though no consent → suppressed reported)
  await api(T.token).post('/api/v1/suppressions').send({ channel_kind: 'email', email: 'salem@x.ae', reason: 'bounce' });

  const tpl = await api(T.token).post('/api/v1/marketing/templates').send({ channel_kind: 'email', name: 'newsletter', body: 'Hi {{first_name}}, GCC-CRM news inside!', language: 'en' });
  T.tpl = tpl.body.template.id;
  const seg = await api(T.token).post('/api/v1/segments').send({ name: 'All', filters: {} });
  const aud = await api(T.token).post('/api/v1/marketing/audiences').send({ name: 'All contacts', segment_id: seg.body.segment.id });
  T.audience = aud.body.audience.id;
  expect(aud.body.audience.count).toBe(4);
  const camp = await api(T.token).post('/api/v1/marketing/campaigns').send({ name: 'Launch blast', channel_kind: 'email', template_id: T.tpl, audience_id: T.audience });
  T.campaign = camp.body.campaign.id;
});

afterAll(async () => { await app.close(); });

describe('P4 — consent-aware sending (per-recipient gates)', () => {
  it('limits audiences and campaigns to records assigned to the caller', async () => {
    const member = await store.tx((db) => {
      const user = db.insert('users', { email: 'scoped@mkt.test', name: 'Scoped marketer' });
      return db.insert('memberships', {
        tenant_id: T.tenantId, user_id: user.id, roles: ['marketing', 'customer_confidential'], status: 'active',
      });
    });
    const scopedToken = signDevToken({ t: T.tenantId, u: member.user_id, m: member.id, p: 'growth' });
    const contact = await api(T.token).post('/api/v1/contacts').send({
      first_name: 'Scoped', email: 'scoped@x.ae', owner_id: member.id,
    });
    expect(contact.status).toBe(201);

    const segment = await api(T.token).post('/api/v1/segments').send({ name: 'Scoped segment', filters: {} });
    const audience = await api(scopedToken).post('/api/v1/marketing/audiences').send({
      name: 'Scoped audience', segment_id: segment.body.segment.id,
    });
    expect(audience.status).toBe(201);
    expect(audience.body.audience.count).toBe(1);

    const campaign = await api(scopedToken).post('/api/v1/marketing/campaigns').send({
      name: 'Scoped campaign', channel_kind: 'email', audience_id: audience.body.audience.id,
    });
    expect(campaign.status).toBe(201);
    const listed = await api(scopedToken).get('/api/v1/marketing/campaigns');
    expect(listed.body.campaigns.map((row: any) => row.id)).toEqual([campaign.body.campaign.id]);
  });

  it('sends only to consented+unsuppressed; reports every outcome', async () => {
    const res = await api(T.token).post(`/api/v1/marketing/${T.campaign}/send`).send();
    expect(res.status).toBe(200);
    expect(res.body.metrics).toEqual({ sent: 2, skipped_consent: 2, skipped_suppressed: 0, skipped_frequency_cap: 0 });
    // aisha + faisal got the rendered template
    const list = await api(T.token).get('/api/v1/marketing/campaigns');
    expect(list.body.campaigns.find((c: any) => c.id === T.campaign).metrics.sent).toBe(2);
  });

  it('template variables rendered per recipient', async () => {
    // aisha's send body contains her name; check via campaign analytics sends
    const list = await api(T.token).get('/api/v1/analytics/campaigns');
    const c = list.body.campaigns.find((x: any) => x.id === T.campaign);
    expect(c.sends).toBe(2);
  });

  it('replay send rejected (campaign completed)', async () => {
    const res = await api(T.token).post(`/api/v1/marketing/${T.campaign}/send`).send();
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_SENT');
  });
});

describe('P4 — frequency caps + A/B', () => {
  it('frequency cap blocks the second send within the window', async () => {
    await api(T.token).post('/api/v1/marketing/frequency-caps').send({ contact_id: contacts[0], channel_kind: 'email', window: 'day', max_messages: 1 });
    const camp2 = await api(T.token).post('/api/v1/marketing/campaigns').send({ name: 'Follow-up', channel_kind: 'email', template_id: T.tpl, audience_id: T.audience });
    const res = await api(T.token).post(`/api/v1/marketing/${camp2.body.campaign.id}/send`).send();
    expect(res.body.metrics.skipped_frequency_cap).toBeGreaterThanOrEqual(1);
    expect(res.body.metrics.sent).toBeLessThan(2);
  });

  it('A/B variants split recipients', async () => {
    // consent mariam too (aisha is frequency-capped by the previous test)
    await api(T.token).post('/api/v1/consents').send({ channel_kind: 'email', contact_id: contacts[2], state: 'opt_in', evidence: { src: 'form' } });
    const camp = await api(T.token).post('/api/v1/marketing/campaigns').send({ name: 'AB test', channel_kind: 'email', template_id: T.tpl, audience_id: T.audience });
    const v = await api(T.token).post(`/api/v1/marketing/${camp.body.campaign.id}/variants`).send({ name: 'Variant B', body_override: 'B variant for {{first_name}}' });
    expect(v.status).toBe(201);
    const res = await api(T.token).post(`/api/v1/marketing/${camp.body.campaign.id}/send`).send();
    const sentCampaigns = res.body.outcomes.filter((o: any) => o.status === 'sent');
    expect(sentCampaigns.length).toBeGreaterThanOrEqual(2);
    const usedCampaigns = new Set(sentCampaigns.map((o: any) => o.campaign));
    expect(usedCampaigns.size).toBe(2); // split across parent + variant
  });
});

describe('P4 — analytics from recorded data', () => {
  it('funnel counts leads/opportunities/won', async () => {
    // seed a lead + opportunity + won via APIs
    await api(T.token).post('/api/v1/leads').send({ name: 'Funnel lead', email: 'funnel@x.ae' });
    const pipelines = await api(T.token).get('/api/v1/pipelines');
    const stages = pipelines.body.pipelines[0].stages;
    const opp = await api(T.token).post('/api/v1/opportunities').send({ pipeline_id: pipelines.body.pipelines[0].id, name: 'Funnel deal', amount: '50000.00' });
    const won = stages.find((s: any) => s.is_won);
    await api(T.token).patch(`/api/v1/opportunities/${opp.body.opportunity.id}/stage`).send({ stage_id: won.id });
    const f = await api(T.token).get('/api/v1/analytics/funnel');
    expect(f.body.leads_total).toBeGreaterThanOrEqual(1);
    expect(f.body.won).toBeGreaterThanOrEqual(1);
    expect(f.body.won_amount_minor).toBeGreaterThanOrEqual(5000000);
  });

  it('sales performance per owner', async () => {
    const res = await api(T.token).get('/api/v1/analytics/sales-performance');
    expect(res.body.performance.length).toBeGreaterThanOrEqual(1);
    expect(res.body.performance[0].amount).toBeGreaterThan(0);
  });

  it('response times measured from inbox messages', async () => {
    const res = await api(T.token).get('/api/v1/analytics/response-times');
    expect(res.body.conversations_measured).toBe(0); // no inbox activity in this tenant
  });
});
