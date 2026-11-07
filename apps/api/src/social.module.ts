// Phase 5 — Social Hub (G, light) + Advertising Hub (H, light).
// Social: content approval state machine (draft→review→approved→published)
// with provider publish declared unconfigured until API access exists —
// publishing is refused, never faked (a labelled sandbox publish exists for
// pipeline testing). Ads: authenticated lead-form ingest that creates
// attributed leads; provider OAuth connectors stay unconfigured.
import { Body, Controller, Get, HttpCode, Inject, Injectable, Module, NotFoundException, Param, Post } from '@nestjs/common';
import { badRequest, conflict, notFound, unprocessable } from '@crm/shared';
import { z } from 'zod';
import { Ctx, CtxOf } from './common/auth.js';
import { TenancyService } from './common/tenancy.service.js';
import { ZodPipe } from './common/http.js';
import { store, STORE_TOKEN } from './common/store.js';

const POST_TRANSITIONS: Record<string, string[]> = {
  draft: ['review'],
  review: ['approved', 'draft'],
  approved: ['scheduled', 'draft'],
  scheduled: ['published'],
  published: [],
};

@Controller('api/v1/social')
export class SocialController {
  constructor(
    @Inject(TenancyService) private tenancy: TenancyService,
    @Inject(STORE_TOKEN) private st: typeof store,
  ) {}

  @Post('posts')
  async create(@CtxOf() ctx: Ctx, @Body(new ZodPipe(z.object({
    content: z.string().min(1).max(2200),
    channels: z.array(z.enum(['instagram', 'facebook', 'tiktok', 'snapchat', 'linkedin'])).min(1).max(5),
    language: z.enum(['en', 'ar']).default('en'),
  }))) body: { content: string; channels: string[]; language: 'en' | 'ar' }) {
    this.tenancy.requirePerm(ctx, 'marketing.write');
    return this.st.tx((db) => {
      const post = db.insert('social_posts', { tenant_id: ctx.tenantId, content: body.content, channels: body.channels, language: body.language, status: 'draft', scheduled_at: null, published_at: null, approvals: [] });
      return { status: 201 as const, post };
    });
  }

  @Get('posts')
  async list(@CtxOf() ctx: Ctx) {
    this.tenancy.requirePerm(ctx, 'marketing.read');
    return this.st.tx((db) => ({ posts: db.tfind('social_posts', ctx.tenantId, () => true).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))) }));
  }

  @HttpCode(200)
  @Post(':id/transition')
  async transition(@CtxOf() ctx: Ctx, @Param('id') id: string, @Body(new ZodPipe(z.object({
    to: z.enum(['draft', 'review', 'approved', 'scheduled', 'published', 'draft_rejected']),
    scheduled_at: z.string().datetime().optional(),
  }))) body: { to: 'draft' | 'review' | 'approved' | 'scheduled' | 'published' | 'draft_rejected'; scheduled_at?: string }) {
    this.tenancy.requirePerm(ctx, 'marketing.write');
    return this.st.tx((db) => {
      const post = db.tget('social_posts', ctx.tenantId, id);
      if (!post) throw notFound('Post not found');
      const to = body.to === 'draft_rejected' ? 'draft' : body.to;
      const allowed = POST_TRANSITIONS[post.status as string] ?? [];
      if (!allowed.includes(to)) throw conflict('INVALID_TRANSITION', `Cannot move ${post.status} → ${to}`);
      if (to === 'published') {
        // Official provider APIs required (Meta/TikTok/Snapchat app review).
        // Declared unconfigured: refuse rather than fake. The labelled sandbox
        // publish endpoint below exists for pipeline testing.
        throw unprocessable('PROVIDER_UNCONFIGURED', `Publishing requires connected ${post.channels} provider accounts (app review). Configure channels first — nothing is faked.`);
      }
      const approvals = [...(post.approvals as Array<{ at: string; by: string; action: string }>), { at: new Date().toISOString(), by: ctx.userId, action: to }];
      const patch: Record<string, unknown> = { status: to, approvals };
      if (to === 'scheduled') patch.scheduled_at = body.scheduled_at ?? null;
      const updated = db.update('social_posts', id, patch);
      this.tenancy.audit(db, ctx.tenantId, ctx, 'social.post_transition', 'social_post', id, { to });
      return { post: updated };
    });
  }

  // Labelled SANDBOX publish (test double) — proves the pipeline end to end.
  @HttpCode(200)
  @Post(':id/publish-sandbox')
  async publishSandbox(@CtxOf() ctx: Ctx, @Param('id') id: string) {
    this.tenancy.requirePerm(ctx, 'marketing.write');
    return this.st.tx((db) => {
      const post = db.tget('social_posts', ctx.tenantId, id);
      if (!post) throw notFound('Post not found');
      if (post.status !== 'approved' && post.status !== 'scheduled') throw conflict('INVALID_STATE', 'Only approved/scheduled posts can publish');
      const updated = db.update('social_posts', id, { status: 'published', published_at: new Date().toISOString(), meta: { test_double: true } });
      this.tenancy.audit(db, ctx.tenantId, ctx, 'social.post_published_sandbox', 'social_post', id, { channels: post.channels });
      return { post: updated, note: 'TEST DOUBLE: no provider connected; production publishes via official APIs only.' };
    });
  }
}

