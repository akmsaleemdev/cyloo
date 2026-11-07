// Phase 2 — Omnichannel Inbox (module D).
// • Canonical conversation/message model normalized across providers (ADR-0005)
// • Durable webhook ingest: verify → persist raw → dedupe by provider event id
//   → process with retries → DLQ. Ack is fast; processing is asynchronous.
// • Capability descriptors per integration matrix; providers without
//   credentials/app-review surface "unconfigured" and refuse sends (never faked).
// • Outbound gates: channel status, consent (opt-in ledger), suppression list.
// • Human takeover switches conversation.mode and pauses automation.
import { Body, Controller, Get, Inject, Injectable, Module, NotFoundException, Param, Post, Req } from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Db, StoreError, badRequest, conflict, forbidden, notFound } from '@crm/shared';
import { z } from 'zod';
import { Ctx, CtxOf, Public } from './common/auth.js';
import { TenancyService } from './common/tenancy.service.js';
import { ZodPipe } from './common/http.js';
import { store, STORE_TOKEN } from './common/store.js';
import { CHANNEL_CAPABILITIES, CONSENT_REQUIRED_CHANNELS, type ChannelKind, type ProviderInboundEvent } from '@crm/integrations';

const MESSAGE_RANK: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3 };
const CONSENT_CHANNELS = new Set<string>(CONSENT_REQUIRED_CHANNELS);

