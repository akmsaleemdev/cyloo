// Phase 4 — Marketing Hub (F) + Analytics Hub (M).
// Campaigns are consent-aware and suppression-checked PER RECIPIENT at send
// time, respect frequency caps, support A/B variants and templates, and write
// attribution touches. Analytics derive from recorded events only.
import { Body, Controller, Get, HttpCode, Inject, Injectable, Module, NotFoundException, Param, Post } from '@nestjs/common';
import { Db, PLANS, badRequest, conflict, notFound, unprocessable } from '@crm/shared';
import { z } from 'zod';
import { Ctx, CtxOf } from './common/auth.js';
import { TenancyService } from './common/tenancy.service.js';
import { ZodPipe } from './common/http.js';
import { store, STORE_TOKEN } from './common/store.js';

@Injectable()
export class MarketingService {
  constructor(@Inject(TenancyService) private tenancy: TenancyService) {}

  windowStart(window: string): number {
    const now = Date.now();
    if (window === 'day') return now - 86400_000;
    if (window === 'week') return now - 7 * 86400_000;
    return now - 30 * 86400_000; // month
  }

  // Send a campaign to its audience with per-recipient gates. Returns per-
  // recipient outcomes — nothing is silently dropped.
  async send(db: Db, tenantId: string, ctx: Ctx, campaignId: string) {
    const campaign = db.tget('campaigns', tenantId, campaignId);
    if (!campaign) throw notFound('Campaign not found');
    this.tenancy.requireRecordAccess(ctx, 'marketing', campaign, 'write');
    this.tenancy.requireSensitivePermission(ctx, 'customer', 'read');
    if (campaign.status === 'completed') throw conflict('ALREADY_SENT', 'Campaign already completed');
    if (!['draft', 'scheduled'].includes(campaign.status as string)) throw conflict('INVALID_STATE', `Campaign is ${campaign.status}`);

    const audience = campaign.audience_id ? db.tget('audiences', tenantId, campaign.audience_id as string) : null;
    if (!audience) throw unprocessable('NO_AUDIENCE', 'Campaign has no audience');
    this.tenancy.requireRecordAccess(ctx, 'marketing', audience, 'read');
    const contactIds = (audience.snapshot_contact_ids as string[]) ?? [];
    if (!contactIds.length) throw unprocessable('EMPTY_AUDIENCE', 'Audience snapshot is empty');

    const kind = campaign.channel_kind as string;
    const template = campaign.template_id ? db.tget('message_templates', tenantId, campaign.template_id as string) : null;

    // A/B: variants targeting this campaign (or this campaign IS a variant).
    const variants = db.tfind('campaigns', tenantId, (c) => c.ab_variant_of === campaignId && c.status !== 'completed');

    const metrics = { sent: 0, skipped_consent: 0, skipped_suppressed: 0, skipped_frequency_cap: 0 };
    const outcomes: Array<Record<string, unknown>> = [];
    let variantIndex = 0;

    for (const contactId of contactIds) {
      const contact = db.tget('contacts', tenantId, contactId);
      if (!contact) { outcomes.push({ contact_id: contactId, status: 'skipped_missing' }); continue; }
      this.tenancy.requireRecordAccess(ctx, 'crm', contact, 'read');

      // 1. consent (opt-in ledger) — required for email/sms/whatsapp
      if (['email', 'sms', 'whatsapp'].includes(kind)) {
        const consented = db.tone('consents', tenantId, (c) =>
          c.channel_kind === kind && c.state === 'opt_in' &&
          (c.contact_id === contactId || (contact.email && c.external_ref === contact.email)));
        if (!consented) { metrics.skipped_consent += 1; outcomes.push({ contact_id: contactId, status: 'skipped_no_consent' }); continue; }
      }

      // 2. suppression list — re-checked at send time, even after queueing
      const address = kind === 'email' ? contact.email : (contact.whatsapp_phone || contact.phone);
      if (address) {
        const suppressed = db.tone('suppressions', tenantId, (s) =>
          s.channel_kind === kind && (s.email === address || s.phone === address));
        if (suppressed) { metrics.skipped_suppressed += 1; outcomes.push({ contact_id: contactId, status: 'skipped_suppressed' }); continue; }
      }

      // 3. frequency cap
      const cap = db.tone('frequency_caps', tenantId, (f) => f.contact_id === contactId && f.channel_kind === kind);
      if (cap) {
        const since = new Date(this.windowStart(cap.window as string)).toISOString();
        const recent = db.tfind('campaign_sends', tenantId, (s) =>
          s.contact_id === contactId && s.channel_kind === kind && String(s.sent_at) >= since).length;
        if (recent >= (cap.max_messages as number)) {
          metrics.skipped_frequency_cap += 1;
          outcomes.push({ contact_id: contactId, status: 'skipped_frequency_cap' });
          continue;
        }
      }

      // 4. A/B assignment (alternate across recipients: parent + variants)
      let campaignUsed = campaign;
      if (variants.length) {
        const opts = [campaign, ...variants];
        campaignUsed = opts[variantIndex % opts.length];
        variantIndex += 1;
      }

      // 5. render + send (TEST DOUBLE: provider delivery at cutover)
      const body = template
        ? String(template.body).replace(/\{\{\s*first_name\s*\}\}/g, String(contact.first_name ?? 'there'))
        : String(campaignUsed.metrics_body ?? `Hello ${(contact.first_name ?? 'there')}, from ${campaign.name}`);
      const send = db.insert('campaign_sends', {
        tenant_id: tenantId, campaign_id: campaignUsed.id, contact_id: contactId,
        channel_kind: kind, body, status: 'sent', sent_at: new Date().toISOString(),
      });
      db.insert('attribution_touches', { tenant_id: tenantId, contact_id: contactId, channel: kind, campaign: campaignUsed.name, utm: { utm_campaign: String(campaign.name).toLowerCase().replace(/\s+/g, '-') } });
      this.tenancy.meter(db, tenantId, 'messages_sent', 1, { channel: kind, campaign: campaignUsed.id });
      outcomes.push({ contact_id: contactId, status: 'sent', campaign: campaignUsed.id, send_id: send.id });
      metrics.sent += 1;
    }

    db.update('campaigns', campaign.id, { status: 'completed', metrics });
    this.tenancy.audit(db, tenantId, ctx, 'marketing.campaign_sent', 'campaign', campaign.id, { ...metrics });
    return { status: 200 as const, metrics, outcomes };
  }
}

