// @crm/worker-messaging — BullMQ worker (ADR-0008 cutover boundary).
// Contract (identical semantics proven by the API e2e suite): at-least-once,
// idempotent handlers, bounded retries, DLQ. With REDIS_URL unset the worker
// starts in an honest idle state — it never fakes processing.
const REDIS_URL = process.env.REDIS_URL || '';
const QUEUES = ['inbox-events', 'outbound-webhooks'] as const;

async function main() {
  if (!REDIS_URL) {
    console.log(
      '[worker-messaging] REDIS_URL not set — BullMQ consumer idle (declared ' +
        'dev state; the in-process executor inside apps/api covers local runs ' +
        'per ADR-0008). Set REDIS_URL to consume live queues.',
    );
    setInterval(() => {}, 1 << 30); // keep the process alive for orchestration
    return;
  }
  // Cutover path: BullMQ consumer per queue. Handlers call the API's internal
  // processor endpoints with the job payload (idempotency enforced API-side).
  const { Worker } = await import('ioredis').then(() => import('bullmq') as any);
  for (const queue of QUEUES) {
    new Worker(
      queue,
      async (job: { id?: string; data: unknown }) => {
        const base = process.env.API_INTERNAL_URL || 'http://localhost:3001';
        const res = await fetch(`${base}/api/v1/workflows/events`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(job.data),
        });
        if (!res.ok) throw new Error(`handler failed: HTTP ${res.status}`); // → BullMQ retry
      },
      { connection: { url: REDIS_URL }, concurrency: 5 },
    );
    console.log(`[worker-messaging] consuming "${queue}"`);
  }
}

main().catch((e) => {
  console.error('[worker-messaging] fatal', e);
  process.exit(1);
});