function hmacOk(secret: string, raw: string, signature: string): boolean {
  if (typeof signature !== 'string' || signature.length !== 64) return false;
  const expected = createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function randomToken(len = 24) {
  return randomUUID().replace(/-/g, '').slice(0, len);
}

// ---------------- queue (ADR-0008 dev double) ----------------
@Injectable()
export class QueueService {
  constructor(@Inject(TenancyService) private tenancy: TenancyService) {}

  // In-process processor with bounded retries + DLQ persistence. At the
  // Supabase/Redis cutover this same contract moves to BullMQ workers.
  async processWithRetry(store_: typeof store, jobId: string, fn: (db: Db) => Promise<void>, retries = 3): Promise<{ ok: boolean; attempts: number }> {
    let attempts = 0;
    let lastError = '';
    while (attempts < retries) {
      attempts += 1;
      try {
        await store_.tx(async (db) => {
          const evt = db.get('webhook_events', jobId);
          if (!evt) throw notFound('Event vanished');
          if (evt.status === 'processed') return; // idempotent
          await fn(db);
          db.update('webhook_events', jobId, { status: 'processed', processed_at: new Date().toISOString(), error: null });
        });
        return { ok: true, attempts };
      } catch (e: any) {
        lastError = e?.message ?? String(e);
      }
    }
    await store_.tx((db) => {
      db.update('webhook_events', jobId, { status: 'failed', error: lastError });
      db.insert('dlq_entries', { tenant_id: (db.get('webhook_events', jobId) as any)?.tenant_id ?? null, queue: 'inbox-events', payload: { event_id: jobId }, error: lastError });
    });
    return { ok: false, attempts };
  }
}

// ---------------- messaging service ----------------
@Injectable()
export class MessagingService {
  constructor(@Inject(TenancyService) private tenancy: TenancyService) {}

  conversationByRef(db: Db, tenantId: string, channelId: string, externalRef: string) {
    return db.tone('conversations', tenantId, (c) => c.channel_id === channelId && c.external_ref === externalRef);
  }

  async ensureConversation(db: Db, tenantId: string, channel: any, externalRef: string, subject?: string) {
    let conv = this.conversationByRef(db, tenantId, channel.id, externalRef);
    if (!conv) {
      conv = db.insert('conversations', {
        tenant_id: tenantId, channel_id: channel.id, provider_account_id: channel.id,
        external_ref: externalRef, subject: subject ?? null, mode: 'ai', status: 'open',
        unread_count: 0, last_message_at: new Date().toISOString(),
      });
      this.tenancy.activity(db, tenantId, 'conversation', conv.id, 'created', { channel: channel.kind, ref: externalRef });
    }
    return conv;
  }

  async appendInbound(db: Db, tenantId: string, conv: any, providerMessageId: string | null, text: string) {
    // Idempotent at message level too (processor retries must not duplicate).
    if (providerMessageId && db.tone('messages', tenantId, (m) => m.provider_message_id === providerMessageId)) {
      return null;
    }
    const msg = db.insert('messages', {
      tenant_id: tenantId, conversation_id: conv.id, direction: 'in',
      sender_type: 'contact', body: text, status: 'received',
      provider_message_id: providerMessageId ?? null, sent_at: new Date().toISOString(),
    });
    db.update('conversations', conv.id, { last_message_at: new Date().toISOString(), unread_count: (conv.unread_count as number) + 1 });
    this.tenancy.activity(db, tenantId, 'conversation', conv.id, 'message_in', { message_id: msg.id });
    return msg;
  }

  // Outbound path: channel status → consent → suppression → send (adapter).
  async sendReply(db: Db, tenantId: string, ctx: Ctx, conversationId: string, text: string) {
    const conv = db.tget('conversations', tenantId, conversationId);
    if (!conv) throw notFound('Conversation not found');
    if (conv.mode === 'off') throw conflict('CONVERSATION_CLOSED', 'This conversation is closed.');
    const channel = db.tget('channels', tenantId, conv.channel_id as string);
    if (!channel) throw notFound('Channel not found');
    if (channel.status !== 'connected') {
      const cap = CHANNEL_CAPABILITIES[channel.kind as ChannelKind];
      throw new StoreError(409, 'CHANNEL_UNCONFIGURED', `${channel.kind} is not connected. Prerequisites: ${cap?.prerequisites ?? 'provider credentials'}.`, { kind: channel.kind });
    }
    const ref = String(conv.external_ref ?? '');
    if (CONSENT_CHANNELS.has(channel.kind as string)) {
      const consented = db.tone('consents', tenantId, (c) =>
        c.channel_kind === channel.kind && c.state === 'opt_in' &&
        (c.external_ref === ref || c.contact_id === (conv.contact_id ?? null)));
      if (!consented) {
        throw forbidden(`No opt-in consent on record for this ${channel.kind} recipient`, 'CONSENT_REQUIRED');
      }
    }
    const suppressed = db.tone('suppressions', tenantId, (s) =>
      s.channel_kind === channel.kind && (s.email === ref || s.phone === ref));
    if (suppressed) {
      throw forbidden(`Recipient is on the ${channel.kind} suppression list (${suppressed.reason})`, 'SUPPRESSED');
    }

    const msg = db.insert('messages', {
      tenant_id: tenantId, conversation_id: conv.id, direction: 'out',
      sender_type: ctx ? 'user' : 'ai', sender_id: ctx?.userId ?? null,
      body: text, status: 'queued',
    });
    // Provider adapter (test double for non-webchat): a real provider call
    // happens here at cutover. Failure surfaces honestly as status=failed.
    if (channel.kind !== 'webchat' && (channel.meta as any)?.test_double !== true) {
      db.update('messages', msg.id, { status: 'failed', error_code: 'ADAPTER_UNCONFIGURED' });
      throw new StoreError(409, 'CHANNEL_UNCONFIGURED', `${channel.kind} adapter is a declared test double and not configured.`);
    }
    const providerMessageId = `sim_${randomToken(12)}`;
    const sent = db.update('messages', msg.id, { status: 'sent', provider_message_id: providerMessageId, sent_at: new Date().toISOString() });
    db.update('conversations', conv.id, { last_message_at: new Date().toISOString() });
    this.tenancy.meter(db, tenantId, 'messages_sent', 1, { channel: channel.kind });
    this.tenancy.activity(db, tenantId, 'conversation', conv.id, 'message_out', { message_id: msg.id }, ctx);
    return sent;
  }
}

// ---------------- webhook ingest (public, signature/key verified) ----------------
const ingestBody = z.object({
  event_id: z.string().min(6).max(120),
  type: z.enum(['message.in', 'delivery.receipt', 'message.failed']),
  account_ref: z.string().min(1).max(160),
  data: z.object({
    session_ref: z.string().max(160).optional(),
    text: z.string().max(4000).optional(),
    provider_message_id: z.string().max(160).optional(),
    status: z.enum(['sent', 'delivered', 'read', 'failed']).optional(),
    visitor_name: z.string().max(120).optional(),
    error_code: z.string().max(60).optional(),
    timestamp: z.string().datetime().optional(),
  }),
});

@Controller('api/v1/webhooks')
export class WebhookController {
  constructor(
    @Inject(TenancyService) private tenancy: TenancyService,
    @Inject(STORE_TOKEN) private st: typeof store,
    @Inject(QueueService) private queue: QueueService,
    @Inject(MessagingService) private messaging: MessagingService,
  ) {}

  // Fast ack: verify → persist raw durably → dedupe → enqueue → 200.
  @Public()
  @Post(':source')
  async ingest(@Param('source') source: string, @Req() req: any, @Body(new ZodPipe(ingestBody)) body: z.infer<typeof ingestBody>) {
    if (!CHANNEL_CAPABILITIES[source as ChannelKind]) throw badRequest(`Unknown source "${source}"`, 'UNKNOWN_SOURCE');
    const raw = JSON.stringify(body);
    const signature = req.headers?.['x-signature'];
    const widgetKey = req.headers?.['x-widget-key'];

    // Resolve tenant/channel OUTSIDE any tenant scope, then verify auth material.
    let channelId: string | null = null;
    let tenantId: string | null = null;
    let secretOk = false;
    const channels = await this.st.tx((db) => db.find('channels', (c) => c.kind === source));
    for (const ch of channels) {
      const cfg = (ch.config ?? {}) as any;
      if (widgetKey && cfg.widget_key === widgetKey) { channelId = ch.id; tenantId = ch.tenant_id as string; secretOk = true; break; }
      if (signature && cfg.webhook_secret && hmacOk(cfg.webhook_secret, raw, signature)) { channelId = ch.id; tenantId = ch.tenant_id as string; secretOk = true; break; }
    }
    if (!secretOk) {
      // No valid auth material: persist (security evidence) and reject.
      await this.st.tx((db) => db.insert('webhook_events', {
        tenant_id: null, source, provider_account_ref: body.account_ref, provider_event_id: body.event_id,
        signature_valid: false, raw: JSON.parse(raw), status: 'failed', error: 'signature_or_key_invalid',
      }));
      throw forbidden('Invalid webhook signature or widget key', 'INVALID_SIGNATURE');
    }

    const { duplicate, id } = await this.st.tx((db) => {
      const dup = db.tone('webhook_events', tenantId!, (e) =>
        e.source === source && e.provider_account_ref === body.account_ref && e.provider_event_id === body.event_id);
      if (dup) return { duplicate: true, id: dup.id };
      const row = db.insert('webhook_events', {
        tenant_id: tenantId, source, provider_account_ref: body.account_ref, provider_event_id: body.event_id,
        signature_valid: true, raw: JSON.parse(raw), status: 'received',
      });
      return { duplicate: false, id: row.id };
    });
    if (duplicate) return { received: true, duplicate: true }; // fast ack, no reprocessing

    // Process with retries (dev double runs inline for deterministic tests;
    // the BullMQ cutover keeps this exact contract asynchronous).
    const result = await this.queue.processWithRetry(this.st, id, async (db) => {
      await this.dispatch(db, tenantId!, channelId!, body);
    });
    return { received: true, duplicate: false, event: id, processed: result.ok, attempts: result.attempts };
  }

  private async dispatch(db: Db, tenantId: string, channelId: string, body: z.infer<typeof ingestBody>) {
    const channel = db.get('channels', channelId);
    if (!channel) throw notFound('Channel vanished');

    if (body.type === 'message.in') {
      const sessionRef = body.data.session_ref ?? body.account_ref;
      if (!body.data.text) throw badRequest('message.in requires data.text');
      const conv = await this.messaging.ensureConversation(db, tenantId, channel, sessionRef, body.data.visitor_name);
      const msg = await this.messaging.appendInbound(db, tenantId, conv, body.event_id, body.data.text);
      if (!msg) throw conflict('ALREADY_PROCESSED', 'Message already appended'); // retry-safe: event already reflected
      return;
    }

    if (body.type === 'delivery.receipt' || body.type === 'message.failed') {
      const providerMessageId = body.data.provider_message_id;
      if (!providerMessageId) throw badRequest('receipt requires data.provider_message_id');
      const msg = db.tone('messages', tenantId, (m) => m.provider_message_id === providerMessageId);
      if (!msg) throw notFound('Unknown provider_message_id');
      const nextStatus = body.type === 'message.failed' ? 'failed' : (body.data.status ?? 'delivered');
      // Forward-only state machine: out-of-order receipts never downgrade.
      // Failure always applies (a sent message can fail later).
      const rank = (s: string) => MESSAGE_RANK[s] ?? 0;
      if (nextStatus === 'failed' || rank(nextStatus) >= rank(msg.status as string)) {
        db.update('messages', msg.id, { status: nextStatus, error_code: body.data.error_code ?? null });
      }
      db.insert('delivery_receipts', { tenant_id: tenantId, message_id: msg.id, status: nextStatus, timestamp: body.data.timestamp ?? new Date().toISOString(), raw: body.data });
      return;
    }
    throw badRequest(`Unhandled event type ${body.type}`);
  }
}

// ---------------- channels ----------------
@Controller('api/v1/channels')
export class ChannelsController {
  constructor(
    @Inject(TenancyService) private tenancy: TenancyService,
    @Inject(STORE_TOKEN) private st: typeof store,
  ) {}

  @Get()
  async list(@CtxOf() ctx: Ctx) {
    this.tenancy.requirePerm(ctx, 'inbox.read');
    return this.st.tx((db) => ({
      channels: db.tfind('channels', ctx.tenantId, () => true).map((c) => ({
        id: c.id, kind: c.kind, display_name: c.display_name, status: c.status,
        capabilities: CHANNEL_CAPABILITIES[c.kind as ChannelKind] ?? { ops: [], prerequisites: 'unknown', note: '' },
        webhook_url: `/api/v1/webhooks/${c.kind}`,
      })),
    }));
  }

  @Post()
  async create(@CtxOf() ctx: Ctx, @Body(new ZodPipe(z.object({ kind: z.string().max(20), display_name: z.string().min(1).max(80) }))) body: { kind: string; display_name: string }) {
    this.tenancy.requirePerm(ctx, 'inbox.write');
    const cap = CHANNEL_CAPABILITIES[body.kind as ChannelKind];
    if (!cap) throw badRequest(`Unknown channel kind "${body.kind}"`);
    return this.st.tx((db) => {
      const existing = db.tone('channels', ctx.tenantId, (c) => c.kind === body.kind);
      if (existing) throw conflict('CHANNEL_EXISTS', `${body.kind} channel already exists`, { id: existing.id });
      const widgetKey = body.kind === 'webchat' ? `wk_${randomToken(20)}` : null;
      const channel = db.insert('channels', {
        tenant_id: ctx.tenantId, kind: body.kind, display_name: body.display_name,
        status: body.kind === 'webchat' ? 'connected' : 'unconfigured',
        capability_ops: cap.ops,
        config: widgetKey ? { widget_key: widgetKey } : {},
        meta: {},
      });
      this.tenancy.audit(db, ctx.tenantId, ctx, 'inbox.channel_created', 'channel', channel.id, { kind: body.kind, status: channel.status });
      return { status: 201 as const, channel: { ...channel, webhook_secret: undefined }, widget_key: widgetKey, note: cap.note };
    });
  }

  // Sandbox configuration (EXPLICIT TEST DOUBLE): marks a provider connected
  // with labelled fake credentials so reply paths can be exercised. Production
  // requires real credentials + app review; this endpoint is dev-only.
  @Post(':id/configure-sandbox')
  async configureSandbox(@CtxOf() ctx: Ctx, @Param('id') id: string) {
    this.tenancy.requirePerm(ctx, 'inbox.write');
    return this.st.tx((db) => {
      const channel = db.tget('channels', ctx.tenantId, id);
      if (!channel) throw notFound('Channel not found');
      if (channel.kind === 'webchat') throw badRequest('webchat is always configured');
      const secret = `whsec_${randomToken(20)}`;
      const updated = db.update('channels', id, {
        status: 'connected',
        config: { ...(channel.config as object), webhook_secret: secret },
        meta: { test_double: true },
      });
      this.tenancy.audit(db, ctx.tenantId, ctx, 'inbox.channel_sandbox_configured', 'channel', id, { kind: channel.kind });
      return { status: 200 as const, channel: { id: updated.id, kind: updated.kind, status: updated.status }, webhook_secret: secret, note: 'TEST DOUBLE: credentials simulated for testing; production requires real provider credentials and app review.' };
    });
  }
}

// ---------------- conversations (agent-facing inbox) ----------------
@Controller('api/v1/conversations')
export class ConversationsController {
  constructor(
    @Inject(TenancyService) private tenancy: TenancyService,
    @Inject(STORE_TOKEN) private st: typeof store,
    @Inject(MessagingService) private messaging: MessagingService,
  ) {}

  @Get()
  async list(@CtxOf() ctx: Ctx) {
    this.tenancy.requirePerm(ctx, 'inbox.read');
    return this.st.tx((db) => {
      const convs = this.tenancy.filterByScope(ctx, 'inbox', db.tfind('conversations', ctx.tenantId, () => true))
        .sort((a, b) => String(b.last_message_at).localeCompare(String(a.last_message_at)));
      return {
        conversations: convs.map((c) => {
          const channel = db.tget('channels', ctx.tenantId, c.channel_id as string);
          const last = db.tfind('messages', ctx.tenantId, (m) => m.conversation_id === c.id).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
          return { ...c, channel_kind: channel?.kind, last_message: last ? { body: last.body, direction: last.direction, status: last.status } : null };
        }),
      };
    });
  }

  @Get(':id/messages')
  async messages(@CtxOf() ctx: Ctx, @Param('id') id: string) {
    this.tenancy.requirePerm(ctx, 'inbox.read');
    return this.st.tx((db) => {
      const conv = db.tget('conversations', ctx.tenantId, id);
      if (!conv) throw notFound('Conversation not found');
      this.tenancy.requireRecordAccess(ctx, 'inbox', conv, 'read');
      const channel = db.tget('channels', ctx.tenantId, conv.channel_id as string);
      db.update('conversations', id, { unread_count: 0 });
      return {
        conversation: { ...conv, channel_kind: channel?.kind },
        messages: db.tfind('messages', ctx.tenantId, (m) => m.conversation_id === id).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))),
      };
    });
  }

  @Post(':id/replies')
  async reply(@CtxOf() ctx: Ctx, @Param('id') id: string, @Body(new ZodPipe(z.object({ body: z.string().min(1).max(4000) }))) payload: { body: string }) {
    this.tenancy.requirePerm(ctx, 'inbox.write');
    return this.st.tx(async (db) => {
      const conv = db.tget('conversations', ctx.tenantId, id);
      if (!conv) throw notFound('Conversation not found');
      this.tenancy.requireRecordAccess(ctx, 'inbox', conv, 'write');
      return { status: 201 as const, message: await this.messaging.sendReply(db, ctx.tenantId, ctx, id, payload.body) };
    });
  }

  // Human takeover / release to AI
  @Post(':id/mode')
  async setMode(@CtxOf() ctx: Ctx, @Param('id') id: string, @Body(new ZodPipe(z.object({ mode: z.enum(['ai', 'human']) }))) payload: { mode: 'ai' | 'human' }) {
    this.tenancy.requirePerm(ctx, 'inbox.write');
    return this.st.tx((db) => {
      const conv = db.tget('conversations', ctx.tenantId, id);
      if (!conv) throw notFound('Conversation not found');
      this.tenancy.requireRecordAccess(ctx, 'inbox', conv, 'write');
      const updated = db.update('conversations', id, { mode: payload.mode, assignee_id: payload.mode === 'human' ? ctx.membershipId : null });
      this.tenancy.activity(db, ctx.tenantId, 'conversation', id, 'mode_change', { mode: payload.mode, by: ctx.userId }, ctx);
      return { conversation: updated };
    });
  }

  @Post(':id/close')
  async close(@CtxOf() ctx: Ctx, @Param('id') id: string) {
    this.tenancy.requirePerm(ctx, 'inbox.write');
    return this.st.tx((db) => {
      const conv = db.tget('conversations', ctx.tenantId, id);
      if (!conv) throw notFound('Conversation not found');
      this.tenancy.requireRecordAccess(ctx, 'inbox', conv, 'write');
      const updated = db.update('conversations', id, { status: 'closed', mode: 'off' });
      this.tenancy.activity(db, ctx.tenantId, 'conversation', id, 'closed', {}, ctx);
      return { conversation: updated };
    });
  }
}

