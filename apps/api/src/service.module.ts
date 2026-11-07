// Phase 5 — Service Hub (J): tickets, SLA on business calendars (sun_thu /
// mon_fri, GCC fixed offsets), breach escalation, CSAT/NPS, knowledge base,
// and a customer portal that sees ONLY explicitly granted resources.
import { randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { Body, Controller, Get, HttpCode, Inject, Injectable, Module, NotFoundException, Param, Post, Query, Req } from '@nestjs/common';
import { Db, badRequest, conflict, notFound, unprocessable } from '@crm/shared';
import { z } from 'zod';
import { Ctx, CtxOf, Public, signDevToken } from './common/auth.js';
import { TenancyService } from './common/tenancy.service.js';
import { ZodPipe } from './common/http.js';
import { store, STORE_TOKEN } from './common/store.js';
import { checkRate } from './common/ratelimit.js';

export const TZ_OFFSET_HOURS: Record<string, number> = {
  'Asia/Dubai': 4, 'Asia/Riyadh': 3, 'Asia/Qatar': 3, 'Asia/Kuwait': 3, 'Asia/Bahrain': 3, 'Asia/Muscat': 4,
};

// Working calendar: sun_thu (UAE/KSA default weekdays) or mon_fri.
const WEEK_PATTERNS: Record<string, number[]> = {
  sun_thu: [0, 1, 2, 3, 4],
  mon_fri: [1, 2, 3, 4, 5],
};

// Compute the SLA due date by walking the business calendar forward.
// Pure function — unit-testable. startISO/hours are evaluated in the given
// GCC timezone (fixed offsets, no DST).
export function slaDue(startISO: string, minutes: number, policy: { week_pattern: string; start_hour: number; end_hour: number }, timezone: string): string {
  const offset = (TZ_OFFSET_HOURS[timezone] ?? 4) * 3600_000;
  const workdays = WEEK_PATTERNS[policy.week_pattern] ?? WEEK_PATTERNS.sun_thu;
  let remaining = minutes * 60_000;
  // Start cursor at local midnight of the start day.
  let cursorLocal = new Date(new Date(startISO).getTime() + offset);
  cursorLocal = new Date(Date.UTC(cursorLocal.getUTCFullYear(), cursorLocal.getUTCMonth(), cursorLocal.getUTCDate()));
  for (let guard = 0; guard < 30 && remaining > 0; guard++) {
    const localDay = new Date(cursorLocal.getTime() + 12 * 3600_000 - offset); // noon local
    const weekday = localDay.getUTCDay();
    if (workdays.includes(weekday)) {
      const workStart = cursorLocal.getTime() + policy.start_hour * 3600_000 - offset; // UTC ms
      const workEnd = cursorLocal.getTime() + policy.end_hour * 3600_000 - offset;
      let from = Math.max(workStart, new Date(startISO).getTime());
      const to = workEnd;
      if (from < to) {
        const avail = Math.min(to - from, remaining);
        remaining -= avail;
        if (remaining <= 0) return new Date(from + avail).toISOString();
      }
    }
    cursorLocal = new Date(cursorLocal.getTime() + 86400_000);
  }
  return new Date(cursorLocal.getTime() - offset).toISOString();
}

function hashPassword(pw: string): string {
  const salt = randomUUID().replace(/-/g, '');
  return `scrypt:${salt}:${scryptSync(pw, salt, 32).toString('hex')}`;
}
function verifyPassword(pw: string, stored: string): boolean {
  try {
    const [, salt, key] = stored.split(':');
    const a = Buffer.from(key, 'hex');
    const b = Buffer.from(scryptSync(pw, salt, 32));
    return a.length === b.length && timingSafeEqual(a, b);
  } catch { return false; }
}

@Injectable()
export class PortalAuthService {
  login(db: Db, email: string, password: string) {
    const account = db.one('portal_accounts', (a) => a.email === String(email).toLowerCase());
    if (!account || !verifyPassword(password, account.password_hash as string)) {
      throw unprocessable('INVALID_CREDENTIALS', 'Invalid portal credentials');
    }
    // Token: membershipId 'portal:<id>'; guard re-resolves the account fresh.
    const token = signDevToken({ t: account.tenant_id, u: account.user_ref, m: `portal:${account.id}`, r: ['portal'], p: 'portal' });
    return { token, name: account.name, tenant_id: account.tenant_id };
  }
}

const ticketBody = z.object({
  subject: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  contact_id: z.string().uuid().optional(),
  queue_id: z.string().uuid().optional(),
  sla_policy_id: z.string().uuid().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
});

@Injectable()
export class ServiceService {
  constructor(@Inject(TenancyService) private tenancy: TenancyService) {}

  ensureDefaults(db: Db, tenantId: string, timezone: string) {
    let policy = db.tone('sla_policies', tenantId, () => true);
    if (!policy) {
      policy = db.insert('sla_policies', {
        tenant_id: tenantId, name: 'Standard', first_response_min: 240,
        week_pattern: 'sun_thu', start_hour: 9, end_hour: 17,
      });
    }
    return { policy };
  }

  numberFor(db: Db, tenantId: string): string {
    let seq = db.tone('number_sequences', tenantId, (s) => s.key === 'ticket');
    if (!seq) seq = db.insert('number_sequences', { tenant_id: tenantId, key: 'ticket', next: 1 });
    const n = seq.next as number;
    db.update('number_sequences', seq.id, { next: n + 1 });
    return `TKT-${String(n).padStart(5, '0')}`;
  }
}

@Controller('api/v1/service')
export class ServiceController {
  constructor(
    @Inject(TenancyService) private tenancy: TenancyService,
    @Inject(STORE_TOKEN) private st: typeof store,
    @Inject(ServiceService) private service: ServiceService,
  ) {}

  @Post('sla-policies')
  async createPolicy(@CtxOf() ctx: Ctx, @Body(new ZodPipe(z.object({
    name: z.string().min(1).max(80),
    first_response_min: z.number().int().min(5).max(10000),
    week_pattern: z.enum(['sun_thu', 'mon_fri']),
    start_hour: z.number().int().min(0).max(23),
    end_hour: z.number().int().min(1).max(24),
  }))) body: { name: string; first_response_min: number; week_pattern: 'sun_thu' | 'mon_fri'; start_hour: number; end_hour: number }) {
    this.tenancy.requirePerm(ctx, 'service.write');
    if (body.start_hour >= body.end_hour) throw unprocessable('INVALID_HOURS', 'start_hour must be before end_hour');
    return this.st.tx((db) => ({ status: 201 as const, policy: db.insert('sla_policies', { tenant_id: ctx.tenantId, ...body }) }));
  }

  @Post('tickets')
  async createTicket(@CtxOf() ctx: Ctx, @Body(new ZodPipe(ticketBody)) body: z.infer<typeof ticketBody>) {
    this.tenancy.requirePerm(ctx, 'service.write');
    return this.st.tx((db) => {
      if (body.contact_id) {
        const contact = db.tget('contacts', ctx.tenantId, body.contact_id);
        if (!contact) throw badRequest('contact_id not found in this workspace');
        this.tenancy.requireRecordAccess(ctx, 'crm', contact, 'read');
      }
      this.service.ensureDefaults(db, ctx.tenantId, 'Asia/Dubai');
      const policy = body.sla_policy_id
        ? db.tget('sla_policies', ctx.tenantId, body.sla_policy_id)
        : db.tone('sla_policies', ctx.tenantId, () => true);
      if (body.sla_policy_id && !policy) throw badRequest('sla_policy_id not found');
      if (body.queue_id && !db.tget('queues', ctx.tenantId, body.queue_id)) throw badRequest('queue_id not found');
      const now = new Date().toISOString();
      const due = policy ? slaDue(now, policy.first_response_min as number, policy as any, 'Asia/Dubai') : null;
      const ticket = db.insert('tickets', {
        tenant_id: ctx.tenantId, number: this.service.numberFor(db, ctx.tenantId),
        subject: body.subject, description: body.description ?? null,
        contact_id: body.contact_id ?? null, queue_id: body.queue_id ?? null,
        sla_policy_id: policy?.id ?? null, priority: body.priority, status: 'new',
        assignee_id: ctx.membershipId, department_id: ctx.departmentId ?? null, team_id: ctx.teamIds?.[0] ?? null,
        first_response_due_at: due, first_responded_at: null, resolved_at: null, escalated_at: null,
      });
      this.tenancy.audit(db, ctx.tenantId, ctx, 'service.ticket_created', 'ticket', ticket.id, { number: ticket.number, priority: body.priority });
      return { status: 201 as const, ticket, sla_due_at: due };
    });
  }

  @Get('tickets')
  async list(@CtxOf() ctx: Ctx, @Query('status') status?: string, @Query('q') q?: string) {
    this.tenancy.requirePerm(ctx, 'service.read');
    return this.st.tx((db) => {
      let rows = this.tenancy.filterByScope(ctx, 'service', db.tfind('tickets', ctx.tenantId, () => true));
      if (status) rows = rows.filter((t) => t.status === status);
      if (q) rows = rows.filter((t) => `${t.subject} ${t.number}`.toLowerCase().includes(q!.toLowerCase()));
      return { tickets: rows.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))) };
    });
  }

  @Get('tickets/:id')
  async getTicket(@CtxOf() ctx: Ctx, @Param('id') id: string) {
    this.tenancy.requirePerm(ctx, 'service.read');
    return this.st.tx((db) => {
      const ticket = db.tget('tickets', ctx.tenantId, id);
      if (!ticket) throw notFound('Ticket not found');
      this.tenancy.requireRecordAccess(ctx, 'service', ticket, 'read');
      return {
        ticket,
        comments: db.tfind('ticket_comments', ctx.tenantId, (c) => c.ticket_id === id && !c.internal),
      };
    });
  }

  @Post('tickets/:id/replies')
  async reply(@CtxOf() ctx: Ctx, @Param('id') id: string, @Body(new ZodPipe(z.object({ body: z.string().min(1).max(4000), internal: z.boolean().default(false) }))) payload: { body: string; internal: boolean }) {
    this.tenancy.requirePerm(ctx, 'service.write');
    return this.st.tx((db) => {
      const ticket = db.tget('tickets', ctx.tenantId, id);
      if (!ticket) throw notFound('Ticket not found');
      this.tenancy.requireRecordAccess(ctx, 'service', ticket, 'write');
      db.insert('ticket_comments', { tenant_id: ctx.tenantId, ticket_id: id, author_type: 'user', author_id: ctx.userId, body: payload.body, internal: payload.internal });
      const patch: Record<string, unknown> = { status: ticket.status === 'new' ? 'open' : ticket.status };
      let withinSla: boolean | null = null;
      if (!payload.internal && !ticket.first_responded_at) {
        const now = new Date().toISOString();
        patch.first_responded_at = now;
        withinSla = !ticket.first_response_due_at || now <= (ticket.first_response_due_at as string);
        this.tenancy.audit(db, ctx.tenantId, ctx, 'service.first_response', 'ticket', id, { within_sla: withinSla });
      }
      db.update('tickets', id, patch);
      return { ok: true, first_response_within_sla: withinSla };
    });
  }

  @HttpCode(200)
  @Post('tickets/:id/resolve')
  async resolve(@CtxOf() ctx: Ctx, @Param('id') id: string) {
    this.tenancy.requirePerm(ctx, 'service.write');
    return this.st.tx((db) => {
      const t = db.tget('tickets', ctx.tenantId, id);
      if (!t) throw notFound('Ticket not found');
      this.tenancy.requireRecordAccess(ctx, 'service', t, 'write');
      if (t.status === 'resolved') throw conflict('ALREADY_RESOLVED', 'Ticket already resolved');
      const updated = db.update('tickets', id, { status: 'resolved', resolved_at: new Date().toISOString() });
      this.tenancy.audit(db, ctx.tenantId, ctx, 'service.ticket_resolved', 'ticket', id, {});
      return { ticket: updated };
    });
  }

  @HttpCode(200)
  @Post('tickets/:id/reopen')
  async reopen(@CtxOf() ctx: Ctx, @Param('id') id: string) {
    this.tenancy.requirePerm(ctx, 'service.write');
    return this.st.tx((db) => {
      const t = db.tget('tickets', ctx.tenantId, id);
      if (!t) throw notFound('Ticket not found');
      this.tenancy.requireRecordAccess(ctx, 'service', t, 'write');
      if (t.status !== 'resolved') throw conflict('INVALID_STATE', 'Only resolved tickets can reopen');
      return { ticket: db.update('tickets', id, { status: 'open' }) };
    });
  }

  // Breach sweep: flags overdue first responses and escalates (idempotent —
  // one escalation per ticket).
  @Post('sla/sweep')
  @HttpCode(200)
  async slaSweep(@CtxOf() ctx: Ctx) {
    this.tenancy.requirePerm(ctx, 'service.write');
    return this.st.tx((db) => {
      const now = new Date().toISOString();
      const breached = this.tenancy.filterByScope(ctx, 'service', db.tfind('tickets', ctx.tenantId, (t) =>
        !t.first_responded_at && !!t.first_response_due_at && (t.first_response_due_at as string) < now), 'write');
      let escalated = 0;
      for (const t of breached) {
        if (t.escalated_at) continue;
        db.update('tickets', t.id, { escalated_at: now });
        db.insert('notifications', { tenant_id: ctx.tenantId, user_id: ctx.userId, kind: 'sla_breach', payload: { ticket_id: t.id, number: t.number } });
        this.tenancy.audit(db, ctx.tenantId, ctx, 'service.sla_breach_escalated', 'ticket', t.id, { number: t.number });
        escalated += 1;
      }
      return { breached: breached.length, escalated_now: escalated };
    });
  }

  // ---------- CSAT / NPS ----------
  @Post('tickets/:id/csat')
  async csat(@CtxOf() ctx: Ctx, @Param('id') id: string, @Body(new ZodPipe(z.object({ score: z.number().int().min(1).max(5), comment: z.string().max(1000).optional() }))) body: { score: number; comment?: string }) {
    this.tenancy.requirePerm(ctx, 'service.read');
    return this.st.tx((db) => {
      const t = db.tget('tickets', ctx.tenantId, id);
      if (!t) throw notFound('Ticket not found');
      this.tenancy.requireRecordAccess(ctx, 'service', t, 'read');
      if (t.status !== 'resolved') throw conflict('NOT_RESOLVED', 'CSAT can only be submitted on resolved tickets');
      if (db.tone('csat_responses', ctx.tenantId, (c) => c.ticket_id === id)) throw conflict('ALREADY_SUBMITTED', 'CSAT already submitted for this ticket');
      const row = db.insert('csat_responses', { tenant_id: ctx.tenantId, ticket_id: id, score: body.score, comment: body.comment ?? null });
      return { status: 201 as const, csat: row };
    });
  }

  @Post('nps')
  async nps(@CtxOf() ctx: Ctx, @Body(new ZodPipe(z.object({ contact_id: z.string().uuid().optional(), score: z.number().int().min(0).max(10) }))) body: { contact_id?: string; score: number }) {
    this.tenancy.requirePerm(ctx, 'service.read');
    return this.st.tx((db) => {
      if (body.contact_id) {
        const contact = db.tget('contacts', ctx.tenantId, body.contact_id);
        if (!contact) throw notFound('Contact not found');
        this.tenancy.requireRecordAccess(ctx, 'crm', contact, 'read');
      }
      return { status: 201 as const, nps: db.insert('nps_responses', { tenant_id: ctx.tenantId, contact_id: body.contact_id ?? null, score: body.score }) };
    });
  }

  @Get('satisfaction')
  async satisfaction(@CtxOf() ctx: Ctx) {
    this.tenancy.requirePerm(ctx, 'service.read');
    return this.st.tx((db) => {
      const csat = db.tfind('csat_responses', ctx.tenantId, () => true)
        .filter((response) => {
          const ticket = db.tget('tickets', ctx.tenantId, response.ticket_id as string);
          return !!ticket && this.tenancy.filterByScope(ctx, 'service', [ticket]).length > 0;
        });
      const nps = db.tfind('nps_responses', ctx.tenantId, () => true)
        .filter((response) => {
          if (!response.contact_id) return ctx.roles.includes('owner') || ctx.roles.includes('admin');
          const contact = db.tget('contacts', ctx.tenantId, response.contact_id as string);
          return !!contact && this.tenancy.filterByScope(ctx, 'crm', [contact]).length > 0;
        });
      const avgCsat = csat.length ? csat.reduce((a, c) => a + (c.score as number), 0) / csat.length : null;
      const promoters = nps.filter((n) => (n.score as number) >= 9).length;
      const detractors = nps.filter((n) => (n.score as number) <= 6).length;
      return { csat_avg: avgCsat === null ? null : Math.round(avgCsat * 100) / 100, csat_count: csat.length, nps: nps.length ? Math.round(((promoters - detractors) / nps.length) * 100) : null, nps_count: nps.length };
    });
  }

  // ---------- knowledge base ----------
  @Post('kb')
  async createArticle(@CtxOf() ctx: Ctx, @Body(new ZodPipe(z.object({ slug: z.string().regex(/^[a-z0-9-]{3,60}$/), title: z.string().min(1).max(160), body: z.string().min(1).max(20000) }))) body: { slug: string; title: string; body: string }) {
    this.tenancy.requirePerm(ctx, 'service.write');
    return this.st.tx((db) => {
      if (db.tone('kb_articles', ctx.tenantId, (a) => a.slug === body.slug)) throw conflict('SLUG_EXISTS', 'Article slug already exists');
      return { status: 201 as const, article: db.insert('kb_articles', { tenant_id: ctx.tenantId, ...body, status: 'published' }) };
    });
  }

  @Get('kb')
  async listKb(@CtxOf() ctx: Ctx) {
    this.tenancy.requirePerm(ctx, 'service.read');
    return this.st.tx((db) => ({ articles: db.tfind('kb_articles', ctx.tenantId, () => true) }));
  }
}