// ---------------- campaigns ----------------
const campaignBody = z.object({
  name: z.string().min(1).max(120),
  channel_kind: z.string().max(20),
  template_id: z.string().uuid().optional(),
  audience_id: z.string().uuid().optional(),
  scheduled_at: z.string().datetime().optional(),
});

@Controller('api/v1/marketing')
export class MarketingController {
  constructor(
    @Inject(TenancyService) private tenancy: TenancyService,
    @Inject(STORE_TOKEN) private st: typeof store,
    @Inject(MarketingService) private marketing: MarketingService,
  ) {}

  @Post('campaigns')
  async create(@CtxOf() ctx: Ctx, @Body(new ZodPipe(campaignBody)) body: z.infer<typeof campaignBody>) {
    this.tenancy.requirePerm(ctx, 'marketing.write');
    return this.st.tx((db) => {
      const audience = body.audience_id ? db.tget('audiences', ctx.tenantId, body.audience_id) : null;
      if (body.audience_id && !audience) throw badRequest('audience_id not found');
      if (audience) this.tenancy.requireRecordAccess(ctx, 'marketing', audience, 'read');
      if (body.template_id && !db.tget('message_templates', ctx.tenantId, body.template_id)) throw badRequest('template_id not found');
      const campaign = db.insert('campaigns', {
        tenant_id: ctx.tenantId, ...body, owner_id: ctx.membershipId,
        department_id: ctx.departmentId ?? null, team_id: ctx.teamIds?.[0] ?? null,
        status: body.scheduled_at ? 'scheduled' : 'draft', metrics: {},
      });
      return { status: 201 as const, campaign };
    });
  }

  @Post(':id/variants')
  async addVariant(@CtxOf() ctx: Ctx, @Param('id') id: string, @Body(new ZodPipe(z.object({ name: z.string().min(1).max(120), body_override: z.string().max(4000) }))) v: { name: string; body_override: string }) {
    this.tenancy.requirePerm(ctx, 'marketing.write');
    return this.st.tx((db) => {
      const parent = db.tget('campaigns', ctx.tenantId, id);
      if (!parent) throw notFound('Campaign not found');
      this.tenancy.requireRecordAccess(ctx, 'marketing', parent, 'write');
      const variant = db.insert('campaigns', {
        tenant_id: ctx.tenantId, name: v.name, channel_kind: parent.channel_kind,
        owner_id: ctx.membershipId, department_id: ctx.departmentId ?? null, team_id: ctx.teamIds?.[0] ?? null,
        status: 'draft', metrics: {}, ab_variant_of: id, audience_id: parent.audience_id,
        template_id: parent.template_id, metrics_body: v.body_override,
      });
      return { status: 201 as const, variant: { id: variant.id, name: variant.name } };
    });
  }

