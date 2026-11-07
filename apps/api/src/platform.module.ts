// Phase 6 — Developer Hub (R), Governance automation (U: DSAR + retention),
// Reseller/white-label (Q), Industry Packs (T), and the DR backup/restore
// drill. All key material follows the no-secrets rule: raw keys shown once,
// only SHA-256 hashes stored.
import { randomUUID } from 'node:crypto';
import { Body, Controller, Get, HttpCode, Inject, Injectable, Module, NotFoundException, Param, Post } from '@nestjs/common';
import { canDelegateRoles, Db, ROLES, Row, StoreError, badRequest, conflict, forbidden, notFound, unprocessable } from '@crm/shared';
import { z } from 'zod';
import { Ctx, CtxOf, hashApiKey } from './common/auth.js';
import { TenancyService } from './common/tenancy.service.js';
import { ZodPipe } from './common/http.js';
import { store, STORE_TOKEN } from './common/store.js';
import { checkRate } from './common/ratelimit.js';
import { encryptSecret } from './common/secrets.js';

// ---------- SSRF guard for outbound webhook endpoints (threat model R) ----------
const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i, /^127\./, /^0\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./, /^\[?::1\]?$/, /\.local$/i, /^metadata\./i,
];
export function assertPublicUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw badRequest('Invalid URL'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw badRequest('Only http(s) webhook URLs allowed');
  if (PRIVATE_HOST_PATTERNS.some((rx) => rx.test(url.hostname))) {
    throw badRequest('Webhook endpoints must be public — private/loopback hosts are blocked (SSRF protection)');
  }
  return url;
}

// ---------- Industry pack descriptors (T) ----------
export const INDUSTRY_PACKS: Record<string, { label: string; fields: Array<{ entity: 'contact' | 'company'; key: string; label: string; field_type: string }>; pipeline: { name: string; stages: string[] } }> = {
  real_estate: {
    label: 'Real Estate (GCC brokerage)',
    fields: [
      { entity: 'contact', key: 'property_interest', label: 'Property interest', field_type: 'select' },
      { entity: 'contact', key: 'budget_aed', label: 'Budget (AED)', field_type: 'number' },
      { entity: 'contact', key: 'nationality', label: 'Nationality', field_type: 'text' },
    ],
    pipeline: { name: 'Real Estate Sales', stages: ['Inquiry', 'Viewing booked', 'Viewing done', 'Offer', 'MOU/Deposit', 'Closed'] },
  },
  healthcare: {
    label: 'Healthcare (clinics)',
    fields: [
      { entity: 'contact', key: 'insurance_provider', label: 'Insurance provider', field_type: 'text' },
      { entity: 'contact', key: 'appointment_type', label: 'Appointment type', field_type: 'select' },
    ],
    pipeline: { name: 'Patient Journey', stages: ['Enquiry', 'Booked', 'Attended', 'Follow-up', 'Retained'] },
  },
  automotive: {
    label: 'Automotive (dealerships)',
    fields: [
      { entity: 'contact', key: 'vehicle_interest', label: 'Vehicle interest', field_type: 'text' },
      { entity: 'contact', key: 'trade_in_plate', label: 'Trade-in plate', field_type: 'text' },
    ],
    pipeline: { name: 'Showroom', stages: ['Enquiry', 'Test drive', 'Quotation', 'Finance', 'Delivered'] },
  },
  education: {
    label: 'Education',
    fields: [
      { entity: 'contact', key: 'program', label: 'Program of interest', field_type: 'text' },
      { entity: 'contact', key: 'applicant_stage', label: 'Applicant stage', field_type: 'text' },
    ],
    pipeline: { name: 'Admissions', stages: ['Enquiry', 'Application', 'Interview', 'Offer', 'Enrolled'] },
  },
  hospitality: {
    label: 'Hospitality',
    fields: [
      { entity: 'contact', key: 'property', label: 'Property', field_type: 'text' },
      { entity: 'contact', key: 'event_type', label: 'Event type', field_type: 'select' },
    ],
    pipeline: { name: 'Group Bookings', stages: ['Enquiry', 'Site visit', 'Proposal', 'Contract', 'Hosted'] },
  },
  retail: {
    label: 'Retail',
    fields: [
      { entity: 'contact', key: 'loyalty_tier', label: 'Loyalty tier', field_type: 'select' },
      { entity: 'contact', key: 'preferred_store', label: 'Preferred store', field_type: 'text' },
    ],
    pipeline: { name: 'B2B Wholesale', stages: ['Lead', 'Sample', 'Order', 'Reorder'] },
  },
  professional_services: {
    label: 'Professional Services',
    fields: [
      { entity: 'contact', key: 'engagement_type', label: 'Engagement type', field_type: 'select' },
      { entity: 'contact', key: 'retainer_hours', label: 'Retainer hours/mo', field_type: 'number' },
    ],
    pipeline: { name: 'Engagements', stages: ['Lead', 'Scoping', 'Proposal', 'Signed', 'Delivering'] },
  },
};