// ---------------- consent ledger (S/U: PDPL-style opt-in evidence) ----------------
@Controller('api/v1/consents')
export class ConsentsController {
  constructor(
    @Inject(TenancyService) private tenancy: TenancyService,
    @Inject(STORE_TOKEN) private st: typeof store,
  ) {}

  @Post()
  async record(@CtxOf() ctx: Ctx, @Body(new ZodPipe(z.object({
    channel_kind: z.string().max(20),
    external_ref: z.string().max(160).optional(),
    contact_id: z.string().uuid().optional(),
    state: z.enum(['opt_in', 'opt_out']),
    evidence: z.record(z.string(), z.string()).default({}),
  }))) body: { channel_kind: string; external_ref?: string; contact_id?: string; state: 'opt_in' | 'opt_out'; evidence: Record<string, string> }) {
    this.tenancy.requirePerm(ctx, 'inbox.write');
    if (!body.external_ref && !body.contact_id) throw badRequest('external_ref or contact_id required');
    return this.st.tx((db) => {
      const row = db.insert('consents', {
        tenant_id: ctx.tenantId, channel_kind: body.channel_kind,
        external_ref: body.external_ref ?? null, contact_id: body.contact_id ?? null,
        state: body.state, evidence: body.evidence,
      });
      this.tenancy.audit(db, ctx.tenantId, ctx, `privacy.consent_${body.state}`, 'consent', row.id, { channel: body.channel_kind });
      return { status: 201 as const, consent: row };
    });
  }

