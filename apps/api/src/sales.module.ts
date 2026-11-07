// Module C — Sales Hub: pipelines, stages, opportunities, weighted forecast,
// server-computed quotes with version snapshots + discount approval gate.
import { Body, Controller, Get, HttpCode, Injectable, Module, NotFoundException, Param, Patch, Post } from '@nestjs/common';
import { Db, StoreError, badRequest, conflict, moneyString, nextNumber, notFound, opportunityCreate, quoteCreate, stageMove, toMinor, uuidSchema } from '@crm/shared';
import { z } from 'zod';
import { Inject } from '@nestjs/common';
import { Ctx, CtxOf } from './common/auth.js';
import { TenancyService } from './common/tenancy.service.js';
import { ZodPipe } from './common/http.js';
import { store, STORE_TOKEN } from './common/store.js';
import { toMinor as toMin } from '@crm/shared';
import { emitDomainEvent } from './common/events.js';

const DISCOUNT_APPROVAL_THRESHOLD_PCT = 10;
const DEFAULT_VAT_PCT = 5;

@Injectable()
export class SalesService {
  constructor(@Inject(TenancyService) private tenancy: TenancyService) {}

  ensureDefaultPipeline(db: Db, tenantId: string) {
    return this.tenancy.ensureDefaultPipeline(db, tenantId);
  }

  // Server-computed money (ADR-0006): minor units, per-line tax snapshots,
  // quote-level discount allocated proportionally, deterministic rounding.
  computeQuoteTotals(lines: { description: string; qty: number; unit_price: string; tax_pct: number }[], discountPct: number, currency: 'AED' | 'SAR' | 'QAR' | 'KWD' | 'BHD' | 'OMR' | 'USD' | 'EUR' = 'AED') {
    const parsed = lines.map((l) => ({ ...l, unit_minor: toMin(l.unit_price, currency) }));
    const subtotal = parsed.reduce((a, l) => a + Math.round(l.qty * l.unit_minor), 0);
    const discount = Math.round((subtotal * discountPct) / 100);
    const net = subtotal - discount;
    let tax = 0;
    const lineOut = parsed.map((l) => {
      const gross = Math.round(l.qty * l.unit_minor);
      const share = subtotal > 0 ? gross / subtotal : 0;
      const dline = gross - Math.round(discount * share);
      const ltax = Math.round((dline * l.tax_pct) / 100);
      tax += ltax;
      return { ...l, gross_minor: gross, discounted_minor: dline, tax_minor: ltax, line_total_minor: dline + ltax };
    });
    return { lines: lineOut, subtotal, discount, net, tax, total: net + tax };
  }
}

@Controller('api/v1')
export class SalesController {
  constructor(
    @Inject(TenancyService) private tenancy: TenancyService,
    @Inject(SalesService) private sales: SalesService,
    @Inject(STORE_TOKEN) private st: typeof store,
  ) {}

  @Get('pipelines')
  async listPipelines(@CtxOf() ctx: Ctx) {
    this.tenancy.requirePerm(ctx, 'sales.read');
    return this.st.tx((db) => {
      this.sales.ensureDefaultPipeline(db, ctx.tenantId);
      const pipelines = db.tfind('pipelines', ctx.tenantId, () => true);
      return { pipelines: pipelines.map((p) => ({ ...p, stages: db.tfind('pipeline_stages', ctx.tenantId, (s) => s.pipeline_id === p.id).sort((a, b) => (a.position as number) - (b.position as number)) })) };
    });
  }

  @Post('pipelines')
  async createPipeline(@CtxOf() ctx: Ctx, @Body(new ZodPipe(z.object({ name: z.string().min(1).max(80), stages: z.array(z.string().min(1)).min(2).max(20) }))) body: { name: string; stages: string[] }) {
    this.tenancy.requirePerm(ctx, 'sales.write');
    return this.st.tx((db) => {
      const pipeline = db.insert('pipelines', { tenant_id: ctx.tenantId, name: body.name, is_default: false });
      body.stages.forEach((name, i) => db.insert('pipeline_stages', { tenant_id: ctx.tenantId, pipeline_id: pipeline.id, name, position: i, probability: i === body.stages.length - 1 ? 1 : 0.1 + i * 0.1, is_won: i === body.stages.length - 1, is_lost: false }));
      return { status: 201 as const, pipeline };
    });
  }

