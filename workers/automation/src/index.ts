// @crm/worker-automation — workflow/DLQ maintenance worker (ADR-0008).
// Responsibilities at the Redis cutover: delayed `wait` steps, retry sweeps
// for dead workflow steps, DLQ replay alerts. Same honest idle state without
// REDIS_URL (the in-process executor covers local runs).
const REDIS_URL = process.env.REDIS_URL || '';

async function main() {
  if (!REDIS_URL) {
    console.log('[worker-automation] REDIS_URL not set — idle (declared dev state, ADR-0008).');
    setInterval(() => {}, 1 << 30);
    return;
  }
  const { Worker } = await import('ioredis').then(() => import('bullmq') as any);
  new Worker(
    'automation',
    async (job: { data: { kind: string; payload: Record<string, unknown> } }) => {
      const base = process.env.API_INTERNAL_URL || 'http://localhost:3001';
      const res = await fetch(`${base}/api/v1/workflows/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: job.data.kind, payload: job.data.payload }),
      });
      if (!res.ok) throw new Error(`automation handler failed: HTTP ${res.status}`);
    },
    { connection: { url: REDIS_URL }, concurrency: 3 },
  );
  console.log('[worker-automation] consuming "automation"');
}

main().catch((e) => {
  console.error('[worker-automation] fatal', e);
  process.exit(1);
});
