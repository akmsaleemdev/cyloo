// Phase 5 — Commerce Hub (N): verified tax rates, products, invoices with a
// strict state machine, payment links behind a signed sandbox gateway webhook
// (explicit test double), server-computed money only (ADR-0006).
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Body, Controller, Get, HttpCode, Inject, Injectable, Module, NotFoundException, Param, Post, Query, Req } from '@nestjs/common';
import { Db, StoreError, badRequest, conflict, forbidden, nextNumber, notFound, toMinor, unprocessable } from '@crm/shared';
import { z } from 'zod';
import { Ctx, CtxOf, Public } from './common/auth.js';
import { TenancyService } from './common/tenancy.service.js';
import { ZodPipe } from './common/http.js';
import { store, STORE_TOKEN } from './common/store.js';

@Injectable()
export class CommerceService {
  constructor(@Inject(TenancyService) private tenancy: TenancyService) {}

  // The tenant must have a VERIFIED tax rate covering today before invoices
  // can be issued (official-source evidence enforced by schema fields).
  assertVerifiedTaxRate(db: Db, tenantId: string, country: string): any {
    const today = new Date().toISOString().slice(0, 10);
    const rate = db.tone('tax_rate_versions', tenantId, (r) =>
      r.country === country && r.effective_from <= today && (!r.effective_to || r.effective_to >= today));
    if (!rate) {
      throw unprocessable('NO_TAX_RATE', `No verified tax rate for ${country}. Add one with source_url + verified_on first (regulatory gate).`);
    }
    return rate;
  }

  computeTotals(lines: Array<{ description: string; qty: number; unit_price: string; tax_pct: number }>, currency: 'AED' | 'SAR' | 'QAR' | 'KWD' | 'BHD' | 'OMR') {
    const parsed = lines.map((l) => ({ ...l, unit_minor: toMinor(l.unit_price, currency) }));
    const subtotal = parsed.reduce((a, l) => a + Math.round(l.qty * l.unit_minor), 0);
    const tax = parsed.reduce((a, l) => a + Math.round(Math.round(l.qty * l.unit_minor) * (l.tax_pct / 100)), 0);
    return { parsed, subtotal, tax, total: subtotal + tax };
  }

  invoiceRemaining(db: Db, tenantId: string, invoice: any): number {
    const paid = db.tfind('gateway_events', tenantId, (e) =>
      e.invoice_id === invoice.id && e.status === 'paid').reduce((a, e) => a + (e.amount_minor as number), 0);
    return (invoice.total as number) - paid;
  }
}