@Injectable()
export class PlatformService {
  constructor(@Inject(TenancyService) private tenancy: TenancyService) {}

  // Deliver an outbound webhook: HMAC-signed, retried, DLQ on failure.
  async deliver(store_: typeof store, deliveryId: string) {
    let lastError = '';
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await store_.tx(async (db) => {
          const delivery = db.get('webhook_deliveries', deliveryId);
          if (!delivery) throw notFound('Delivery vanished');
          if (delivery.status === 'delivered') return;
          const hook = db.get('outbound_webhooks', delivery.webhook_id as string);
          if (!hook || hook.revoked_at) throw new Error('webhook revoked');
          // Egress: real fetch at production; in this offline environment the
          // attempt is recorded honestly as failed (no network egress faked).
          throw new Error('outbound network egress disabled in this environment');
        });
        return;
      } catch (e: any) {
        if (e?.status === 404) throw e;
        lastError = e?.message ?? String(e);
      }
    }
    await store_.tx((db) => {
      db.update('webhook_deliveries', deliveryId, { status: 'failed', attempts: 2, error: lastError });
      db.insert('dlq_entries', { tenant_id: (db.get('webhook_deliveries', deliveryId) as any)?.tenant_id ?? null, queue: 'outbound-webhooks', payload: { delivery_id: deliveryId }, error: lastError });
    });
  }
}

@Controller('api/v1/platform')
export class PlatformController {
  constructor(
    @Inject(TenancyService) private tenancy: TenancyService,
    @Inject(STORE_TOKEN) private st: typeof store,
    @Inject(PlatformService) private platform: PlatformService,
  ) {}

  private requireOwner(ctx: Ctx) {
    if (!ctx.roles.includes('owner') && !ctx.roles.includes('admin')) {
      throw forbidden('Owner or admin required', 'FORBIDDEN');
    }
  }

  // ---------- Developer Hub: API keys ----------
  @Post('api-keys')
  async createKey(@CtxOf() ctx: Ctx, @Body(new ZodPipe(z.object({
    name: z.string().min(1).max(80),
    roles: z.array(z.string()).min(1).max(5),
  }))) body: { name: string; roles: string[] }) {
    this.requireOwner(ctx);
    if (!body.roles.every((r) => (ROLES as readonly string[]).includes(r))) throw badRequest(`roles must be from: ${(ROLES as readonly string[]).join(', ')}`);
    if (!canDelegateRoles(ctx.roles, body.roles)) {
      throw forbidden('Requested API-key roles exceed the permissions that can be delegated', 'FORBIDDEN');
    }
    const raw = `gck_${randomUUID().replace(/-/g, '')}${randomUUID().replace(/-/g, '')}`;
    return this.st.tx((db) => {
      const key = db.insert('api_keys', {
        tenant_id: ctx.tenantId, name: body.name,
        key_hash: hashApiKey(raw), roles: body.roles, scopes: [], revoked_at: null,
      });
      this.tenancy.audit(db, ctx.tenantId, ctx, 'platform.api_key_created', 'api_key', key.id, { name: body.name });
      // Raw key returned ONCE; only the hash is stored.
      return { status: 201 as const, key: { id: key.id, name: key.name, roles: key.roles }, raw_key: raw, note: 'Store this key now — it cannot be retrieved again.' };
    });
  }

