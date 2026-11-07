// TenantStore contract (ADR-0004). PgStore (Supabase) implements this at
// cutover; MemoryStore is the explicit local/test double with the same
// semantics (serialized tx, versioned rows).
export type Row = Record<string, any> & {
  id: string;
  tenant_id?: string;
  row_version: number;
  created_at: string;
  updated_at: string;
};

export interface Db {
  all(table: string): Row[];
  get(table: string, id: string): Row | null;
  find(table: string, pred: (r: Row) => boolean): Row[];
  one(table: string, pred: (r: Row) => boolean): Row | null;
  insert(table: string, row: Record<string, any>): Row;
  update(table: string, id: string, patch: Record<string, any>, expectedVersion?: number): Row;
  // tenant-scoped helpers — handlers MUST use these for tenant data
  tget(table: string, tenantId: string, id: string): Row | null;
  tfind(table: string, tenantId: string, pred: (r: Row) => boolean): Row[];
  tone(table: string, tenantId: string, pred: (r: Row) => boolean): Row | null;
}

export interface TenantStore {
  tx<T>(fn: (db: Db) => Promise<T> | T): Promise<T>;
  snapshot?(): Record<string, Row[]>;
  restore?(snap: Record<string, Row[]>): void;
  snapshotTenant?(tenantId: string, excludedTables?: string[]): Record<string, Row[]> | Promise<Record<string, Row[]>>;
  restoreTenant?(tenantId: string, snap: Record<string, Row[]>): void | Promise<void>;
}

export class StoreError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export const notFound = (msg = 'Not found', code = 'NOT_FOUND') => new StoreError(404, code, msg);
export const forbidden = (msg = 'Forbidden', code = 'FORBIDDEN') => new StoreError(403, code, msg);
export const badRequest = (msg: string, code = 'BAD_REQUEST') => new StoreError(400, code, msg);
export const conflict = (code: string, msg: string, details?: unknown) => new StoreError(409, code, msg, details);
export const unprocessable = (code: string, msg: string, details?: unknown) => new StoreError(422, code, msg, details);

// Tenant-scoped document number allocation (INV-000001, QUO-000001…)
export function nextNumber(db: Db, tenantId: string, key: string, prefix: string): string {
  let seq = db.tone('number_sequences', tenantId, (s) => s.key === key);
  if (!seq) seq = db.insert('number_sequences', { tenant_id: tenantId, key, next: 1 });
  const n = seq.next as number;
  db.update('number_sequences', seq.id, { next: n + 1 });
  return `${prefix}-${String(n).padStart(6, '0')}`;
}

// ---- MemoryStore (ADR-0004 dev/test double) ----
import { randomUUID } from 'node:crypto';

export class MemoryStore implements TenantStore {
  private data = new Map<string, Row[]>();
  private lock: Promise<unknown> = Promise.resolve();

  constructor(tables: string[]) {
    for (const t of tables) this.data.set(t, []);
  }

  async tx<T>(fn: (db: Db) => Promise<T> | T): Promise<T> {
    const run = this.lock.then(() => fn(this.db()));
    this.lock = run.catch(() => {});
    return run as Promise<T>;
  }

  // DR drill support (P6): deep-copy snapshot + restore. Production maps to
  // managed PostgreSQL backups/PITR (docs/runbooks) — same contract.
  snapshot(): Record<string, Row[]> {
    return Object.fromEntries([...this.data.entries()].map(([t, rows]) => [t, rows.map((r) => ({ ...r }))]));
  }

  restore(snap: Record<string, Row[]>): void {
    this.data = new Map(Object.entries(snap).map(([t, rows]) => [t, rows.map((r) => ({ ...r }))]));
  }

  snapshotTenant(tenantId: string, excludedTables: string[] = []): Promise<Record<string, Row[]>> {
    const excluded = new Set(excludedTables);
    return this.tx((db) => Object.fromEntries(
      [...this.data.keys()]
        .filter((table) => !excluded.has(table))
        .map((table) => [
          table,
          db.all(table)
            .filter((row) => table === 'tenants' ? row.id === tenantId : row.tenant_id === tenantId)
            .map((row) => ({ ...row })),
        ]),
    ));
  }

  async restoreTenant(tenantId: string, snap: Record<string, Row[]>): Promise<void> {
    const run = this.lock.then(() => {
      const entries = Object.entries(snap);
      const tenantRows = snap.tenants;
      if (!tenantRows || tenantRows.length !== 1 || tenantRows[0].id !== tenantId) {
        throw badRequest('Snapshot must contain exactly the target tenant');
      }

      for (const [table, rows] of entries) {
        if (!this.data.has(table)) throw badRequest(`Snapshot contains unknown table: ${table}`);
        if (!Array.isArray(rows) || rows.some((row) => (
          !row || typeof row.id !== 'string' ||
          (table === 'tenants' ? row.id !== tenantId : row.tenant_id !== tenantId)
        ))) {
          throw badRequest(`Snapshot contains rows outside the target tenant: ${table}`);
        }
      }

      const next = new Map(this.data);
      for (const [table, rows] of entries) {
        const current = next.get(table) ?? [];
        const preserved = table === 'tenants'
          ? current.filter((row) => row.id !== tenantId)
          : current.filter((row) => row.tenant_id !== tenantId);
        next.set(table, [...preserved, ...rows.map((row) => ({ ...row }))]);
      }
      this.data = next;
    });
    this.lock = run.catch(() => {});
    await run;
  }

  private db(): Db {
    const d = this.data;
    const touch = (r: Row) => { r.updated_at = new Date().toISOString(); };
    const mk = (r: Row): Row => ({
      ...r,
      id: r.id ?? randomUUID(),
      row_version: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    const db: Db = {
      all: (t) => [...(d.get(t) ?? [])],
      get: (t, id) => (d.get(t) ?? []).find((r) => r.id === id) ?? null,
      find: (t, p) => (d.get(t) ?? []).filter(p),
      one: (t, p) => (d.get(t) ?? []).find(p) ?? null,
      insert: (t, row) => { const r = mk(row as Row); (d.get(t) ?? d.set(t, []).get(t)!).push(r); return r; },
      update: (t, id, patch, expectedVersion) => {
        const rec = db.get(t, id);
        if (!rec) throw notFound(`${t} ${id}`);
        if (expectedVersion !== undefined && rec.row_version !== expectedVersion) {
          throw conflict('VERSION_CONFLICT', 'Record was modified concurrently; reload and retry.');
        }
        Object.assign(rec, patch, { row_version: rec.row_version + 1 });
        touch(rec);
        return rec;
      },
      tget: (t, tid, id) => { const r = db.get(t, id); return r && r.tenant_id === tid ? r : null; },
      tfind: (t, tid, p) => (d.get(t) ?? []).filter((r) => r.tenant_id === tid && p(r)),
      tone: (t, tid, p) => (d.get(t) ?? []).find((r) => r.tenant_id === tid && p(r)) ?? null,
    };
    return db;
  }
}
