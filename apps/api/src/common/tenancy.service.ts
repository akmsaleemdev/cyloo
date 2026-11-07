// Permission + entitlement gate, metering, audit and timeline writes.
import { ForbiddenException, Injectable } from '@nestjs/common';
import { badRequest, can, canAccessRecord, entitled, forbidden, moduleOf, RecordAction, scopeRecords, StoreError } from '@crm/shared';
import { Ctx } from './auth.js';
import { Db } from '@crm/shared';

@Injectable()
export class TenancyService {
  requirePerm(ctx: Ctx, perm: string) {
    if (!can(ctx.roles, perm, ctx.permissions)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: `Missing permission: ${perm}` });
    }
    if (!entitled(ctx.plan, perm)) {
      throw new ForbiddenException({
        code: 'ENTITLEMENT_REQUIRED',
        message: `Module "${moduleOf(perm)}" is not part of the ${ctx.plan} plan. Upgrade in Billing.`,
      });
    }
  }

  requireSensitivePermission(ctx: Ctx, category: 'finance' | 'hr' | 'customer', action: 'read' | 'write') {
    const permission = `sensitive.${category}.${action}`;
    if (!can(ctx.roles, permission, ctx.permissions)) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: `Missing sensitive-data permission: ${permission}` });
    }
  }

  filterByScope<T extends Record<string, unknown>>(ctx: Ctx, resource: string, rows: T[], action: RecordAction = 'read'): T[] {
    return scopeRecords(ctx, resource, rows, action);
  }

  requireRecordAccess(ctx: Ctx, resource: string, row: Record<string, unknown>, action: RecordAction = 'read') {
    if (!canAccessRecord(ctx, resource, row, action)) {
      throw new StoreError(404, 'NOT_FOUND', 'Record not found');
    }
  }

  requireAssignableMember(db: Db, ctx: Ctx, membershipId: string) {
    const target = db.tget('memberships', ctx.tenantId, membershipId);
    if (!target || target.status !== 'active') throw badRequest('Assignee is not an active member of this workspace');
    if (target.id === ctx.membershipId || ctx.roles.includes('owner') || ctx.roles.includes('admin')) return;
    if (
      (ctx.roles.includes('department_manager') || ctx.roles.includes('sales_manager')) &&
      typeof ctx.departmentId === 'string' &&
      target.department_id === ctx.departmentId
    ) return;
    if (ctx.roles.includes('team_leader') && (ctx.teamMemberIds ?? []).includes(target.id as string)) return;
    throw forbidden('Cannot assign records outside your team or department', 'FORBIDDEN');
  }

  meter(db: Db, tenantId: string, metric: string, quantity = 1, meta: Record<string, unknown> = {}) {
    db.insert('usage_events', { tenant_id: tenantId, metric, quantity, meta, occurred_at: new Date().toISOString() });
  }

  audit(db: Db, tenantId: string, ctx: Ctx | null, action: string, resourceType: string, resourceId: string | null, meta: Record<string, unknown> = {}) {
    db.insert('audit_events', {
      tenant_id: tenantId,
      actor_id: ctx?.userId ?? null,
      actor_type: ctx ? 'user' : 'system',
      action, resource_type: resourceType, resource_id: resourceId, meta,
    });
  }

  // Immutable timeline append (activity_events has no update/delete anywhere).
  activity(db: Db, tenantId: string, entity: string, entityId: string, kind: string, payload: Record<string, unknown>, actor?: Ctx) {
    db.insert('activity_events', {
      tenant_id: tenantId, entity, entity_id: entityId, kind, payload,
      actor_id: actor?.userId ?? null, actor_type: actor ? 'user' : 'system',
      occurred_at: new Date().toISOString(),
    });
  }

  timeline(db: Db, tenantId: string, entity: string, entityId: string) {
    return db.tfind('activity_events', tenantId, (e) => e.entity === entity && e.entity_id === entityId)
      .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  }

  // Lazily seed the default pipeline + stages (idempotent).
  ensureDefaultPipeline(db: Db, tenantId: string) {
    let p = db.tone('pipelines', tenantId, (x) => x.is_default);
    if (!p) {
      p = db.insert('pipelines', { tenant_id: tenantId, name: 'New Business', is_default: true });
      const stages = ['New', 'Qualified', 'Proposal', 'Negotiation', 'Won', 'Lost'];
      stages.forEach((name, i) => db.insert('pipeline_stages', {
        tenant_id: tenantId, pipeline_id: p!.id, name, position: i,
        probability: i === 4 ? 1 : i === 5 ? 0 : Math.min(0.9, 0.1 + i * 0.15),
        is_won: name === 'Won', is_lost: name === 'Lost',
      }));
    }
    return p;
  }
}

export { StoreError };