// ---------------- portal (tenant-managed accounts + grants) ----------------
@Controller('api/v1/service/portal')
export class PortalAdminController {
  constructor(
    @Inject(TenancyService) private tenancy: TenancyService,
    @Inject(STORE_TOKEN) private st: typeof store,
  ) {}

  @Post('accounts')
  async createAccount(@CtxOf() ctx: Ctx, @Body(new ZodPipe(z.object({
    email: z.string().email(), name: z.string().min(1).max(80), password: z.string().min(10),
  }))) body: { email: string; name: string; password: string }) {
    this.tenancy.requirePerm(ctx, 'service.write');
    return this.st.tx((db) => {
      if (db.tone('portal_accounts', ctx.tenantId, (a) => a.email === body.email.toLowerCase())) throw conflict('ACCOUNT_EXISTS', 'Portal account already exists');
      const account = db.insert('portal_accounts', {
        tenant_id: ctx.tenantId, email: body.email.toLowerCase(), name: body.name,
        password_hash: hashPassword(body.password), user_ref: randomUUID(),
      });
      this.tenancy.audit(db, ctx.tenantId, ctx, 'service.portal_account_created', 'portal_account', account.id, { email: account.email });
      return { status: 201 as const, account: { id: account.id, email: account.email } };
    });
  }