  @Post('opportunities')
  async createOpp(@CtxOf() ctx: Ctx, @Body(new ZodPipe(opportunityCreate)) body: z.infer<typeof opportunityCreate>) {
    this.tenancy.requirePerm(ctx, 'sales.write');
    this.tenancy.requireSensitivePermission(ctx, 'finance', 'write');
    return this.st.tx((db) => {
      this.sales.ensureDefaultPipeline(db, ctx.tenantId);
      const pipeline = db.tget('pipelines', ctx.tenantId, body.pipeline_id);
      if (!pipeline) throw badRequest('pipeline_id not found in this workspace');
      const stage = db.tone('pipeline_stages', ctx.tenantId, (s) => s.pipeline_id === body.pipeline_id);
      if (!stage) throw badRequest('Pipeline has no stages');
      if (body.contact_id) {
        const contact = db.tget('contacts', ctx.tenantId, body.contact_id);
        if (!contact) throw badRequest('contact_id not found in this workspace');
        this.tenancy.requireRecordAccess(ctx, 'crm', contact, 'read');
      }
      if (body.company_id) {
        const company = db.tget('companies', ctx.tenantId, body.company_id);
        if (!company) throw badRequest('company_id not found in this workspace');
        this.tenancy.requireRecordAccess(ctx, 'crm', company, 'read');
      }
      const amount = toMin(body.amount, body.currency);
      const opp = db.insert('opportunities', {
        tenant_id: ctx.tenantId, pipeline_id: body.pipeline_id, stage_id: stage.id,
        name: body.name, contact_id: body.contact_id, company_id: body.company_id,
        amount, currency: body.currency, expected_close_date: body.expected_close_date,
        status: 'open', owner_id: ctx.membershipId,
        department_id: ctx.departmentId ?? null, team_id: ctx.teamIds?.[0] ?? null,
      });
      this.tenancy.activity(db, ctx.tenantId, 'opportunity', opp.id, 'created', { name: body.name, amount }, ctx);
      return { status: 201 as const, opportunity: opp };
    });
  }

  @Get('opportunities/:id')
  async getOpp(@CtxOf() ctx: Ctx, @Param('id') id: string) {
    this.tenancy.requirePerm(ctx, 'sales.read');
    return this.st.tx((db) => {
      const opp = db.tget('opportunities', ctx.tenantId, id);
      if (!opp) throw notFound('Opportunity not found');
      this.tenancy.requireSensitivePermission(ctx, 'finance', 'read');
      this.tenancy.requireRecordAccess(ctx, 'sales', opp, 'read');
      return { opportunity: opp, timeline: this.tenancy.timeline(db, ctx.tenantId, 'opportunity', id) };
    });
  }

