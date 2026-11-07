#!/usr/bin/env node
// Simple load probe (no external deps): concurrency against a target.
// Usage: node scripts/load.mjs [url] [concurrency] [totalRequests]
// NOTE: dev-store numbers only — NOT production performance evidence.
const url = process.argv[2] || 'http://localhost:3001/api/docs';
const CONC = Number(process.argv[3] || 20);
const TOTAL = Number(process.argv[4] || 500);

const latencies = [];
let errors = 0;
async function worker() {
  while (latencies.length + errors < TOTAL) {
    const t0 = performance.now();
    try {
      const res = await fetch(url);
      if (!res.ok) errors++;
    } catch { errors++; }
    latencies.push(performance.now() - t0);
  }
}
const t0 = performance.now();
await Promise.all(Array.from({ length: CONC }, worker));
const wall = (performance.now() - t0) / 1000;
latencies.sort((a, b) => a - b);
const p = (q) => Math.round(latencies[Math.floor(latencies.length * q)]);
console.log(JSON.stringify({
  url, concurrency: CONC, total: latencies.length, errors,
  wall_seconds: Math.round(wall * 10) / 10,
  rps: Math.round(latencies.length / wall),
  p50_ms: p(0.5), p95_ms: p(0.95), p99_ms: p(0.99),
  note: 'dev-store probe; production budgets live in docs/gcccrm (promoted targets, not measured here)',
}));