  @Post(':id/send')
  @HttpCode(200)
  async send(@CtxOf() ctx: Ctx, @Param('id') id: string) {
    this.tenancy.requirePerm(ctx, 'marketing.write');
    this.tenancy.requireSensitivePermission(ctx, 'customer', 'read');
    return this.st.tx(async (db) => await this.marketing.send(db, ctx.tenantId, ctx, id));
  }

  @Get('campaigns')
  async list(@CtxOf() ctx: Ctx) {
    this.tenancy.requirePerm(ctx, 'marketing.read');
    return this.st.tx((db) => ({
      campaigns: this.tenancy.filterByScope(ctx, 'marketing', db.tfind('campaigns', ctx.tenantId, () => true)),
    }));
  }

  // ---------- templates ----------
  @Post('templates')
  async createTemplate(@CtxOf() ctx: Ctx, @Body(new ZodPipe(z.object({
    channel_kind: z.string().max(20), name: z.string().min(1).max(80),
    body: z.string().min(1).max(4000), language: z.string().max(8).default('en'),
  }))) body: { channel_kind: string; name: string; body: string; language: string }) {
    this.tenancy.requirePerm(ctx, 'marketing.write');
    return this.st.tx((db) => ({ status: 201 as const, template: db.insert('message_templates', { tenant_id: ctx.tenantId, ...body, approval_status: 'local' }) }));
  }

  @Get('templates')
  async listTemplates(@CtxOf() ctx: Ctx) {
    this.tenancy.requirePerm(ctx, 'marketing.read');
    return this.st.tx((db) => ({ templates: db.tfind('message_templates', ctx.tenantId, () => true) }));
  }

  // ---------- audiences (segment snapshot) ----------
  @Post('audiences')
  async createAudience(@CtxOf() ctx: Ctx, @Body(new ZodPipe(z.object({ name: z.string().min(1).max(80), segment_id: z.string().uuid() }))) body: { name: string; segment_id: string }) {
    this.tenancy.requirePerm(ctx, 'marketing.write');
    this.tenancy.requireSensitivePermission(ctx, 'customer', 'read');
    return this.st.tx((db) => {
      const seg = db.tget('segments', ctx.tenantId, body.segment_id);
      if (!seg) throw badRequest('segment_id not found');
      const f = seg.filters as Record<string, string>;
      const members = this.tenancy.filterByScope(ctx, 'crm', db.tfind('contacts', ctx.tenantId, (c) =>
        !c.merged_into && (!f.stage || c.lifecycle_stage === f.stage) && (!f.company_id || c.company_id === f.company_id)));
      const audience = db.insert('audiences', {
        tenant_id: ctx.tenantId, name: body.name, segment_id: seg.id,
        owner_id: ctx.membershipId, department_id: ctx.departmentId ?? null, team_id: ctx.teamIds?.[0] ?? null,
        snapshot_contact_ids: members.map((m) => m.id),
      });
      return { status: 201 as const, audience: { id: audience.id, name: audience.name, count: members.length } };
    });
  }

  // ---------- frequency caps ----------
  @Post('frequency-caps')
  async setCap(@CtxOf() ctx: Ctx, @Body(new ZodPipe(z.object({
    contact_id: z.string().uuid(), channel_kind: z.string().max(20),
    window: z.enum(['day', 'week', 'month']), max_messages: z.number().int().min(1).max(100),
  }))) body: { contact_id: string; channel_kind: string; window: 'day' | 'week' | 'month'; max_messages: number }) {
    this.tenancy.requirePerm(ctx, 'marketing.write');
    this.tenancy.requireSensitivePermission(ctx, 'customer', 'read');
    return this.st.tx((db) => {
      const contact = db.tget('contacts', ctx.tenantId, body.contact_id);
      if (!contact) throw badRequest('contact_id not found in this workspace');
      this.tenancy.requireRecordAccess(ctx, 'crm', contact, 'read');
      const existing = db.tone('frequency_caps', ctx.tenantId, (f) => f.contact_id === body.contact_id && f.channel_kind === body.channel_kind && f.window === body.window);
      const row = existing
        ? db.update('frequency_caps', existing.id, { max_messages: body.max_messages })
        : db.insert('frequency_caps', { tenant_id: ctx.tenantId, ...body });
      return { status: 201 as const, cap: row };
    });
  }
}