  @Post('grants')
  async grant(@CtxOf() ctx: Ctx, @Body(new ZodPipe(z.object({
    portal_account_id: z.string().uuid(),
    resource_type: z.enum(['ticket', 'invoice']),
    resource_id: z.string().uuid(),
  }))) body: { portal_account_id: string; resource_type: 'ticket' | 'invoice'; resource_id: string }) {
    this.tenancy.requirePerm(ctx, 'service.write');
    return this.st.tx((db) => {
      const account = db.tget('portal_accounts', ctx.tenantId, body.portal_account_id);
      if (!account) throw badRequest('portal_account_id not found');
      const table = body.resource_type === 'ticket' ? 'tickets' : 'invoices';
      if (!db.tget(table, ctx.tenantId, body.resource_id)) throw badRequest(`resource not found in this workspace`);
      const grant = db.insert('portal_grants', { tenant_id: ctx.tenantId, ...body, revoked_at: null });
      this.tenancy.audit(db, ctx.tenantId, ctx, 'service.portal_grant', 'portal_grant', grant.id, { resource: body.resource_type });
      return { status: 201 as const, grant: { id: grant.id } };
    });
  }
}

@Controller('api/v1/portal')
export class PortalController {
  constructor(
    @Inject(STORE_TOKEN) private st: typeof store,
    @Inject(PortalAuthService) private portalAuth: PortalAuthService,
  ) {}

