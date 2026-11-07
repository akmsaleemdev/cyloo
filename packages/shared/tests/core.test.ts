import { describe, it, expect } from 'vitest';
import { toMinor, fromMinor, formatMoney, MoneyError } from '../src/money.js';
import { can, canAccessRecord, canDelegateRoles, canReadSensitiveData, moduleOf, entitled, PLANS } from '../src/rbac.js';
import { MemoryStore, nextNumber, conflict } from '../src/store.js';

describe('money (S — GCC currency precision)', () => {
  it('stores 2dp currencies in minor units', () => {
    expect(toMinor('1500.50', 'AED')).toBe(150050);
    expect(fromMinor(150050, 'AED')).toBe('1500.50');
    expect(formatMoney(9900, 'SAR')).toBe('SAR 99.00');
  });
  it('stores 3dp currencies (KWD/BHD/OMR) with 3 decimals', () => {
    expect(toMinor('12.345', 'KWD')).toBe(12345);
    expect(fromMinor(12345, 'KWD')).toBe('12.345');
    expect(() => toMinor('12.3456', 'KWD')).toThrow(MoneyError);
    expect(() => toMinor('12.345', 'AED')).toThrow(MoneyError);
  });
  it('handles negatives and integers', () => {
    expect(toMinor(-10, 'OMR')).toBe(-10000);
    expect(toMinor(5, 'BHD')).toBe(5000);
  });
});

describe('rbac (U — deny by default)', () => {
  it('wildcards for owner/admin only', () => {
    expect(can(['owner'], 'anything.at.all')).toBe(true);
    expect(can(['admin'], 'crm.delete')).toBe(true);
    expect(can(['sales_rep'], 'crm.delete')).toBe(false);
  });
  it('keeps platform and sensitive permissions outside tenant wildcards', () => {
    expect(can(['owner'], 'platform.security.manage')).toBe(false);
    expect(can(['admin'], 'sensitive.finance.read')).toBe(false);
    expect(can(['platform_super_admin'], 'crm.read')).toBe(false);
    expect(can(['platform_super_admin'], 'platform.security.manage')).toBe(true);
    expect(can([], 'crm.read', ['crm.*'])).toBe(true);
    expect(can([], 'sensitive.finance.read', ['sensitive.*'])).toBe(false);
    expect(canReadSensitiveData({
      tenantId: 't1', userId: 'u1', membershipId: 'm1', roles: ['finance_sensitive'],
    }, 'finance')).toBe(true);
  });
  it('limits role delegation and record access to the authorized scope', () => {
    expect(canDelegateRoles(['admin'], ['owner'])).toBe(false);
    expect(canDelegateRoles(['owner'], ['platform_super_admin'])).toBe(false);
    expect(canDelegateRoles(['owner'], ['finance_sensitive'])).toBe(false);
    expect(canDelegateRoles(['owner', 'finance_sensitive'], ['finance_sensitive'])).toBe(true);
    expect(canDelegateRoles(['owner'], ['sales_rep'])).toBe(true);

    const manager = {
      tenantId: 't1', userId: 'u1', membershipId: 'm1', roles: ['department_manager'], departmentId: 'd1',
    };
    expect(canAccessRecord(manager, 'leads', { tenant_id: 't1', department_id: 'd1' })).toBe(true);
    expect(canAccessRecord(manager, 'leads', { tenant_id: 't1', department_id: 'd2' })).toBe(false);
    expect(canAccessRecord(manager, 'leads', { tenant_id: 't2', department_id: 'd1' })).toBe(false);
    expect(canAccessRecord({
      tenantId: 't1', userId: 'u1', membershipId: 'm1', roles: ['standard_user'],
    }, 'tasks', { tenant_id: 't1', assignee_id: 'm1' }, 'write')).toBe(true);
    expect(canAccessRecord({
      tenantId: 't1', userId: 'u1', membershipId: 'm1', roles: ['standard_user'],
    }, 'tasks', { tenant_id: 't1', assignee_id: 'm2' })).toBe(false);
    expect(canAccessRecord({
      tenantId: 't1', userId: 'u1', membershipId: 'm1', roles: ['platform_super_admin'],
    }, 'leads', { tenant_id: 't1', owner_id: 'm1' })).toBe(false);
    expect(canAccessRecord({
      tenantId: 't1', userId: 'u1', membershipId: 'm1', roles: ['marketing'],
    }, 'marketing', { tenant_id: 't1', owner_id: 'm2' })).toBe(false);
    expect(canAccessRecord({
      tenantId: 't1', userId: 'u1', membershipId: 'm1', roles: ['marketing'], permissions: ['marketing.read_all'],
    }, 'marketing', { tenant_id: 't1', owner_id: 'm2' })).toBe(true);
  });
  it('module wildcards scope correctly', () => {
    expect(can(['sales_manager'], 'sales.approve')).toBe(true);
    expect(can(['sales_manager'], 'marketing.send')).toBe(false);
    expect(can(['support_agent'], 'service.write')).toBe(true);
    expect(can(['support_agent'], 'crm.write')).toBe(false);
  });
  it('maps perms to modules for entitlement gating', () => {
    expect(moduleOf('sales.read')).toBe('sales');
    expect(moduleOf('settings.manage')).toBe(null);
  });
  it('plan entitlements gate modules (Q)', () => {
    expect(entitled('trial', 'crm.read')).toBe(true);
    expect(entitled('trial', 'inbox.read')).toBe(false);
    expect(entitled('growth', 'ai.use')).toBe(true);
    expect(entitled('starter', 'ai.use')).toBe(false);
    expect(PLANS.enterprise.modules.length).toBe(14);
  });
});

