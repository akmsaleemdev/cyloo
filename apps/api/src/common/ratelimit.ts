// In-memory sliding-window rate limiter (hardening, P6). Applied to
// credential endpoints. Redis-backed limiter at the production cutover.
import { StoreError } from '@crm/shared';

const buckets = new Map<string, { start: number; count: number }>();

export function checkRate(key: string, limit: number, windowMs: number): void {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now - b.start > windowMs) {
    b = { start: now, count: 0 };
    buckets.set(key, b);
  }
  b.count += 1;
  if (buckets.size > 10000) buckets.clear(); // memory guard
  if (b.count > limit) {
    throw new StoreError(429, 'RATE_LIMITED', 'Too many requests — slow down and retry shortly.');
  }
}
