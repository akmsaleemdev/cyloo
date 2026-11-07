// Phase 5 e2e — Commerce (N): verified-tax gate, invoice totals/state machine,
// signed gateway webhook with dedupe + partial/full payment.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createHmac } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { createApp } from '../src/main.js';
import { signDevToken } from '../src/common/auth.js';
import { store } from '../src/common/store.js';

let app: INestApplication;
const T = { token: '', tenantId: '', invoiceId: '', linkId: '', linkSecret: '', total: 0 };

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
  const owner = await request(app.getHttpServer()).post('/api/v1/dev/token').send({
    tenant_name: 'Commerce Co', user_email: 'c@com.test', plan: 'enterprise', roles: ['owner', 'finance_sensitive'],
  });
  T.token = owner.body.token;
  T.tenantId = owner.body.tenant.id;
});

afterAll(async () => { await app.close(); });

describe('P5 — verified tax rate gate (regulatory)', () => {
  it('requires an explicit sensitive-finance permission', async () => {
    const basicOwner = (await request(app.getHttpServer()).post('/api/v1/dev/token').send({
      tenant_name: 'Basic Commerce Co', user_email: 'basic@com.test', plan: 'enterprise',
    })).body.token;
    expect((await api(basicOwner).get('/api/v1/commerce/invoices')).status).toBe(403);
  });

  it('invoice creation without a verified tax rate is rejected', async () => {
    const res = await api(T.token).post('/api/v1/commerce/invoices').send({
      currency: 'AED', country: 'AE',
      lines: [{ description: 'Licence', qty: 2, unit_price: '1000.00', tax_pct: 5 }],
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('NO_TAX_RATE');
  });

  it('tax rate requires source evidence fields', async () => {
    const bad = await api(T.token).post('/api/v1/commerce/tax-rates').send({ country: 'AE', rate_pct: 5, effective_from: '2026-01-01' });
    expect(bad.status).toBe(400); // missing source_url/verified_on
    const ok = await api(T.token).post('/api/v1/commerce/tax-rates').send({
      country: 'AE', rate_pct: 5, effective_from: '2026-01-01',
      source_url: 'https://tax.gov.ae/vat/', verified_on: '2026-11-01',
    });
    expect(ok.status).toBe(201);
  });
});

describe('P5 — invoice state machine (server-computed money)', () => {
  it('draft → issue allocates number; KWD 3dp totals exact', async () => {
    const inv = await api(T.token).post('/api/v1/commerce/invoices').send({
      currency: 'AED', country: 'AE',
      lines: [{ description: 'Licence', qty: 2, unit_price: '1000.00', tax_pct: 5 }],
    });
    expect(inv.status).toBe(201);
    T.invoiceId = inv.body.invoice.id;
    expect(inv.body.invoice.subtotal).toBe(200000);
    expect(inv.body.invoice.tax_total).toBe(10000);
    expect(inv.body.invoice.total).toBe(210000);

    // draft cannot be paid via link
    const early = await api(T.token).post('/api/v1/commerce/payment-links').send({ invoice_id: T.invoiceId, gateway: 'sandbox' });
    expect(early.status).toBe(409);

    const issued = await api(T.token).post(`/api/v1/commerce/invoices/${T.invoiceId}/issue`).send();
    expect(issued.body.invoice.number).toMatch(/^INV-/);
    expect(issued.body.invoice.status).toBe('issued');

    // KWD precision on a second invoice
    const kwd = await api(T.token).post('/api/v1/commerce/invoices').send({
      currency: 'KWD', country: 'AE',
      lines: [{ description: 'Consulting', qty: 1, unit_price: '100.250', tax_pct: 0 }],
    });
    expect(kwd.body.invoice.total).toBe(100250);
    await api(T.token).post(`/api/v1/commerce/invoices/${kwd.body.invoice.id}/issue`).send();

    const member = await store.tx((db) => {
      const user = db.insert('users', { email: 'accountant@com.test', name: 'Scoped accountant' });
      return db.insert('memberships', {
        tenant_id: T.tenantId, user_id: user.id, roles: ['accountant', 'finance_sensitive'], status: 'active',
      });
    });
    const scopedToken = signDevToken({ t: T.tenantId, u: member.user_id, m: member.id, p: 'enterprise' });
    const hidden = await api(scopedToken).get(`/api/v1/commerce/invoices/${T.invoiceId}`);
    expect(hidden.status).toBe(404);
    const own = await api(scopedToken).post('/api/v1/commerce/invoices').send({
      currency: 'AED', country: 'AE',
      lines: [{ description: 'Scoped service', qty: 1, unit_price: '50.00', tax_pct: 5 }],
    });
    expect(own.status).toBe(201);
    const listed = await api(scopedToken).get('/api/v1/commerce/invoices');
    expect(listed.body.invoices.map((invoice: any) => invoice.id)).toEqual([own.body.invoice.id]);
  });

  it('signed gateway webhook: partial then full payment; replay deduped', async () => {
    const link = await api(T.token).post('/api/v1/commerce/payment-links').send({ invoice_id: T.invoiceId, gateway: 'sandbox' });
    expect(link.status).toBe(201);
    T.linkId = link.body.link.id;
    T.linkSecret = link.body.webhook_secret;
    T.total = link.body.link.amount;

    const event = (id: string, amount: string) => ({
      event_id: id, type: 'payment.succeeded', link_id: T.linkId, amount, currency: 'AED',
    });

    // unsigned → 403
    const unsigned = await request(app.getHttpServer()).post('/api/v1/payments/webhook').send(event('evt-pay-000001', '1000.00'));
    expect(unsigned.status).toBe(403);

    // partial payment 1000.00 AED of 2100.00 AED
    const body1 = JSON.stringify(event('evt-pay-000001', '1000.00'));
    const sig1 = createHmac('sha256', T.linkSecret).update(body1).digest('hex');
    const r1 = await request(app.getHttpServer()).post('/api/v1/payments/webhook').set('x-signature', sig1).set('Content-Type', 'application/json').send(body1);
    expect(r1.body.invoice_status).toBe('partially_paid');
    expect(r1.body.remaining).toBe(110000);

    // replay same event id → deduped, no second credit
    const replay = await request(app.getHttpServer()).post('/api/v1/payments/webhook').set('x-signature', sig1).set('Content-Type', 'application/json').send(body1);
    expect(replay.body.duplicate).toBe(true);

    // final payment clears the invoice
    const body2 = JSON.stringify(event('evt-pay-000002', '1100.00'));
    const sig2 = createHmac('sha256', T.linkSecret).update(body2).digest('hex');
    const r2 = await request(app.getHttpServer()).post('/api/v1/payments/webhook').set('x-signature', sig2).set('Content-Type', 'application/json').send(body2);
    expect(r2.body.invoice_status).toBe('paid');
    expect(r2.body.remaining).toBe(0);

    // tampered signature rejected
    const bad = await request(app.getHttpServer()).post('/api/v1/payments/webhook').set('x-signature', 'a'.repeat(64)).set('Content-Type', 'application/json').send(event('evt-pay-000003', '1.00'));
    expect(bad.status).toBe(403);
  });
});
