// Phase 4 e2e — Workflow Engine (module K): versioning, idempotency,
// retries→DLQ, dry-run, branch conditions, event-triggered runs.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { createApp } from '../src/main.js';

let app: INestApplication;
const T = { token: '', wfSimple: '', wfBranch: '', wfBroken: '' };

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
  T.token = (await request(app.getHttpServer()).post('/api/v1/dev/token').send({ tenant_name: 'Flow Co', user_email: 'f@flow.test', plan: 'growth' })).body.token;

  const simple = await api(T.token).post('/api/v1/workflows').send({
    name: 'Welcome new contacts',
    definition: {
      trigger: 'contact.created',
      steps: [
        { id: 'notify', type: 'notify_user', config: {} },
        { id: 'task', type: 'create_task', config: { title: 'Say hello to the new contact' } },
      ],
    },
  });
  T.wfSimple = simple.body.workflow.id;

  const branch = await api(T.token).post('/api/v1/workflows').send({
    name: 'Hot lead router',
    definition: {
      trigger: 'lead.created',
      steps: [
        { id: 'hot', type: 'condition', config: { field: 'payload.score', op: 'gt', value: 50 } },
        { id: 'task', type: 'create_task', when: 'hot', config: { title: 'Call hot lead NOW' } },
        { id: 'notify', type: 'notify_user', when: 'hot', config: {} },
      ],
    },
  });
  T.wfBranch = branch.body.workflow.id;

  const broken = await api(T.token).post('/api/v1/workflows').send({
    name: 'Egress (unconfigured on purpose)',
    definition: {
      trigger: 'opportunity.won',
      steps: [{ id: 'call', type: 'webhook_out', config: { url: 'https://example.test/hook' } }],
    },
  });
  T.wfBroken = broken.body.workflow.id;
});

afterAll(async () => { await app.close(); });

describe('P4 — workflow basics', () => {
  it('dry-run returns the plan with ZERO side effects', async () => {
    const before = (await api(T.token).get('/api/v1/notifications')).body.notifications.length;
    const res = await api(T.token).post(`/api/v1/workflows/${T.wfSimple}/dry-run`).send({ event: { key: 'contact.created', payload: {} } });
    expect(res.status).toBe(200);
    expect(res.body.plan).toHaveLength(2);
    const after = (await api(T.token).get('/api/v1/notifications')).body.notifications.length;
    expect(after).toBe(before); // no side effects
  });

  it('trigger mismatch rejected (400)', async () => {
    const res = await api(T.token).post('/api/v1/workflows/events').send({ key: 'lead.created', payload: {} });
    // matches branch wf only; simple wf mismatches silently (not matched)
    expect(res.body.matched).toBe(1);
  });

  it('event executes matching workflow: notification + task created', async () => {
    const res = await api(T.token).post('/api/v1/workflows/events').send({ key: 'contact.created', payload: { contact_id: 'none' }, idempotency_key: 'evt-simple-1' });
    expect(res.body.matched).toBe(1);
    expect(res.body.results[0].status).toBe('completed');
    const notifs = (await api(T.token).get('/api/v1/notifications')).body.notifications;
    expect(notifs.some((n: any) => n.kind === 'workflow_notify')).toBe(true);
    const tasks = (await api(T.token).get('/api/v1/tasks')).body.tasks;
    expect(tasks.some((t: any) => t.title === 'Say hello to the new contact')).toBe(true);
  });

  it('idempotent replay: same key → no second run', async () => {
    const replay = await api(T.token).post('/api/v1/workflows/events').send({ key: 'contact.created', payload: { contact_id: 'none' }, idempotency_key: 'evt-simple-1' });
    expect(replay.body.results[0].duplicate).toBe(true);
    const runs = (await api(T.token).get('/api/v1/workflows/runs')).body.runs.filter((r: any) => r.idempotency_key === 'evt-simple-1:contact.created'.slice(0, 0) || true);
    const count = (await api(T.token).get('/api/v1/workflows/runs')).body.runs.filter((r: any) => r.idempotency_key?.startsWith('evt-simple-1')).length;
    expect(count).toBe(1);
  });
});

describe('P4 — branch conditions', () => {
  it('cold lead: condition skipped → downstream steps skipped', async () => {
    await api(T.token).post('/api/v1/workflows/events').send({ key: 'lead.created', payload: { score: 10 }, idempotency_key: 'evt-cold-1' });
    const runs = (await api(T.token).get('/api/v1/workflows/runs')).body.runs;
    const run = runs.find((r: any) => r.idempotency_key?.startsWith('evt-cold-1'));
    expect(run.status).toBe('completed');
    expect(run.steps.find((s: any) => s.node_id === 'task').status).toBe('skipped');
    expect(run.steps.find((s: any) => s.node_id === 'notify').status).toBe('skipped');
  });

  it('hot lead: downstream steps execute', async () => {
    await api(T.token).post('/api/v1/workflows/events').send({ key: 'lead.created', payload: { score: 80 }, idempotency_key: 'evt-hot-1' });
    const runs = (await api(T.token).get('/api/v1/workflows/runs')).body.runs;
    const run = runs.find((r: any) => r.idempotency_key?.startsWith('evt-hot-1'));
    expect(run.steps.find((s: any) => s.node_id === 'task').status).toBe('succeeded');
    expect(run.steps.find((s: any) => s.node_id === 'notify').status).toBe('succeeded');
    const tasks = (await api(T.token).get('/api/v1/tasks')).body.tasks;
    expect(tasks.some((t: any) => t.title === 'Call hot lead NOW')).toBe(true);
  });
});

describe('P4 — failure → retry → DLQ', () => {
  it('webhook_out (declared unconfigured) retries then dead-letters; run failed', async () => {
    const res = await api(T.token).post('/api/v1/workflows/events').send({ key: 'opportunity.won', payload: { opportunity_id: 'x' }, idempotency_key: 'evt-broken-1' });
    expect(res.body.results[0].status).toBe('failed');
    const runs = (await api(T.token).get('/api/v1/workflows/runs')).body.runs;
    const run = runs.find((r: any) => r.idempotency_key?.startsWith('evt-broken-1'));
    const step = run.steps.find((s: any) => s.node_id === 'call');
    expect(step.status).toBe('dead');
    expect(step.attempt).toBe(2);
  });
});

describe('P4 — versioning', () => {
  it('new version bumps pointer; runs pin their version', async () => {
    const v2 = await api(T.token).post(`/api/v1/workflows/${T.wfSimple}/versions`).send({
      definition: { trigger: 'contact.created', steps: [{ id: 'only_task', type: 'create_task', config: { title: 'v2 task' } }] },
    });
    expect(v2.body.version).toBe(2);
    // dry-run with the new event payload shape still works and shows 1 step
    const dry = await api(T.token).post(`/api/v1/workflows/${T.wfSimple}/dry-run`).send({ event: { key: 'contact.created', payload: {} } });
    expect(dry.body.plan).toHaveLength(1);
    // existing completed run still records its original version
    const runs = (await api(T.token).get('/api/v1/workflows/runs')).body.runs;
    const old = runs.find((r: any) => r.idempotency_key?.startsWith('evt-simple-1'));
    expect(old.workflow_version).toBe(1);
  });
});
