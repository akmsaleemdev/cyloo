import { ForbiddenException, Inject, Module, Post, Body, Controller, Req } from '@nestjs/common';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { z } from 'zod';
import { PLATFORM_ROLES } from '@crm/shared';
import { TenantGuard, Public, signDevToken } from './common/auth.js';
import { checkRate } from './common/ratelimit.js';
import { AllExceptionsFilter, ZodPipe } from './common/http.js';
import { TenancyService } from './common/tenancy.service.js';
import { store, STORE_TOKEN } from './common/store.js';
import { CrmModule } from './crm.module.js';
import { LeadsModule } from './leads.module.js';
import { SalesModule } from './sales.module.js';
import { OpsModule } from './ops.module.js';
import { InboxModule } from './inbox.module.js';
import { AiModule } from './ai.module.js';
import { SchedulingModule } from './scheduling.module.js';
import { WorkflowModule } from './workflow.module.js';
import { MarketingModule } from './marketing.module.js';
import { ServiceModule } from './service.module.js';
import { CommerceModule } from './commerce.module.js';
import { SocialModule } from './social.module.js';
import { PlatformModule } from './platform.module.js';

// Dev token issuance (ADR-0004). PUBLIC — dev/test only; production uses
// Supabase Auth JWTs. Creates a tenant + owner membership atomically and
// returns a signed token bound to them.
@Controller('api/v1/dev')
class DevAuthController {
  constructor(@Inject(TenancyService) private tenancy: TenancyService, @Inject(STORE_TOKEN) private st: typeof store) {}

  @Public()
  @Post('token')
  async issue(@Req() req: any, @Body(new ZodPipe(z.object({
    tenant_name: z.string().min(1).max(120),
    user_email: z.string().email(),
    plan: z.enum(['trial', 'starter', 'growth', 'enterprise']).default('trial'),
    roles: z.array(z.string()).default(['owner']).refine(
      (roles) => roles.every((role) => !PLATFORM_ROLES.includes(role as (typeof PLATFORM_ROLES)[number])),
      'Platform roles require the separate platform identity flow',
    ),
  }))) body: { tenant_name: string; user_email: string; plan: 'trial' | 'starter' | 'growth' | 'enterprise'; roles: string[] }) {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('Development token issuance is disabled in production.');
    }
    checkRate(`devtoken:${req.ip ?? 'anon'}`, 30, 60_000); // hardening: brute-force guard
    return this.st.tx((db) => {
      const tenant = db.insert('tenants', {
        name: body.tenant_name, slug: body.tenant_name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.random().toString(36).slice(2, 7),
        plan_key: body.plan, status: 'active',
      });
      let user = db.one('users', (u) => u.email === body.user_email);
      if (!user) user = db.insert('users', { email: body.user_email, name: body.user_email.split('@')[0] });
      const membership = db.insert('memberships', { tenant_id: tenant.id, user_id: user.id, roles: body.roles, status: 'active' });
      const token = signDevToken({ t: tenant.id, u: user.id, m: membership.id, r: body.roles, p: body.plan });
      return { status: 201 as const, token, tenant: { id: tenant.id, name: tenant.name, plan: body.plan }, membership_id: membership.id, roles: body.roles };
    });
  }
}

@Module({
  controllers: [DevAuthController],
  providers: [
    TenancyService,
    { provide: STORE_TOKEN, useValue: store },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
  imports: [CrmModule, LeadsModule, SalesModule, OpsModule, InboxModule, AiModule, SchedulingModule, WorkflowModule, MarketingModule, ServiceModule, CommerceModule, SocialModule, PlatformModule],
})
export class AppModule {}