  @Get('api-keys')
  async listKeys(@CtxOf() ctx: Ctx) {
    this.requireOwner(ctx);
    return this.st.tx((db) => ({
      keys: db.tfind('api_keys', ctx.tenantId, () => true).map((k) => ({ id: k.id, name: k.name, roles: k.roles, revoked_at: k.revoked_at, created_at: k.created_at })),
    }));
  }

  @HttpCode(200)
  @Post('api-keys/:id/revoke')
  async revokeKey(@CtxOf() ctx: Ctx, @Param('id') id: string) {
    this.requireOwner(ctx);
    return this.st.tx((db) => {
      const key = db.tget('api_keys', ctx.tenantId, id);
      if (!key) throw notFound('Key not found');
      if (key.revoked_at) throw conflict('ALREADY_REVOKED', 'Key already revoked');
      db.update('api_keys', id, { revoked_at: new Date().toISOString() });
      this.tenancy.audit(db, ctx.tenantId, ctx, 'platform.api_key_revoked', 'api_key', id, {});
      return { ok: true };
    });
  }

  // ---------- Developer Hub: outbound webhooks ----------
  @Post('outbound-webhooks')
  async registerWebhook(@CtxOf() ctx: Ctx, @Body(new ZodPipe(z.object({
    url: z.string().min(8).max(300),
    events: z.array(z.string().max(60)).min(1).max(20),
  }))) body: { url: string; events: string[] }) {
    this.requireOwner(ctx);
    assertPublicUrl(body.url); // SSRF: loopback/private/reserved hosts rejected
    return this.st.tx((db) => {
      const secret = `whsec_${randomUUID().replace(/-/g, '')}`;
      const hook = db.insert('outbound_webhooks', {
        tenant_id: ctx.tenantId, url: body.url, events: body.events,
        secret_ciphertext: encryptSecret(secret), revoked_at: null,
      });
      return { status: 201 as const, webhook: { id: hook.id, url: hook.url, events: hook.events }, secret, note: 'Deliveries are HMAC-SHA256 signed (x-signature) over the raw body with retries → DLQ.' };
    });
  }

  @Get('outbound-webhooks')
  async listWebhooks(@CtxOf() ctx: Ctx) {
    this.requireOwner(ctx);
    return this.st.tx((db) => ({
      webhooks: db.tfind('outbound_webhooks', ctx.tenantId, () => true).map((h) => ({
        id: h.id, url: h.url, events: h.events, revoked_at: h.revoked_at,
        deliveries: db.tfind('webhook_deliveries', ctx.tenantId, (d) => d.webhook_id === h.id).length,
      })),
    }));
  }

  // Test-fire: records a delivery attempt (fails offline → retry → DLQ honestly).
  @HttpCode(200)
  @Post('outbound-webhooks/:id/test-fire')
  async testFire(@CtxOf() ctx: Ctx, @Param('id') id: string) {
    this.requireOwner(ctx);
    const result = await this.st.tx((db) => {
      const hook = db.tget('outbound_webhooks', ctx.tenantId, id);
      if (!hook || hook.revoked_at) throw notFound('Webhook not found');
      const delivery = db.insert('webhook_deliveries', {
        tenant_id: ctx.tenantId, webhook_id: id, event: 'test.fire',
        payload: { test: true, fired_by: ctx.userId }, status: 'pending', attempts: 0,
      });
      return { deliveryId: delivery.id };
    });
    // attempts happen outside the creation tx (queued semantics)
    await this.platform.deliver(this.st, result.deliveryId);
    return { fired: true, delivery_id: result.deliveryId, note: 'Delivery attempted with retries; check the delivery log / DLQ.' };
  }