describe('MemoryStore semantics', () => {
  it('serializes read-modify-write cycles', async () => {
    const store = new MemoryStore(['counters', 'number_sequences']);
    await store.tx((db) => db.insert('counters', { tenant_id: 't1', n: 0 }));
    await Promise.all(
      Array.from({ length: 25 }, () =>
        store.tx((db) => {
          const c = db.tone('counters', 't1', () => true)!;
          return db.update('counters', c.id, { n: (c.n as number) + 1 });
        }),
      ),
    );
    const final = await store.tx((db) => db.tone('counters', 't1', () => true));
    expect(final?.n).toBe(25);
  });

  it('tenant-scoped helpers filter by tenant_id', async () => {
    const store = new MemoryStore(['contacts']);
    await store.tx((db) => {
      db.insert('contacts', { tenant_id: 't1', email: 'a@x.com' });
      db.insert('contacts', { tenant_id: 't2', email: 'b@x.com' });
    });
    await store.tx((db) => {
      expect(db.tfind('contacts', 't1', () => true)).toHaveLength(1);
      expect(db.tget('contacts', 't2', (db.all('contacts')[0] as any).id)).toBeNull();
    });
  });

  it('tenant backup/restore never reads or mutates another tenant', async () => {
    const store = new MemoryStore(['tenants', 'contacts', 'api_keys']);
    await store.tx((db) => {
      db.insert('tenants', { id: 't1', name: 'one' });
      db.insert('tenants', { id: 't2', name: 'two' });
      db.insert('contacts', { tenant_id: 't1', email: 'one@example.com' });
      db.insert('contacts', { tenant_id: 't2', email: 'two@example.com' });
      db.insert('api_keys', { tenant_id: 't1', key_hash: 'secret-hash' });
    });
    const snapshot = await store.snapshotTenant('t1', ['api_keys']);
    expect(snapshot.contacts).toHaveLength(1);
    expect(snapshot.contacts[0].tenant_id).toBe('t1');
    expect(snapshot.api_keys).toBeUndefined();

    await store.tx((db) => db.insert('contacts', { tenant_id: 't1', email: 'later@example.com' }));
    await store.restoreTenant('t1', snapshot);
    const allContacts = await store.tx((db) => db.all('contacts'));
    expect(allContacts.map((row) => row.email)).toEqual(['two@example.com', 'one@example.com']);
    await expect(store.restoreTenant('t1', {
      ...snapshot,
      contacts: [...snapshot.contacts, { ...snapshot.contacts[0], tenant_id: 't2' }],
    })).rejects.toThrow('outside the target tenant');
  });

  it('optimistic version conflicts throw 409', async () => {
    const store = new MemoryStore(['things']);
    const r = await store.tx((db) => db.insert('things', { tenant_id: 't1' }));
    await store.tx((db) => db.update('things', r.id, { x: 1 }));
    await expect(store.tx((db) => db.update('things', r.id, { x: 2 }, 1))).rejects.toThrow(conflict('X', 'y').constructor as any);
  });

  it('nextNumber allocates per tenant without duplicates', async () => {
    const store = new MemoryStore(['number_sequences']);
    const nums = await store.tx((db) =>
      Promise.all(Array.from({ length: 5 }, () => Promise.resolve(nextNumber(db, 't1', 'invoice', 'INV')))),
    );
    expect(new Set(nums).size).toBe(5);
    expect(nums[0]).toBe('INV-000001');
  });
});