  @Patch('opportunities/:id/stage')
  async moveStage(@CtxOf() ctx: Ctx, @Param('id') id: string, @Body(new ZodPipe(stageMove)) body: z.infer<typeof stageMove>) {
    this.tenancy.requirePerm(ctx, 'sales.write');
    return this.st.tx((db) => {
      const opp = db.tget('opportunities', ctx.tenantId, id);
      if (!opp) throw notFound('Opportunity not found');
      this.tenancy.requireSensitivePermission(ctx, 'finance', 'write');
      this.tenancy.requireRecordAccess(ctx, 'sales', opp, 'write');
      const stage = db.tget('pipeline_stages', ctx.tenantId, body.stage_id);
      // Stage must belong to the SAME tenant AND same pipeline (cross-pipeline moves rejected).
      if (!stage || stage.pipeline_id !== opp.pipeline_id) {
        throw badRequest('stage_id does not belong to this opportunity pipeline', 'INVALID_STAGE');
      }
      const from = db.tget('pipeline_stages', ctx.tenantId, opp.stage_id as string);
      const updated = db.update('opportunities', id, {
        stage_id: body.stage_id,
        status: stage.is_won ? 'won' : stage.is_lost ? 'lost' : 'open',
      }, body.row_version);
      this.tenancy.activity(db, ctx.tenantId, 'opportunity', id, 'stage_change', { from: from?.name, to: stage.name }, ctx);
      if (stage.is_won) {
        this.tenancy.meter(db, ctx.tenantId, 'deals_won', 1);
        emitDomainEvent(ctx.tenantId, 'opportunity.won', { opportunity_id: id, amount: updated.amount, contact_id: updated.contact_id });
      }
      return { opportunity: updated };
    });
  }

  // Weighted forecast: Σ amount × stage.probability for open opportunities.
  @Get('forecast')
  async forecast(@CtxOf() ctx: Ctx) {
    this.tenancy.requirePerm(ctx, 'sales.read');
    this.tenancy.requireSensitivePermission(ctx, 'finance', 'read');
    return this.st.tx((db) => {
      const opps = this.tenancy.filterByScope(ctx, 'sales', db.tfind('opportunities', ctx.tenantId, (o) => o.status === 'open'));
      let weighted = 0;
      const byPipeline: Record<string, number> = {};
      for (const o of opps) {
        const stage = db.tget('pipeline_stages', ctx.tenantId, o.stage_id as string);
        const w = Math.round((o.amount as number) * (stage?.probability as number ?? 0));
        weighted += w;
        byPipeline[o.pipeline_id as string] = (byPipeline[o.pipeline_id as string] ?? 0) + w;
      }
      return { open_count: opps.length, weighted_amount_minor: weighted, by_pipeline: byPipeline, currency: 'AED' };
    });
  }

  // ---------- quotes ----------
  @Post('quotes')
  async createQuote(@CtxOf() ctx: Ctx, @Body(new ZodPipe(quoteCreate)) body: z.infer<typeof quoteCreate>) {
    this.tenancy.requirePerm(ctx, 'sales.write');
    this.tenancy.requireSensitivePermission(ctx, 'finance', 'write');
    return this.st.tx((db) => {
      if (body.opportunity_id) {
        const opportunity = db.tget('opportunities', ctx.tenantId, body.opportunity_id);
        if (!opportunity) throw badRequest('opportunity_id not found in this workspace');
        this.tenancy.requireRecordAccess(ctx, 'sales', opportunity, 'read');
      }
      const t = this.sales.computeQuoteTotals(body.lines, body.discount_pct, body.currency);
      const number = nextNumber(db, ctx.tenantId, 'quote', 'QUO');
      const needsApproval = body.discount_pct > DISCOUNT_APPROVAL_THRESHOLD_PCT;
      const quote = db.insert('quotes', {
        tenant_id: ctx.tenantId, number, opportunity_id: body.opportunity_id ?? null,
        owner_id: ctx.membershipId, department_id: ctx.departmentId ?? null, team_id: ctx.teamIds?.[0] ?? null,
        status: needsApproval ? 'pending_approval' : 'approved',
        currency: body.currency, discount_pct: body.discount_pct,
        subtotal: t.subtotal, tax_total: t.tax, total: t.total,
      });
      for (const l of t.lines) {
        db.insert('quote_lines', {
          tenant_id: ctx.tenantId, quote_id: quote.id, description: l.description,
          qty: l.qty, unit_price: l.unit_minor, tax_rate: l.tax_pct, line_total: l.line_total_minor,
        });
      }
      db.insert('quote_versions', { tenant_id: ctx.tenantId, quote_id: quote.id, version: 1, snapshot: { status: quote.status, total: t.total }, created_by: ctx.userId });
      if (needsApproval) {
        db.insert('approvals', {
          tenant_id: ctx.tenantId, policy: 'quote_discount',
          resource_type: 'quote', resource_id: quote.id,
          payload: { discount_pct: body.discount_pct, total: t.total, number },
          payload_hash: JSON.stringify({ n: number, d: body.discount_pct, t: t.total }),
          status: 'pending', requested_by: ctx.userId,
        });
      }
      this.tenancy.audit(db, ctx.tenantId, ctx, 'sales.quote_created', 'quote', quote.id, { number, total: t.total });
      return { status: 201 as const, quote, approval_required: needsApproval };
    });
  }

