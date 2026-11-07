// Module B — Lead Hub: capture with attribution, dedupe, scoring,
// round-robin routing, SLA due, idempotent conversion.
import { Body, Controller, Get, Injectable, Module, Param, Post } from '@nestjs/common';
import { Db, StoreError, badRequest, conflict, leadCreate, notFound, uuidSchema } from '@crm/shared';
import { z } from 'zod';
import { Inject } from '@nestjs/common';
import { Ctx, CtxOf } from './common/auth.js';
import { TenancyService } from './common/tenancy.service.js';
import { ZodPipe } from './common/http.js';
import { store, STORE_TOKEN } from './common/store.js';
import { emitDomainEvent } from './common/events.js';

const scoreBody = z.object({ lead_id: uuidSchema, event_key: z.string().min(1).max(60) });

@Injectable()
export class LeadsService {
  constructor(@Inject(TenancyService) private tenancy: TenancyService) {}

  applyScore(db: Db, tenantId: string, leadId: string, eventKey: string): number {
    const rule = db.tone('scoring_rules', tenantId, (r) => r.event_key === eventKey && r.active);
    if (!rule) throw badRequest(`No scoring rule for event "${eventKey}"`, 'NO_SCORING_RULE');
    const lead = db.tget('leads', tenantId, leadId);
    if (!lead) throw notFound('Lead not found');
    const updated = db.update('leads', lead.id, { score: (lead.score as number) + (rule.points as number) });
    return updated.score as number;
  }

  // Round-robin across active members in routing rule config.
  route(db: Db, tenantId: string): string | null {
    const rule = db.tone('routing_rules', tenantId, (r) => r.kind === 'round_robin' && r.active);
    if (!rule) return null;
    const ids = (rule.config as { member_ids?: string[] }).member_ids ?? [];
    if (!ids.length) return null;
    const idx = (rule.config as any).next_index ?? 0;
    db.update('routing_rules', rule.id, { config: { ...rule.config as object, next_index: (idx + 1) % ids.length } });
    return ids[idx % ids.length] ?? null;
  }
}

@Controller('api/v1/leads')
export class LeadsController {
  constructor(
    @Inject(TenancyService) private tenancy: TenancyService,
    @Inject(LeadsService) private leads: LeadsService,
    @Inject(STORE_TOKEN) private st: typeof store,
  ) {}

  @Post()
  async create(@CtxOf() ctx: Ctx, @Body(new ZodPipe(leadCreate)) body: z.infer<typeof leadCreate>) {
    this.tenancy.requirePerm(ctx, 'leads.write');
    this.tenancy.requireSensitivePermission(ctx, 'customer', 'write');
    return this.st.tx((db) => {
      if (body.email) {
        const dup = db.tone('leads', ctx.tenantId, (l) => l.email?.toLowerCase() === body.email!.toLowerCase());
        if (dup) throw conflict('DUPLICATE_LEAD', `Lead with email ${body.email} exists`, { existing_id: dup.id });
      }
      let sourceId: string | null = null;
      if (body.source_key) {
        let src = db.tone('lead_sources', ctx.tenantId, (s) => s.key === body.source_key);
        if (!src) src = db.insert('lead_sources', { tenant_id: ctx.tenantId, key: body.source_key, name: body.source_key });
        sourceId = src.id;
      }
      const owner = this.leads.route(db, ctx.tenantId) ?? ctx.membershipId;
      this.tenancy.requireAssignableMember(db, ctx, owner);
      const lead = db.insert('leads', {
        tenant_id: ctx.tenantId, ...body, source_id: sourceId,
        attribution: body.attribution ?? {},
        owner_id: owner, status: 'new', score: 0,
        department_id: ctx.departmentId ?? null, team_id: ctx.teamIds?.[0] ?? null,
        sla_due_at: new Date(Date.now() + 4 * 3600_000).toISOString(), // SLA: respond within 4h
      });
      this.tenancy.audit(db, ctx.tenantId, ctx, 'leads.created', 'lead', lead.id, { source: body.source_key });
      emitDomainEvent(ctx.tenantId, 'lead.created', { lead_id: lead.id, email: lead.email, score: lead.score });
      return { status: 201 as const, lead };
    });
  }