const invoiceBody = z.object({
  contact_id: z.string().uuid().optional(),
  currency: z.enum(['AED', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR']).default('AED'),
  country: z.enum(['AE', 'SA', 'QA', 'KW', 'BH', 'OM']).default('AE'),
  lines: z.array(z.object({
    description: z.string().min(1).max(200),
    qty: z.number().positive().max(100000),
    unit_price: z.string().regex(/^\d{1,15}(\.\d{1,3})?$/),
    tax_pct: z.number().min(0).max(100).default(5),
  })).min(1).max(100),
});

@Controller('api/v1/commerce')
export class CommerceController {
  constructor(
    @Inject(TenancyService) private tenancy: TenancyService,
    @Inject(STORE_TOKEN) private st: typeof store,
    @Inject(CommerceService) private commerce: CommerceService,
  ) {}

  // ---------- verified tax rates (regulatory gate) ----------
  @Post('tax-rates')
  async addTaxRate(@CtxOf() ctx: Ctx, @Body(new ZodPipe(z.object({
    country: z.enum(['AE', 'SA', 'QA', 'KW', 'BH', 'OM']),
    rate_pct: z.number().min(0).max(100),
    effective_from: z.string().date(),
    source_url: z.string().url().max(300),
    verified_on: z.string().date(),
  }))) body: { country: string; rate_pct: number; effective_from: string; source_url: string; verified_on: string }) {
    this.tenancy.requirePerm(ctx, 'commerce.write');
    return this.st.tx((db) => {
      const row = db.insert('tax_rate_versions', { tenant_id: ctx.tenantId, ...body, effective_to: null });
      this.tenancy.audit(db, ctx.tenantId, ctx, 'commerce.tax_rate_added', 'tax_rate_version', row.id, { country: body.country, rate_pct: body.rate_pct });
      return { status: 201 as const, tax_rate: row };
    });
  }

  @Get('tax-rates')
  async listTaxRates(@CtxOf() ctx: Ctx) {
    this.tenancy.requirePerm(ctx, 'commerce.read');
    return this.st.tx((db) => ({ tax_rates: db.tfind('tax_rate_versions', ctx.tenantId, () => true) }));
  }

  // ---------- products ----------
  @Post('products')
  async createProduct(@CtxOf() ctx: Ctx, @Body(new ZodPipe(z.object({
    sku: z.string().max(40).optional(), name: z.string().min(1).max(120),
    unit_price: z.string().regex(/^\d{1,15}(\.\d{1,3})?$/),
    currency: z.enum(['AED', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR']).default('AED'),
    tax_pct: z.number().min(0).max(100).default(5),
  }))) body: { sku?: string; name: string; unit_price: string; currency: 'AED' | 'SAR' | 'QAR' | 'KWD' | 'BHD' | 'OMR'; tax_pct: number }) {
    this.tenancy.requirePerm(ctx, 'commerce.write');
    this.tenancy.requireSensitivePermission(ctx, 'finance', 'write');
    return this.st.tx((db) => {
      const product = db.insert('products', {
        tenant_id: ctx.tenantId, sku: body.sku ?? null, name: body.name,
        unit_price: toMinor(body.unit_price, body.currency), currency: body.currency,
        tax_pct: body.tax_pct, active: true,
      });
      return { status: 201 as const, product: { ...product, unit_price: body.unit_price } };
    });
  }

  @Get('products')
  async listProducts(@CtxOf() ctx: Ctx) {
    this.tenancy.requirePerm(ctx, 'commerce.read');
    this.tenancy.requireSensitivePermission(ctx, 'finance', 'read');
    return this.st.tx((db) => ({ products: db.tfind('products', ctx.tenantId, () => true) }));
  }

  // ---------- invoices ----------
  @Post('invoices')
  async createInvoice(@CtxOf() ctx: Ctx, @Body(new ZodPipe(invoiceBody)) body: z.infer<typeof invoiceBody>) {
    this.tenancy.requirePerm(ctx, 'commerce.write');
    this.tenancy.requireSensitivePermission(ctx, 'finance', 'write');
    return this.st.tx((db) => {
      this.commerce.assertVerifiedTaxRate(db, ctx.tenantId, body.country);
      if (body.contact_id) {
        const contact = db.tget('contacts', ctx.tenantId, body.contact_id);
        if (!contact) throw badRequest('contact_id not found in this workspace');
        this.tenancy.requireSensitivePermission(ctx, 'customer', 'read');
        this.tenancy.requireRecordAccess(ctx, 'crm', contact, 'read');
      }
      const t = this.commerce.computeTotals(body.lines, body.currency);
      const invoice = db.insert('invoices', {
        tenant_id: ctx.tenantId, number: null, contact_id: body.contact_id ?? null,
        owner_id: ctx.membershipId, department_id: ctx.departmentId ?? null, team_id: ctx.teamIds?.[0] ?? null,
        status: 'draft', currency: body.currency, country: body.country,
        subtotal: t.subtotal, tax_total: t.tax, total: t.total, due_date: null, issued_at: null,
      });
      for (const l of t.parsed) {
        db.insert('invoice_lines', {
          tenant_id: ctx.tenantId, invoice_id: invoice.id, description: l.description,
          qty: l.qty, unit_price: l.unit_minor, tax_rate: l.tax_pct,
          line_total: Math.round(l.qty * l.unit_minor) + Math.round(Math.round(l.qty * l.unit_minor) * (l.tax_pct / 100)),
        });
      }
      this.tenancy.audit(db, ctx.tenantId, ctx, 'commerce.invoice_created', 'invoice', invoice.id, { total: t.total });
      return { status: 201 as const, invoice };
    });
  }

  @Get('invoices')
  async listInvoices(@CtxOf() ctx: Ctx, @Query('status') status?: string) {
    this.tenancy.requirePerm(ctx, 'commerce.read');
    this.tenancy.requireSensitivePermission(ctx, 'finance', 'read');
    return this.st.tx((db) => {
      let rows = this.tenancy.filterByScope(ctx, 'commerce', db.tfind('invoices', ctx.tenantId, () => true));
      if (status) rows = rows.filter((i) => i.status === status);
      return { invoices: rows.map((i) => ({ ...i, remaining: this.commerce.invoiceRemaining(db, ctx.tenantId, i) })) };
    });
  }

  @Get('invoices/:id')
  async getInvoice(@CtxOf() ctx: Ctx, @Param('id') id: string) {
    this.tenancy.requirePerm(ctx, 'commerce.read');
    this.tenancy.requireSensitivePermission(ctx, 'finance', 'read');
    return this.st.tx((db) => {
      const invoice = db.tget('invoices', ctx.tenantId, id);
      if (!invoice) throw notFound('Invoice not found');
      this.tenancy.requireRecordAccess(ctx, 'commerce', invoice, 'read');
      return { invoice: { ...invoice, remaining: this.commerce.invoiceRemaining(db, ctx.tenantId, invoice) }, lines: db.tfind('invoice_lines', ctx.tenantId, (l) => l.invoice_id === id) };
    });
  }

  @HttpCode(200)
  @Post('invoices/:id/issue')
  async issue(@CtxOf() ctx: Ctx, @Param('id') id: string) {
    this.tenancy.requirePerm(ctx, 'commerce.write');
    this.tenancy.requireSensitivePermission(ctx, 'finance', 'write');
    return this.st.tx((db) => {
      const invoice = db.tget('invoices', ctx.tenantId, id);
      if (!invoice) throw notFound('Invoice not found');
      this.tenancy.requireRecordAccess(ctx, 'commerce', invoice, 'write');
      if (invoice.status !== 'draft') throw conflict('INVALID_STATE', `Invoice is ${invoice.status}`);
      this.commerce.assertVerifiedTaxRate(db, ctx.tenantId, invoice.country as string);
      const number = nextNumber(db, ctx.tenantId, 'invoice', 'INV');
      const due = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
      const updated = db.update('invoices', id, { number, status: 'issued', issued_at: new Date().toISOString(), due_date: due });
      this.tenancy.audit(db, ctx.tenantId, ctx, 'commerce.invoice_issued', 'invoice', id, { number });
      return { invoice: updated };
    });
  }

  @HttpCode(200)
  @Post('invoices/:id/void')
  async voidInvoice(@CtxOf() ctx: Ctx, @Param('id') id: string) {
    this.tenancy.requirePerm(ctx, 'commerce.write');
    this.tenancy.requireSensitivePermission(ctx, 'finance', 'write');
    return this.st.tx((db) => {
      const invoice = db.tget('invoices', ctx.tenantId, id);
      if (!invoice) throw notFound('Invoice not found');
      this.tenancy.requireRecordAccess(ctx, 'commerce', invoice, 'write');
      if (invoice.status !== 'draft') throw conflict('INVALID_STATE', 'Only drafts can be voided (issued invoices are corrected, never mutated)');
      return { invoice: db.update('invoices', id, { status: 'void' }) };
    });
  }

  // ---------- payment links ----------
  @Post('payment-links')
  async createLink(@CtxOf() ctx: Ctx, @Body(new ZodPipe(z.object({
    invoice_id: z.string().uuid(),
    gateway: z.literal('sandbox'),   // real gateways (Stripe/regional) at cutover
  }))) body: { invoice_id: string; gateway: 'sandbox' }) {
    this.tenancy.requirePerm(ctx, 'commerce.write');
    this.tenancy.requireSensitivePermission(ctx, 'finance', 'write');
    return this.st.tx((db) => {
      const invoice = db.tget('invoices', ctx.tenantId, body.invoice_id);
      if (!invoice) throw notFound('Invoice not found');
      this.tenancy.requireRecordAccess(ctx, 'commerce', invoice, 'write');
      if (invoice.status !== 'issued') throw conflict('INVALID_STATE', 'Only issued invoices can take payment links');
      const secret = `gwsec_${randomUUID().replace(/-/g, '')}`;
      const link = db.insert('payment_links', {
        tenant_id: ctx.tenantId, invoice_id: body.invoice_id, gateway: 'sandbox',
        amount: invoice.total, currency: invoice.currency, status: 'active',
        url: `/pay/${invoice.id}`, webhook_secret: secret,
      });
      this.tenancy.audit(db, ctx.tenantId, ctx, 'commerce.payment_link_created', 'payment_link', link.id, { invoice: invoice.number });
      return { status: 201 as const, link: { id: link.id, url: link.url, amount: link.amount }, webhook_secret: secret, note: 'TEST DOUBLE: gateway simulated; production uses Stripe/regional adapters behind this same webhook contract.' };
    });
  }
}

// Signed gateway webhook (public). Same contract a real gateway uses:
// HMAC on raw body, event dedupe, idempotent invoice transitions.
const gatewayEventBody = z.object({
  event_id: z.string().min(6).max(120),
  type: z.literal('payment.succeeded'),
  link_id: z.string().min(6),
  amount: z.string().regex(/^\d{1,15}(\.\d{1,3})?$/),
  currency: z.enum(['AED', 'SAR', 'QAR', 'KWD', 'BHD', 'OMR']),
});

// Separate namespace from /webhooks/:source to avoid the generic-ingest
// wildcard capturing this route (route order is module registration order).
@Controller('api/v1/payments/webhook')
export class GatewayWebhookController {
  constructor(
    @Inject(TenancyService) private tenancy: TenancyService,
    @Inject(STORE_TOKEN) private st: typeof store,
  ) {}

  @Public()
  @HttpCode(200)
  @Post()
  async ingest(@Req() req: any, @Body(new ZodPipe(gatewayEventBody)) body: z.infer<typeof gatewayEventBody>) {
    const raw = JSON.stringify(body);
    const signature = req.headers?.['x-signature'];
    if (typeof signature !== 'string' || signature.length !== 64) {
      throw forbidden('Invalid gateway signature', 'INVALID_SIGNATURE');
    }
    // Resolve the link across tenants by id, then verify ITS secret.
    const link = await this.st.tx((db) => db.get('payment_links', body.link_id));
    if (!link) throw notFound('Payment link not found');
    const expected = createHmac('sha256', link.webhook_secret as string).update(raw).digest('hex');
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw forbidden('Invalid gateway signature', 'INVALID_SIGNATURE');

    return this.st.tx((db) => {
      // Event-level dedupe (replays never double-credit).
      const dup = db.tone('gateway_events', link.tenant_id as string, (e) => e.gateway_event_id === body.event_id);
      if (dup) return { received: true, duplicate: true };
      const invoice = db.get('invoices', link.invoice_id as string);
      if (!invoice) throw notFound('Invoice vanished');
      // Remaining BEFORE crediting this event (the insert below updates the sum).
      const paidAmount = toMinor(body.amount, body.currency);
      const preRemaining = this.commerceInvoiceRemaining(db, link.tenant_id as string, invoice);
      const newRemaining = preRemaining - paidAmount;
      const status = newRemaining <= 0 ? 'paid' : 'partially_paid';
      db.insert('gateway_events', {
        tenant_id: link.tenant_id, gateway: 'sandbox', gateway_event_id: body.event_id,
        link_id: link.id, invoice_id: link.invoice_id, amount_minor: paidAmount,
        status: 'paid', raw: body,
      });
      db.update('invoices', invoice.id, { status });
      this.tenancy.meter(db, link.tenant_id as string, 'payments_received', 1);
      this.tenancy.audit(db, link.tenant_id as string, null, 'commerce.payment_received', 'invoice', invoice.id, { amount_minor: paidAmount, status });
      return { received: true, invoice_status: status, remaining: Math.max(0, newRemaining) };
    });
  }

  private commerceInvoiceRemaining(db: Db, tenantId: string, invoice: any): number {
    const paid = db.tfind('gateway_events', tenantId, (e) =>
      e.invoice_id === invoice.id && e.status === 'paid').reduce((a, e) => a + (e.amount_minor as number), 0);
    return (invoice.total as number) - paid;
  }
}

@Module({
  controllers: [CommerceController, GatewayWebhookController],
  providers: [TenancyService, CommerceService, { provide: STORE_TOKEN, useValue: store }],
})
export class CommerceModule {}
