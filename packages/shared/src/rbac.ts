// Deny-by-default RBAC + plan entitlements (modules Q, U).
export const MODULES = ['crm', 'leads', 'sales', 'inbox', 'ai', 'marketing', 'social', 'ads', 'scheduling', 'service', 'operations', 'analytics', 'commerce', 'developer'] as const;
export type ModuleKey = (typeof MODULES)[number];

export const ROLES = [
  'owner', 'admin', 'sales_manager', 'sales_rep', 'marketing',
  'support_agent', 'accountant', 'employee', 'department_manager',
  'team_leader', 'standard_user', 'sales_agent', 'external_client',
  'ai_agent', 'service_identity', 'platform_super_admin',
  'platform_support_admin', 'finance_sensitive', 'hr_sensitive',
  'customer_confidential',
] as const;
export type Role = (typeof ROLES)[number];

export const PLATFORM_ROLES = ['platform_super_admin', 'platform_support_admin'] as const;
export const SENSITIVE_ROLES = ['finance_sensitive', 'hr_sensitive', 'customer_confidential'] as const;

export const ROLE_PERMS: Record<Role, string[]> = {
  owner: ['*'],
  admin: ['*'],
  sales_manager: ['crm.*', 'leads.*', 'sales.*', 'operations.*', 'analytics.read', 'scheduling.*', 'ai.use'],
  sales_rep: ['crm.read', 'crm.write', 'leads.read', 'leads.write', 'sales.read', 'sales.write', 'operations.read', 'scheduling.read', 'scheduling.write', 'ai.use'],
  marketing: ['crm.read', 'leads.*', 'marketing.*', 'analytics.read', 'ai.use'],
  support_agent: ['crm.read', 'service.*', 'operations.read', 'ai.use'],
  accountant: ['crm.read', 'sales.read', 'commerce.*', 'analytics.read'],
  employee: ['crm.read', 'operations.read', 'ai.use'],
  department_manager: ['crm.read', 'crm.write', 'leads.read', 'leads.write', 'sales.read', 'sales.write', 'operations.read', 'operations.write', 'service.read', 'service.write', 'inbox.read', 'inbox.write', 'analytics.read', 'scheduling.read', 'scheduling.write'],
  team_leader: ['crm.read', 'crm.write', 'leads.read', 'leads.write', 'sales.read', 'sales.write', 'operations.read', 'operations.write', 'service.read', 'service.write', 'inbox.read', 'inbox.write', 'scheduling.read', 'scheduling.write'],
  standard_user: ['crm.read', 'leads.read', 'sales.read', 'operations.read', 'service.read', 'inbox.read', 'scheduling.read'],
  sales_agent: ['crm.read', 'crm.write', 'leads.read', 'leads.write', 'sales.read', 'sales.write', 'operations.read', 'scheduling.read', 'scheduling.write'],
  external_client: [],
  ai_agent: ['ai.use'],
  service_identity: [],
  platform_super_admin: ['platform.tenant.manage', 'platform.billing.manage', 'platform.security.manage'],
  platform_support_admin: ['support.access.request'],
  finance_sensitive: ['commerce.*', 'sensitive.finance.read', 'sensitive.finance.write'],
  hr_sensitive: ['sensitive.hr.read', 'sensitive.hr.write'],
  customer_confidential: ['sensitive.customer.read', 'sensitive.customer.write'],
};

export interface ScopedAuthorizationContext {
  tenantId: string;
  userId: string;
  membershipId: string;
  roles: string[];
  permissions?: string[];
  departmentId?: string | null;
  teamIds?: string[];
  teamMemberIds?: string[];
  supportAccess?: {
    tenantId: string;
    expiresAt: string;
    resourceTypes: string[];
    permissions: string[];
  };
}

export type RecordAction = 'read' | 'write' | 'delete' | 'export';

const isPrivilegedPermission = (permission: string) =>
  permission.startsWith('platform.') ||
  permission.startsWith('support.') ||
  permission.startsWith('sensitive.');

export const MODULE_OF: Record<string, ModuleKey> = {
  crm: 'crm', leads: 'leads', sales: 'sales', inbox: 'inbox', ai: 'ai',
  marketing: 'marketing', social: 'social', ads: 'ads', scheduling: 'scheduling',
  service: 'service', operations: 'operations', analytics: 'analytics',
  commerce: 'commerce', developer: 'developer',
};

export function can(roles: string[], perm: string, explicitPermissions: string[] = []): boolean {
  if (explicitPermissions.includes(perm)) return true;
  if (!isPrivilegedPermission(perm)) {
    const [head] = perm.split('.');
    if (explicitPermissions.includes('*') || explicitPermissions.includes(`${head}.*`)) return true;
  }
  for (const r of roles) {
    const perms = ROLE_PERMS[r as Role] ?? [];
    if (isPrivilegedPermission(perm)) {
      if (perms.includes(perm)) return true;
      continue;
    }
    if (perms.includes('*')) return true;
    if (perms.includes(perm)) return true;
    const [head] = perm.split('.');
    if (perms.includes(`${head}.*`)) return true;
  }
  return false;
}