  @Public()
  @HttpCode(200)
  @Post('login')
  async login(@Req() req: any, @Body(new ZodPipe(z.object({ email: z.string().email(), password: z.string().min(1) }))) body: { email: string; password: string }) {
    // Hardening: brute-force guard on the public credential endpoint.
    checkRate(`portal-login:${req.ip ?? 'anon'}`, 10, 60_000);
    return this.st.tx((db) => this.portalAuth.login(db, body.email, body.password));
  }

  // Only explicitly granted resources — never the tenant's other data.
  @Get('resources')
  async resources(@CtxOf() ctx: Ctx) {
    if (!ctx.roles.includes('portal')) throw notFound('Not found');
    return this.st.tx((db) => {
      const grants = db.tfind('portal_grants', ctx.tenantId, (g) => g.portal_account_id === ctx.membershipId.slice(7) && !g.revoked_at);
      const out: Array<Record<string, unknown>> = [];
      for (const g of grants) {
        const rec = g.resource_type === 'ticket'
          ? db.tget('tickets', ctx.tenantId, g.resource_id as string)
          : db.tget('invoices', ctx.tenantId, g.resource_id as string);
        if (rec) out.push({ type: g.resource_type, id: rec.id, label: rec.number ?? rec.subject, status: rec.status, total: rec.total ?? null });
      }
      return { resources: out };
    });
  }