// ---------------- analytics (M) ----------------
@Controller('api/v1/analytics')
export class AnalyticsController {
  constructor(
    @Inject(TenancyService) private tenancy: TenancyService,
    @Inject(STORE_TOKEN) private st: typeof store,
  ) {}

  // Funnel from recorded entities — never estimated.
  @Get('funnel')
  async funnel(@CtxOf() ctx: Ctx) {
    this.tenancy.requirePerm(ctx, 'analytics.read');
    return this.st.tx((db) => {
      const leads = this.tenancy.filterByScope(ctx, 'leads', db.tfind('leads', ctx.tenantId, () => true));
      const opps = this.tenancy.filterByScope(ctx, 'sales', db.tfind('opportunities', ctx.tenantId, () => true));
      return {
        leads_total: leads.length,
        mql: leads.filter((l) => ['mql', 'sql', 'converted'].includes(l.status as string)).length,
        sql: leads.filter((l) => ['sql', 'converted'].includes(l.status as string)).length,
        opportunities: opps.length,
        won: opps.filter((o) => o.status === 'won').length,
        won_amount_minor: opps.filter((o) => o.status === 'won').reduce((a, o) => a + (o.amount as number), 0),
      };
    });
  }

  @Get('sales-performance')
  async salesPerformance(@CtxOf() ctx: Ctx) {
    this.tenancy.requirePerm(ctx, 'analytics.read');
    this.tenancy.requireSensitivePermission(ctx, 'finance', 'read');
    return this.st.tx((db) => {
      const byOwner = new Map<string, { won: number; amount: number }>();
      for (const o of this.tenancy.filterByScope(ctx, 'sales', db.tfind('opportunities', ctx.tenantId, (x) => x.status === 'won'))) {
        const key = String(o.owner_id ?? 'unassigned');
        const cur = byOwner.get(key) ?? { won: 0, amount: 0 };
        cur.won += 1; cur.amount += o.amount as number;
        byOwner.set(key, cur);
      }
      return { performance: [...byOwner.entries()].map(([owner_id, v]) => ({ owner_id, ...v })) };
    });
  }

  @Get('campaigns')
  async campaignAnalytics(@CtxOf() ctx: Ctx) {
    this.tenancy.requirePerm(ctx, 'analytics.read');
    return this.st.tx((db) => ({
      campaigns: this.tenancy.filterByScope(ctx, 'marketing', db.tfind('campaigns', ctx.tenantId, () => true)).map((c) => ({
        id: c.id, name: c.name, status: c.status, metrics: c.metrics,
        sends: db.tfind('campaign_sends', ctx.tenantId, (s) => s.campaign_id === c.id).length,
      })),
    }));
  }

  @Get('response-times')
  async responseTimes(@CtxOf() ctx: Ctx) {
    this.tenancy.requirePerm(ctx, 'analytics.read');
    return this.st.tx((db) => {
      const convs = this.tenancy.filterByScope(ctx, 'inbox', db.tfind('conversations', ctx.tenantId, () => true));
      const times: number[] = [];
      for (const c of convs) {
        const msgs = db.tfind('messages', ctx.tenantId, (m) => m.conversation_id === c.id).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
        const firstIn = msgs.find((m) => m.direction === 'in');
        const firstOut = msgs.find((m) => m.direction === 'out' && firstIn && String(m.created_at) >= String(firstIn.created_at));
        if (firstIn && firstOut) {
          times.push((new Date(firstOut.created_at).getTime() - new Date(firstIn.created_at).getTime()) / 60000);
        }
      }
      const avg = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;
      return { conversations_measured: times.length, avg_first_response_minutes: avg === null ? null : Math.round(avg * 10) / 10 };
    });
  }
}

@Module({
  controllers: [MarketingController, AnalyticsController],
  providers: [TenancyService, MarketingService, { provide: STORE_TOKEN, useValue: store }],
})
export class MarketingModule {}
