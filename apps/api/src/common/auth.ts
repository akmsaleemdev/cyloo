// Dev token auth + global tenant guard. Production replaces token issuance
// with Supabase Auth JWTs; the guard contract (resolve membership + tenant
// status fresh per request) stays identical.
import { CanActivate, ExecutionContext, Injectable, Inject, SetMetadata, UnauthorizedException, ForbiddenException, createParamDecorator } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { PLATFORM_ROLES, StoreError } from '@crm/shared';
import { store, STORE_TOKEN } from './store.js';

export interface Ctx {
  tenantId: string;
  userId: string;
  membershipId: string;
  roles: string[];
  permissions?: string[];
  departmentId?: string | null;
  teamIds?: string[];
  teamMemberIds?: string[];
  plan: string;
}

export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

const secret = () => process.env.DEV_AUTH_SECRET || 'dev-only-secret-not-for-production';

export function signDevToken(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret()).update(body).digest('base64url');
  return `dev.${body}.${sig}`;
}

export function verifyDevToken(token: string): Ctx | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'dev') return null;
  const expected = createHmac('sha256', secret()).update(parts[1]).digest('base64url');
  const a = Buffer.from(parts[2]);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    return { tenantId: p.t, userId: p.u, membershipId: p.m, roles: p.r ?? [], plan: p.p ?? 'trial' };
  } catch {
    return null;
  }
}

// API-key identity (Developer Hub): gck_… keys resolve to tenant + stored
// roles. Only the SHA-256 hash is persisted; the raw key is shown once.
export function hashApiKey(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(@Inject(Reflector) private reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const header = req.headers['authorization'] || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';

    // API-key path (machine-to-machine): resolves tenant + stored roles fresh;
    // revoked keys fail immediately.
    if (token.startsWith('gck_')) {
      return store.tx((db) => {
        const key = db.one('api_keys', (k) => k.key_hash === hashApiKey(token));
        if (!key || key.revoked_at) throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Invalid or revoked API key' });
        if (((key.roles as string[] | undefined) ?? []).some((role) => PLATFORM_ROLES.includes(role as (typeof PLATFORM_ROLES)[number]))) {
          throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Platform roles cannot be assigned to tenant API keys' });
        }
        const tenant = db.get('tenants', key.tenant_id as string);
        if (!tenant || tenant.status === 'suspended') throw new StoreError(404, 'NOT_FOUND', 'Tenant not found');
        req.ctx = {
          tenantId: key.tenant_id as string,
          userId: `apikey:${key.id}`,
          membershipId: `apikey:${key.id}`,
          roles: (key.roles as string[]) ?? [],
          permissions: (key.scopes as string[]) ?? [],
          plan: tenant.plan_key as string,
        } satisfies Ctx;
        req.isApiKey = true;
        return true;
      });
    }

    const parsed = verifyDevToken(token);
    if (!parsed) throw new UnauthorizedException({ code: 'UNAUTHORIZED', message: 'Valid bearer token required' });

    // Fresh resolution every request: a removed member or suspended tenant
    // loses access immediately, even with a still-valid signed token.
    return store.tx((db) => {
      const tenant = db.get('tenants', parsed.tenantId);
      if (!tenant) throw new StoreError(404, 'NOT_FOUND', 'Tenant not found'); // no existence leak
      if (tenant.status === 'suspended') {
        throw new StoreError(403, 'ORG_SUSPENDED', 'This workspace is suspended. Contact platform support.');
      }
      // Portal session: membershipId is 'portal:<account_id>' — resolve the
      // portal account instead of a membership; roles are ['portal'].
      if (parsed.membershipId.startsWith('portal:')) {
        const account = db.tget('portal_accounts', parsed.tenantId, parsed.membershipId.slice(7));
        if (!account || account.user_ref !== parsed.userId) {
          throw new StoreError(404, 'NOT_FOUND', 'Tenant not found');
        }
        req.ctx = { ...parsed, roles: ['portal'], plan: 'portal' } satisfies Ctx;
        return true;
      }
      const membership = db.get('memberships', parsed.membershipId);
      if (!membership || membership.tenant_id !== parsed.tenantId || membership.user_id !== parsed.userId) {
        throw new StoreError(404, 'NOT_FOUND', 'Tenant not found');
      }
      if (membership.status !== 'active') {
        throw new StoreError(404, 'NOT_FOUND', 'Tenant not found');
      }
      if (!Array.isArray(membership.roles)) {
        throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Membership has no valid role assignments' });
      }
      if ((membership.roles as string[]).some((role) => PLATFORM_ROLES.includes(role as (typeof PLATFORM_ROLES)[number]))) {
        throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Platform roles cannot be assigned through tenant memberships' });
      }
      // Roles come from the live membership, not the token claims.
      const membershipRoles = membership.roles as string[];
      const teamMemberships = db.find('team_memberships', (item) =>
        item.tenant_id === parsed.tenantId && item.membership_id === membership.id && item.status === 'active');
      const teamIds = [...new Set(teamMemberships.map((item) => item.team_id as string))]
        .filter((teamId) => db.tget('teams', parsed.tenantId, teamId)?.status === 'active');
      const teamMemberIds = db.find('team_memberships', (item) =>
        item.tenant_id === parsed.tenantId && teamIds.includes(item.team_id as string) && item.status === 'active')
        .filter((item) => db.tget('memberships', parsed.tenantId, item.membership_id as string)?.status === 'active')
        .map((item) => item.membership_id as string);
      const permissions = db.find('roles', (role) =>
        membershipRoles.includes(role.key as string) &&
        (role.tenant_id === parsed.tenantId || role.tenant_id === null))
        .flatMap((role) => Array.isArray(role.permissions) ? role.permissions as string[] : []);
      const departmentId = typeof membership.department_id === 'string' &&
        db.tget('departments', parsed.tenantId, membership.department_id)?.status === 'active'
        ? membership.department_id
        : null;
      req.ctx = {
        ...parsed,
        roles: membershipRoles,
        permissions,
        departmentId,
        teamIds,
        teamMemberIds,
      } satisfies Ctx;
      return true;
    });
  }
}

export const CtxOf = createParamDecorator((_: unknown, ctx: ExecutionContext): Ctx => ctx.switchToHttp().getRequest().ctx);
export { STORE_TOKEN };