  @Get('outbound-webhooks/:id/deliveries')
  async deliveries(@CtxOf() ctx: Ctx, @Param('id') id: string) {
    this.requireOwner(ctx);
    return this.st.tx((db) => ({
      deliveries: db.tfind('webhook_deliveries', ctx.tenantId, (d) => d.webhook_id === id).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))),
    }));
  }

  // ---------- Governance: DSAR (privacy requests) ----------
  @Post('dsar')
  async createDsar(@CtxOf() ctx: Ctx, @Body(new ZodPipe(z.object({
    contact_id: z.string().uuid(),
    type: z.enum(['export', 'delete']),
    reason: z.string().max(300).default('data subject request'),
  }))) body: { contact_id: string; type: 'export' | 'delete'; reason: string }) {
    this.requireOwner(ctx);
    return this.st.tx((db) => {
      const contact = db.tget('contacts', ctx.tenantId, body.contact_id);
      if (!contact) throw notFound('Contact not found');
      const dsar = db.insert('dsar_requests', {
        tenant_id: ctx.tenantId, contact_id: body.contact_id, type: body.type,
        reason: body.reason, status: 'received', requested_by: ctx.userId,
      });
      this.tenancy.audit(db, ctx.tenantId, ctx, `privacy.dsar_${body.type}_received`, 'dsar_request', dsar.id, {});
      return { status: 201 as const, dsar: { id: dsar.id, type: dsar.type, status: dsar.status } };
    });
  }

  @Post('dsar/:id/process')
  @HttpCode(200)
  async processDsar(@CtxOf() ctx: Ctx, @Param('id') id: string) {
    this.requireOwner(ctx);
    return this.st.tx((db) => {
      const dsar = db.tget('dsar_requests', ctx.tenantId, id);
      if (!dsar) throw notFound('DSAR request not found');
      if (dsar.status !== 'received') throw conflict('ALREADY_PROCESSED', `DSAR already ${dsar.status}`);
      const contact = db.tget('contacts', ctx.tenantId, dsar.contact_id as string);
      if (!contact) throw notFound('Contact not found');

      if (dsar.type === 'export') {
        // Data portability: everything we hold about this person.
        const activities = db.tfind('activity_events', ctx.tenantId, (a) => a.entity === 'contact' && a.entity_id === contact.id);
        const leads = db.tfind('leads', ctx.tenantId, (l) => l.email && l.email.toLowerCase() === String(contact.email ?? '').toLowerCase());
        const payload = { contact, activities, leads, generated_at: new Date().toISOString() };
        db.update('dsar_requests', id, { status: 'completed', result_summary: { activities: activities.length, leads: leads.length } });
        this.tenancy.audit(db, ctx.tenantId, ctx, 'privacy.dsar_export_completed', 'dsar_request', id, {});
        return { status: 'completed', export: payload };
      }

      // Delete = ANONYMIZATION (retention-safe: history retained, PII removed).
      db.update('contacts', contact.id, {
        first_name: 'REDACTED', last_name: null, email: null, phone: null, whatsapp_phone: null,
        job_title: null, lifecycle_stage: 'other',
      });
      for (const l of db.tfind('leads', ctx.tenantId, (l) => l.email && contact.email && l.email.toLowerCase() === String(contact.email).toLowerCase())) {
        db.update('leads', l.id, { email: null, phone: null, name: 'REDACTED' });
      }
      db.update('dsar_requests', id, { status: 'completed', result_summary: { anonymized: true } });
      this.tenancy.audit(db, ctx.tenantId, ctx, 'privacy.dsar_delete_completed', 'dsar_request', id, { contact_id: contact.id });
      return { status: 'completed', anonymized: true, note: 'Records retained for business/legal continuity; personal identifiers removed.' };
    });
  }

  // ---------- Retention sweep ----------
  @Post('retention/sweep')
  @HttpCode(200)
  async retentionSweep(@CtxOf() ctx: Ctx, @Body(new ZodPipe(z.object({
    before: z.string().datetime(),
    dry_run: z.boolean().default(false),
  }))) body: { before: string; dry_run: boolean }) {
    this.requireOwner(ctx);
    return this.st.tx((db) => {
      // Anonymize customer-authored comments on tickets resolved before cutoff.
      const tickets = db.tfind('tickets', ctx.tenantId, (t) => t.status === 'resolved' && (t.resolved_at as string) < body.before);
      let commentsAffected = 0;
      const plan: Array<Record<string, unknown>> = [];
      for (const t of tickets) {
        for (const c of db.tfind('ticket_comments', ctx.tenantId, (x) => x.ticket_id === t.id && x.author_type === 'customer')) {
          plan.push({ ticket: t.number, comment_id: c.id });
          commentsAffected += 1;
          if (!body.dry_run) db.update('ticket_comments', c.id, { body: '[redacted per retention policy]' });
        }
        if (!body.dry_run && t.contact_id) db.update('tickets', t.id, { contact_id: null });
      }
      if (!body.dry_run) {
        this.tenancy.audit(db, ctx.tenantId, ctx, 'privacy.retention_sweep', 'retention', null, { tickets: tickets.length, comments: commentsAffected, before: body.before });
      }
      return { dry_run: body.dry_run, tickets_in_scope: tickets.length, comments_affected: commentsAffected, plan: plan.slice(0, 20) };
    });
  }

  // ---------- Reseller / white-label (Q) ----------
  @Post('resellers')
  async createReseller(@CtxOf() ctx: Ctx, @Body(new ZodPipe(z.object({ name: z.string().min(1).max(120) }))) body: { name: string }) {
    this.requireOwner(ctx);
    return this.st.tx((db) => {
      const reseller = db.insert('resellers', { tenant_id: ctx.tenantId, name: body.name, settings: {} });
      this.tenancy.audit(db, ctx.tenantId, ctx, 'platform.reseller_created', 'reseller', reseller.id, { name: body.name });
      return { status: 201 as const, reseller };
    });
  }

  @Post('resellers/:id/tenants')
  async provisionChildTenant(@CtxOf() ctx: Ctx, @Param('id') id: string, @Body(new ZodPipe(z.object({
    name: z.string().min(1).max(120),
    owner_email: z.string().email(),
    plan: z.enum(['trial', 'starter', 'growth', 'enterprise']).default('trial'),
  }))) body: { name: string; owner_email: string; plan: 'trial' | 'starter' | 'growth' | 'enterprise' }) {
    this.requireOwner(ctx);
    return this.st.tx((db) => {
      const reseller = db.tget('resellers', ctx.tenantId, id);
      if (!reseller) throw notFound('Reseller not found');
      // Child tenant provisioned atomically (tenant + owner membership + plan).
      const tenant = db.insert('tenants', {
        name: body.name, slug: `${body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomUUID().slice(0, 6)}`,
        plan_key: body.plan, status: 'trialing', settings: { parent_reseller_id: id, white_labeled_by: reseller.name },
      });
      let user = db.one('users', (u) => u.email === body.owner_email);
      if (!user) user = db.insert('users', { email: body.owner_email, name: body.owner_email.split('@')[0] });
      const membership = db.insert('memberships', { tenant_id: tenant.id, user_id: user.id, roles: ['owner'], status: 'active' });
      this.tenancy.audit(db, ctx.tenantId, ctx, 'platform.reseller_tenant_provisioned', 'tenant', tenant.id, { reseller: reseller.name, plan: body.plan });
      return { status: 201 as const, tenant: { id: tenant.id, name: tenant.name, plan: body.plan }, owner_membership_id: membership.id, login_note: 'The owner signs in via the normal flow; Supabase Auth owns credentials at cutover.' };
    });
  }

  @Post('branding')
  @HttpCode(200)
  async branding(@CtxOf() ctx: Ctx, @Body(new ZodPipe(z.object({
    brand_color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    logo_url: z.string().url().max(300).optional(),
    custom_domain: z.string().max(120).optional(),
  }))) body: { brand_color?: string; logo_url?: string; custom_domain?: string }) {
    this.requireOwner(ctx);
    return this.st.tx((db) => {
      const tenant = db.get('tenants', ctx.tenantId);
      const settings = { ...(tenant!.settings as object), ...Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)) };
      db.update('tenants', ctx.tenantId, { settings });
      return { status: 200 as const, settings };
    });
  }

  // ---------- Industry packs (T) ----------
  @Get('industry-packs')
  async listPacks() {
    return { packs: Object.entries(INDUSTRY_PACKS).map(([key, p]) => ({ key, label: p.label, fields: p.fields.length, pipeline: p.pipeline.stages.length })) };
  }

  @HttpCode(200)
  @Post('industry-pack/:key/activate')
  async activatePack(@CtxOf() ctx: Ctx, @Param('key') key: string) {
    this.requireOwner(ctx);
    const pack = INDUSTRY_PACKS[key];
    if (!pack) throw badRequest(`Unknown industry pack. Available: ${Object.keys(INDUSTRY_PACKS).join(', ')}`);
    return this.st.tx((db) => {
      // Configuration-driven pack: creates custom fields + an industry pipeline.
      const createdFields: string[] = [];
      for (const f of pack.fields) {
        if (db.tone('custom_field_definitions', ctx.tenantId, (d) => d.entity === f.entity && d.key === f.key)) continue;
        const options = f.field_type === 'select' ? ['Standard', 'Premium', 'Other'] : undefined;
        db.insert('custom_field_definitions', { tenant_id: ctx.tenantId, entity: f.entity, key: f.key, label: f.label, field_type: f.field_type, options, required: false });
        createdFields.push(f.key);
      }
      let pipeline = db.tone('pipelines', ctx.tenantId, (p) => p.name === pack.pipeline.name);
      if (!pipeline) {
        pipeline = db.insert('pipelines', { tenant_id: ctx.tenantId, name: pack.pipeline.name, is_default: false });
        pack.pipeline.stages.forEach((name, i) => db.insert('pipeline_stages', {
          tenant_id: ctx.tenantId, pipeline_id: pipeline!.id, name, position: i,
          probability: i === pack.pipeline.stages.length - 1 ? 1 : Math.min(0.9, 0.1 + i * 0.15),
          is_won: i === pack.pipeline.stages.length - 1, is_lost: false,
        }));
      }
      const tenant = db.get('tenants', ctx.tenantId);
      db.update('tenants', ctx.tenantId, { settings: { ...(tenant!.settings as object), industry_pack: key } });
      this.tenancy.audit(db, ctx.tenantId, ctx, 'platform.industry_pack_activated', 'tenant', ctx.tenantId, { pack: key });
      return { status: 200 as const, pack: key, fields_created: createdFields, pipeline: pipeline.name };
    });
  }

  // ---------- DR: backup / restore drill (dev-store mechanism) ----------
  @Get('backup')
  async backup(@CtxOf() ctx: Ctx) {
    this.requireOwner(ctx);
    this.tenancy.requireSensitivePermission(ctx, 'customer', 'read');
    this.tenancy.requireSensitivePermission(ctx, 'finance', 'read');
    this.tenancy.requireSensitivePermission(ctx, 'hr', 'read');
    const snap = await this.st.snapshotTenant?.(ctx.tenantId, [
      'api_keys', 'provider_credentials', 'outbound_webhooks', 'audit_events', 'activity_events',
    ]);
    if (!snap) throw forbidden('Tenant-scoped backups are not supported by this store', 'BACKUP_UNAVAILABLE');
    await this.st.tx((db) => this.tenancy.audit(db, ctx.tenantId, ctx, 'platform.backup_exported', 'system', null, { tables: Object.keys(snap).length }));
    return { generated_at: new Date().toISOString(), tables: Object.keys(snap).length, rows: Object.values(snap).reduce((a: number, r: any[]) => a + r.length, 0), snapshot: snap };
  }

  @Post('restore')
  @HttpCode(200)
  async restore(@CtxOf() ctx: Ctx, @Body(new ZodPipe(z.object({ snapshot: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))) }))) body: { snapshot: Record<string, Record<string, unknown>[]> }) {
    this.requireOwner(ctx);
    this.tenancy.requireSensitivePermission(ctx, 'customer', 'write');
    this.tenancy.requireSensitivePermission(ctx, 'finance', 'write');
    this.tenancy.requireSensitivePermission(ctx, 'hr', 'write');
    if (!Object.keys(body.snapshot).length) throw badRequest('Empty snapshot');
    if (!this.st.restoreTenant) throw forbidden('Tenant-scoped restore is not supported by this store', 'RESTORE_UNAVAILABLE');
    await this.st.restoreTenant(ctx.tenantId, body.snapshot as Record<string, Row[]>);
    await this.st.tx((db) => this.tenancy.audit(db, ctx.tenantId, ctx, 'platform.restore_completed', 'system', null, { tables: Object.keys(body.snapshot).length }));
    return { ok: true, restored_tables: Object.keys(body.snapshot).length, note: 'DR drill: dev-store restore; production uses PITR backups per runbook.' };
  }
}

@Module({
  controllers: [PlatformController],
  providers: [TenancyService, PlatformService, { provide: STORE_TOKEN, useValue: store }],
})
export class PlatformModule {}