// ---------------- Advertising Hub (H, light) ----------------
@Controller('api/v1/ads')
export class AdsController {
  constructor(
    @Inject(TenancyService) private tenancy: TenancyService,
    @Inject(STORE_TOKEN) private st: typeof store,
  ) {}

  @Get('accounts')
  async accounts(@CtxOf() ctx: Ctx) {
    this.tenancy.requirePerm(ctx, 'marketing.read');
    // Declared connector registry — OAuth (Google/Meta/TikTok/Snapchat) at P6.
    return {
      accounts: [
        { provider: 'google_ads', status: 'unconfigured', prerequisites: 'developer token + OAuth + API ACLs' },
        { provider: 'meta_ads', status: 'unconfigured', prerequisites: 'app review: ads_management + Conversions API' },
        { provider: 'tiktok_ads', status: 'unconfigured', prerequisites: 'developer approval; verify current API availability' },
        { provider: 'snapchat_ads', status: 'unconfigured', prerequisites: 'Snap app + OAuth scope verification' },
      ],
      note: 'Connectors refuse to fake data; lead-form ingest below works today.',
    };
  }

  // Lead-form ingest (from provider lead ads / manual CSV bridging until
  // OAuth connectors land). Creates an attributed lead — deduped by email.
  @Post('lead-forms')
  async ingestLead(@CtxOf() ctx: Ctx, @Body(new ZodPipe(z.object({
    form_id: z.string().min(1).max(80),
    provider: z.enum(['google_ads', 'meta_ads', 'tiktok_ads', 'snapchat_ads', 'manual']),
    name: z.string().min(1).max(120),
    email: z.string().email(),
    phone: z.string().max(24).optional(),
    attribution: z.record(z.string(), z.string().max(200)).default({}),
  }))) body: { form_id: string; provider: string; name: string; email: string; phone?: string; attribution: Record<string, string> }) {
    this.tenancy.requirePerm(ctx, 'leads.write');
    return this.st.tx((db) => {
      const dup = db.tone('leads', ctx.tenantId, (l) => l.email?.toLowerCase() === body.email.toLowerCase());
      if (dup) throw conflict('DUPLICATE_LEAD', 'Lead with this email exists', { existing_id: dup.id });
      let src = db.tone('lead_sources', ctx.tenantId, (s) => s.key === `ads:${body.provider}`);
      if (!src) src = db.insert('lead_sources', { tenant_id: ctx.tenantId, key: `ads:${body.provider}`, name: `${body.provider} lead form` });
      const lead = db.insert('leads', {
        tenant_id: ctx.tenantId, name: body.name, email: body.email, phone: body.phone ?? null,
        source_id: src.id, source_key: `ads:${body.provider}`,
        attribution: { ...body.attribution, form_id: body.form_id, provider: body.provider },
        score: 10, status: 'new', owner_id: null,
        sla_due_at: new Date(Date.now() + 4 * 3600_000).toISOString(),
      });
      this.tenancy.meter(db, ctx.tenantId, 'ads_leads', 1, { provider: body.provider });
      this.tenancy.audit(db, ctx.tenantId, ctx, 'ads.lead_ingested', 'lead', lead.id, { provider: body.provider, form: body.form_id });
      return { status: 201 as const, lead: { id: lead.id, attribution: lead.attribution } };
    });
  }
}

@Module({
  controllers: [SocialController, AdsController],
  providers: [TenancyService, { provide: STORE_TOKEN, useValue: store }],
})
export class SocialModule {}