  @Get('quotes/:id')
  async getQuote(@CtxOf() ctx: Ctx, @Param('id') id: string) {
    this.tenancy.requirePerm(ctx, 'sales.read');
    return this.st.tx((db) => {
      const quote = db.tget('quotes', ctx.tenantId, id);
      if (!quote) throw notFound('Quote not found');
      this.tenancy.requireSensitivePermission(ctx, 'finance', 'read');
      this.tenancy.requireRecordAccess(ctx, 'sales', quote, 'read');
      if (quote.opportunity_id) {
        const opportunity = db.tget('opportunities', ctx.tenantId, quote.opportunity_id as string);
        if (!opportunity) throw notFound('Quote not found');
        this.tenancy.requireRecordAccess(ctx, 'sales', opportunity, 'read');
      }
      return { quote, lines: db.tfind('quote_lines', ctx.tenantId, (l) => l.quote_id === id), versions: db.tfind('quote_versions', ctx.tenantId, (v) => v.quote_id === id) };
    });
  }

  @HttpCode(200)
  @Post('approvals/:id/decide')
  async decideApproval(@CtxOf() ctx: Ctx, @Param('id') id: string, @Body(new ZodPipe(z.object({ decision: z.enum(['approve', 'reject']) }))) body: { decision: 'approve' | 'reject' }) {
    this.tenancy.requirePerm(ctx, 'sales.approve');
    return this.st.tx((db) => {
      const approval = db.tget('approvals', ctx.tenantId, id);
      if (!approval || approval.tenant_id !== ctx.tenantId) throw notFound('Approval not found');
      if (approval.resource_type === 'quote') this.tenancy.requireSensitivePermission(ctx, 'finance', 'write');
      if (approval.status !== 'pending') throw conflict('ALREADY_DECIDED', `Approval already ${approval.status}`);
      const quote = approval.resource_type === 'quote'
        ? db.tget('quotes', ctx.tenantId, approval.resource_id as string)
        : null;
      if (approval.resource_type === 'quote' && !quote) throw notFound('Approval not found');
      if (quote) this.tenancy.requireRecordAccess(ctx, 'sales', quote, 'write');
      if (quote?.opportunity_id) {
        const opportunity = db.tget('opportunities', ctx.tenantId, quote.opportunity_id as string);
        if (!opportunity) throw notFound('Approval not found');
        this.tenancy.requireRecordAccess(ctx, 'sales', opportunity, 'write');
      }
      db.update('approvals', id, { status: body.decision === 'approve' ? 'approved' : 'rejected', decided_by: ctx.userId, decided_at: new Date().toISOString() });
      if (quote && body.decision === 'approve' && quote.status === 'pending_approval') {
        db.update('quotes', quote.id, { status: 'approved' });
        db.insert('quote_versions', { tenant_id: ctx.tenantId, quote_id: quote.id, version: 2, snapshot: { status: 'approved', by: ctx.userId }, created_by: ctx.userId });
      }
      this.tenancy.audit(db, ctx.tenantId, ctx, `sales.approval_${body.decision}d`, 'approval', id, {});
      return { ok: true };
    });
  }
}

@Module({
  controllers: [SalesController],
  providers: [SalesService, TenancyService, { provide: STORE_TOKEN, useValue: store }],
})
export class SalesModule {}
