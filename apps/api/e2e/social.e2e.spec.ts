// Phase 5 e2e — Social (G) approval machine + provider-unconfigured publish
// gate, sandbox publish double; Ads (H) lead ingest with attribution.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createApp } from '../src/main.js';

let app: INestApplication;
const T = { token: '', postId: '' };

function api(t: string) {
  const auth = (r: request.Test) => r.set('Authorization', `Bearer ${t}`);
  return {
    post: (url: string) => auth(request(app.getHttpServer()).post(url)),
    get: (url: string) => auth(request(app.getHttpServer()).get(url)),
  };
}

beforeAll(async () => {
  app = await createApp();
  await app.init();
  T.token = (await request(app.getHttpServer()).post('/api/v1/dev/token').send({ tenant_name: 'Social Co', user_email: 's@soc.test', plan: 'growth' })).body.token;
  const p = await api(T.token).post('/api/v1/social/posts').send({ content: 'RAMADAN OFFER — 30% off annual plans! 🌙', channels: ['instagram', 'tiktok'], language: 'en' });
  T.postId = p.body.post.id;
});

afterAll(async () => { await app.close(); });

describe('P5 — social content approval machine', () => {
  it('enforces valid transitions only', async () => {
    const bad = await api(T.token).post(`/api/v1/social/${T.postId}/transition`).send({ to: 'published' });
    expect(bad.status).toBe(409); // draft → published is an invalid transition
    await api(T.token).post(`/api/v1/social/${T.postId}/transition`).send({ to: 'review' });
    await api(T.token).post(`/api/v1/social/${T.postId}/transition`).send({ to: 'approved' });
    await api(T.token).post(`/api/v1/social/${T.postId}/transition`).send({ to: 'scheduled' });
    // NOW the machine allows publish, and the provider gate fires instead:
    // official APIs required (app review) — refused, never faked
    const pub = await api(T.token).post(`/api/v1/social/${T.postId}/transition`).send({ to: 'published' });
    expect(pub.status).toBe(422);
    expect(pub.body.code).toBe('PROVIDER_UNCONFIGURED');
    // labelled sandbox publish works for pipeline testing
    const sandbox = await api(T.token).post(`/api/v1/social/${T.postId}/publish-sandbox`).send();
    expect(sandbox.body.post.status).toBe('published');
    expect(sandbox.body.note).toMatch(/TEST DOUBLE/i);
    const detail = await api(T.token).get('/api/v1/social/posts');
    const post = detail.body.posts.find((x: any) => x.id === T.postId);
    expect(post.approvals.length).toBeGreaterThanOrEqual(2); // review + approved recorded
  });
});

describe('P5 — ads lead-form ingest', () => {
  it('creates attributed lead with source + SLA; deduped by email', async () => {
    const l = await api(T.token).post('/api/v1/ads/lead-forms').send({
      form_id: 'gf-123', provider: 'meta_ads', name: 'Ad Lead', email: 'adlead@x.ae',
      attribution: { utm_source: 'facebook', gclid: '', fbclid: 'abc' },
    });
    expect(l.status).toBe(201);
    expect(l.body.lead.attribution.provider).toBe('meta_ads');
    const dup = await api(T.token).post('/api/v1/ads/lead-forms').send({
      form_id: 'gf-123', provider: 'meta_ads', name: 'Ad Lead', email: 'adlead@x.ae', attribution: {},
    });
    expect(dup.status).toBe(409);
  });

  it('connector registry reports honest unconfigured states', async () => {
    const res = await api(T.token).get('/api/v1/ads/accounts');
    expect(res.body.accounts.every((a: any) => a.status === 'unconfigured')).toBe(true);
    expect(res.body.accounts.find((a: any) => a.provider === 'google_ads').prerequisites).toMatch(/developer token/i);
  });
});
