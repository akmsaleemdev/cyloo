// Domain event bus (Phase 4). Module code emits; the WorkflowModule subscribes
// at bootstrap. Handlers run AFTER the emitting transaction commits (the
// MemoryStore serializes; PgStore cutover uses the transactional outbox).
export type DomainEvent = { tenant_id: string; key: string; payload: Record<string, unknown>; idempotency_key?: string };
type Handler = (e: DomainEvent) => void;

const handlers = new Set<Handler>();

export function onDomainEvent(h: Handler) {
  handlers.add(h);
  return () => handlers.delete(h);
}

export function emitDomainEvent(tenantId: string, key: string, payload: Record<string, unknown>, idempotencyKey?: string) {
  const e: DomainEvent = { tenant_id: tenantId, key, payload, idempotency_key: idempotencyKey };
  for (const h of handlers) {
    try { h(e); } catch (err) { console.error('[events] handler error', err); }
  }
}