  @Get()
  async list(@CtxOf() ctx: Ctx, @Param() _p: Record<string, string>) {
    this.tenancy.requirePerm(ctx, 'leads.read');
    this.tenancy.requireSensitivePermission(ctx, 'customer', 'read');
    return this.st.tx((db) => ({
      leads: this.tenancy.filterByScope(ctx, 'leads', db.tfind('leads', ctx.tenantId, () => true))
        .sort((a, b) => (b.score as number) - (a.score as number)),
    }));
  }

  @Post('score')
  async score(@CtxOf() ctx: Ctx, @Body(new ZodPipe(scoreBody)) body: z.infer<typeof scoreBody>) {
    this.tenancy.requirePerm(ctx, 'leads.write');
    return this.st.tx((db) => {
      const lead = db.tget('leads', ctx.tenantId, body.lead_id);
      if (!lead) throw notFound('Lead not found');
      this.tenancy.requireSensitivePermission(ctx, 'customer', 'write');
      this.tenancy.requireRecordAccess(ctx, 'leads', lead, 'write');
      return { score: this.leads.applyScore(db, ctx.tenantId, body.lead_id, body.event_key) };
    });
  }

  @Post('scoring-rules')
  async addRule(@CtxOf() ctx: Ctx, @Body(new ZodPipe(z.object({ event_key: z.string().min(1), points: z.number().int().min(-100).max(100), name: z.string().min(1) }))) body: { event_key: string; points: number; name: string }) {
    this.tenancy.requirePerm(ctx, 'leads.write');
    return this.st.tx((db) => ({ rule: db.insert('scoring_rules', { tenant_id: ctx.tenantId, ...body, active: true }) }));
  }

  @Post('routing-rules')
  async addRouting(@CtxOf() ctx: Ctx, @Body(new ZodPipe(z.object({ member_ids: z.array(uuidSchema).min(1) }))) body: { member_ids: string[] }) {
    this.tenancy.requirePerm(ctx, 'leads.write');
    return this.st.tx((db) => ({ rule: db.insert('routing_rules', { tenant_id: ctx.tenantId, kind: 'round_robin', config: { member_ids: body.member_ids, next_index: 0 }, active: true, priority: 100 }) }));
  }

  // Idempotent conversion: lead → contact + opportunity (defaults pipeline).
  @Post(':id/convert')
  async convert(@CtxOf() ctx: Ctx, @Param('id') id: string) {
    this.tenancy.requirePerm(ctx, 'leads.write');
    return this.st.tx(async (db) => {
      const lead = db.tget('leads', ctx.tenantId, id);
      if (!lead) throw notFound('Lead not found');
      this.tenancy.requireSensitivePermission(ctx, 'customer', 'write');
      this.tenancy.requireRecordAccess(ctx, 'leads', lead, 'write');
      if (lead.converted_contact_id) {
        // Idempotent: same ids returned, no duplicates created.
        return { contact_id: lead.converted_contact_id, opportunity_id: lead.converted_opportunity_id, already_converted: true };
      }
      const contact = db.insert('contacts', {
        tenant_id: ctx.tenantId,
        first_name: lead.name, email: lead.email, phone: lead.phone,
        owner_id: lead.owner_id, department_id: lead.department_id, team_id: lead.team_id,
        lifecycle_stage: 'sql', source: lead.source_id ? 'lead' : 'manual',
      });
      const pipeline = this.tenancy.ensureDefaultPipeline(db, ctx.tenantId);
      const stage = db.tone('pipeline_stages', ctx.tenantId, (s) => s.pipeline_id === pipeline.id);
      const opp = db.insert('opportunities', {
        tenant_id: ctx.tenantId, pipeline_id: pipeline.id, stage_id: stage?.id ?? '',
        name: `${lead.name} — opportunity`, amount: 0, currency: 'AED',
        contact_id: contact.id, owner_id: lead.owner_id, source_lead_id: lead.id, status: 'open',
      });
      db.update('leads', lead.id, { status: 'converted', converted_contact_id: contact.id, converted_opportunity_id: opp.id });
      this.tenancy.activity(db, ctx.tenantId, 'contact', contact.id, 'converted_from_lead', { lead_id: lead.id }, ctx);
      this.tenancy.audit(db, ctx.tenantId, ctx, 'leads.converted', 'lead', lead.id, { contact_id: contact.id, opportunity_id: opp.id });
      return { contact_id: contact.id, opportunity_id: opp.id, already_converted: false };
    });
  }
}

@Module({
  controllers: [LeadsController],
  providers: [LeadsService, TenancyService, { provide: STORE_TOKEN, useValue: store }],
})
export class LeadsModule {}