  @HttpCode(200)
  @Post('tickets/:id/replies')
  async portalReply(@CtxOf() ctx: Ctx, @Param('id') id: string, @Body(new ZodPipe(z.object({ body: z.string().min(1).max(2000) }))) payload: { body: string }) {
    if (!ctx.roles.includes('portal')) throw notFound('Not found');
    return this.st.tx((db) => {
      const grant = db.tone('portal_grants', ctx.tenantId, (g) =>
        g.portal_account_id === ctx.membershipId.slice(7) && g.resource_type === 'ticket' && g.resource_id === id && !g.revoked_at);
      if (!grant) throw notFound('Ticket not found'); // ungranted == nonexistent
      const ticket = db.tget('tickets', ctx.tenantId, id);
      if (!ticket) throw notFound('Ticket not found');
      const account = db.tget('portal_accounts', ctx.tenantId, ctx.membershipId.slice(7));
      db.insert('ticket_comments', { tenant_id: ctx.tenantId, ticket_id: id, author_type: 'customer', author_id: account?.id ?? null, body: payload.body, internal: false });
      if (ticket.status === 'new') db.update('tickets', id, { status: 'open' });
      return { ok: true };
    });
  }
}

@Module({
  controllers: [ServiceController, PortalAdminController, PortalController],
  providers: [TenancyService, ServiceService, PortalAuthService, { provide: STORE_TOKEN, useValue: store }],
})
export class ServiceModule {}