  @Get()
  async list(@CtxOf() ctx: Ctx) {
    this.tenancy.requirePerm(ctx, 'inbox.read');
    return this.st.tx((db) => ({ consents: db.tfind('consents', ctx.tenantId, () => true).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))) }));
  }
}

// ---------------- suppression list (checked before every send) ----------------
@Controller('api/v1/suppressions')
export class SuppressionsController {
  constructor(
    @Inject(TenancyService) private tenancy: TenancyService,
    @Inject(STORE_TOKEN) private st: typeof store,
  ) {}

  @Post()
  async record(@CtxOf() ctx: Ctx, @Body(new ZodPipe(z.object({
    channel_kind: z.string().max(20),
    email: z.string().email().optional(),
    phone: z.string().max(24).optional(),
    reason: z.enum(['bounce', 'complaint', 'opt_out', 'manual']),
  }))) body: { channel_kind: string; email?: string; phone?: string; reason: string }) {
    this.tenancy.requirePerm(ctx, 'inbox.write');
    if (!body.email && !body.phone) throw badRequest('email or phone required');
    return this.st.tx((db) => {
      const row = db.insert('suppressions', { tenant_id: ctx.tenantId, channel_kind: body.channel_kind, email: body.email ?? null, phone: body.phone ?? null, reason: body.reason });
      this.tenancy.audit(db, ctx.tenantId, ctx, 'messaging.suppressed', 'suppression', row.id, { channel: body.channel_kind, reason: body.reason });
      return { status: 201 as const, suppression: { id: row.id, channel_kind: row.channel_kind, reason: row.reason } };
    });
  }

  @Get()
  async list(@CtxOf() ctx: Ctx) {
    this.tenancy.requirePerm(ctx, 'inbox.read');
    return this.st.tx((db) => ({ suppressions: db.tfind('suppressions', ctx.tenantId, () => true) }));
  }
}

@Module({
  controllers: [WebhookController, ChannelsController, ConversationsController, ConsentsController, SuppressionsController],
  providers: [TenancyService, QueueService, MessagingService, { provide: STORE_TOKEN, useValue: store }],
})
export class InboxModule {}