export function canDelegateRoles(actorRoles: string[], targetRoles: string[]): boolean {
  if (targetRoles.length === 0 || targetRoles.some((role) => !ROLES.includes(role as Role))) return false;
  if (targetRoles.some((role) => PLATFORM_ROLES.includes(role as (typeof PLATFORM_ROLES)[number]))) return false;
  if (targetRoles.some((role) => SENSITIVE_ROLES.includes(role as (typeof SENSITIVE_ROLES)[number]) && !actorRoles.includes(role))) {
    return false;
  }
  if (actorRoles.includes('owner')) return true;
  if (targetRoles.some((role) => role === 'owner' || role === 'admin')) return false;
  return targetRoles.every((role) =>
    (ROLE_PERMS[role as Role] ?? []).every((permission) => can(actorRoles, permission)),
  );
}

export function canAccessRecord(
  ctx: ScopedAuthorizationContext,
  resource: string,
  record: Record<string, unknown>,
  action: RecordAction = 'read',
): boolean {
  if (record.tenant_id !== ctx.tenantId) {
    const grant = ctx.supportAccess;
    return ctx.roles.includes('platform_support_admin') &&
      !!grant &&
      grant.tenantId === record.tenant_id &&
      Date.parse(grant.expiresAt) > Date.now() &&
      grant.resourceTypes.includes(resource) &&
      grant.permissions.includes(`${resource}.${action}`);
  }

  if (ctx.roles.includes('platform_super_admin')) return false;
  if (ctx.roles.includes('platform_support_admin')) {
    const grant = ctx.supportAccess;
    return ctx.roles.includes('platform_support_admin') &&
      !!grant &&
      grant.tenantId === ctx.tenantId &&
      Date.parse(grant.expiresAt) > Date.now() &&
      grant.resourceTypes.includes(resource) &&
      grant.permissions.includes(`${resource}.${action}`);
  }

  if (ctx.roles.some((role) => role === 'owner' || role === 'admin')) return true;
  const allRecordsPermission = `${resource}.${action}_all`;
  if (
    ctx.permissions?.includes(allRecordsPermission) ||
    ctx.roles.some((role) => ROLE_PERMS[role as Role]?.includes(allRecordsPermission))
  ) return true;

  const selfIds = new Set([ctx.membershipId, ctx.userId]);
  const assignedIds = [
    record.owner_id, record.assignee_id, record.assigned_to,
    record.created_by, record.user_id,
  ].filter((value): value is string => typeof value === 'string');
  const assignedToSelf = assignedIds.some((id) => selfIds.has(id));
  if (assignedToSelf) return true;

  if (
    (ctx.roles.includes('department_manager') || ctx.roles.includes('sales_manager')) &&
    typeof ctx.departmentId === 'string' &&
    record.department_id === ctx.departmentId
  ) return true;

  if (
    ctx.roles.includes('team_leader') &&
    (
      (typeof record.team_id === 'string' && (ctx.teamIds ?? []).includes(record.team_id)) ||
      assignedIds.some((id) => (ctx.teamMemberIds ?? []).includes(id))
    )
  ) return true;

  return false;
}

export function scopeRecords<T extends Record<string, unknown>>(
  ctx: ScopedAuthorizationContext,
  resource: string,
  records: T[],
  action: RecordAction = 'read',
): T[] {
  return records.filter((record) => canAccessRecord(ctx, resource, record, action));
}

export function canReadSensitiveData(ctx: ScopedAuthorizationContext, category: 'finance' | 'hr' | 'customer'): boolean {
  return can(ctx.roles, `sensitive.${category}.read`, ctx.permissions);
}

export function moduleOf(perm: string): ModuleKey | null {
  return MODULE_OF[perm.split('.')[0]] ?? null;
}

// ---- plan catalogue (Q): entitlements gate module APIs ----
export interface PlanEntitlements {
  modules: ModuleKey[];
  limits: { users: number; ai_messages_month: number; contacts: number };
}

export const PLANS: Record<string, PlanEntitlements> = {
  trial: { modules: ['crm', 'leads', 'sales', 'operations'], limits: { users: 3, ai_messages_month: 50, contacts: 500 } },
  starter: { modules: ['crm', 'leads', 'sales', 'operations', 'scheduling', 'service'], limits: { users: 10, ai_messages_month: 500, contacts: 10000 } },
  growth: { modules: ['crm', 'leads', 'sales', 'operations', 'scheduling', 'service', 'inbox', 'ai', 'marketing', 'analytics'], limits: { users: 50, ai_messages_month: 5000, contacts: 100000 } },
  enterprise: {
    modules: ['crm', 'leads', 'sales', 'operations', 'scheduling', 'service', 'inbox', 'ai', 'marketing', 'analytics', 'social', 'ads', 'commerce', 'developer'],
    limits: { users: 1000, ai_messages_month: 100000, contacts: 1000000 },
  },
};

export function entitled(planKey: string, perm: string): boolean {
  const mod = moduleOf(perm);
  if (!mod) return true; // non-module permission (settings/billing)
  return (PLANS[planKey]?.modules ?? []).includes(mod);
}
