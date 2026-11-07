# Production readiness: database and architecture

## Punchy summary

1. **Core stack:** Next.js 15 / React 19 web, NestJS 11 TypeScript API,
   FastAPI AI gateway, SQL migrations targeting Supabase Postgres/pgvector,
   plus BullMQ/ioredis workers. The deployed persistence path is not wired:
   the API currently uses an in-memory store.
2. **Schema risk:** source migrations declare 111 tables; all 85 runtime
   registrations and all literal API table references have SQL declarations.
   There are 26 schema-only relations. Static checks find RLS declarations for
   all 111 tables, but no migration 0004 or RLS behavior has run against Postgres.
   Migration 0003 replaces the permissive audit insert policy; 0004 keeps
   support-access tables client-denied by default.
3. **Performance bottlenecks:** MemoryStore scans arrays for predicates and
   serializes all transactions through one process-wide promise chain; the
   local event bus is synchronous/in-process; no database pagination or query
   plan evidence exists. These are scale limits, not benchmark estimates.
4. **Action:** define repositories and implement PostgreSQL persistence,
   generate types from a verified staging catalog, then validate fresh/upgrade
   migrations and real RLS in staging. Production startup now fails closed
   until persistence exists. Do not connect production or claim readiness.

## Architecture findings

- The real repository stack differs from some architecture prose: packages
  are `packages/shared` and `packages/database`; no `packages/core` exists.
- `apps/api/src/common/store.ts` wires `MemoryStore`; no `pg`-based `PgStore`
  or typed database repository was found. `DATABASE_URL` references in task
  definitions do not mean the application consumes it.
- The in-memory `Db` API accepts arbitrary JS predicates. A generic SQL
  translation would force full-table reads or unsafe query construction;
  modules need explicit parameterized repository methods.
- `MemoryStore.tx` serializes writes globally within a process. Appointment
  double-booking tests therefore do not prove cross-instance DB concurrency.
- `emitDomainEvent` invokes handlers in-process after commit (per comments);
  no transactional outbox exists in SQL. A crash between commit and event
  processing can lose work.
- Worker packages have BullMQ dependencies, but workers are explicitly idle
  without Redis. The current handlers post jobs to a workflow event endpoint;
  queue-to-domain routing and durable state need integration verification.
- The FastAPI route now awaits provider calls asynchronously. Provider
  concurrency limits, request authentication and AWS runtime behavior still
  need staging validation.
- CI now references `packages/shared` and starts local Supabase for migration
  and RLS tests; this CI path has not run in this environment.
- CLI workspace scripts and setup docs have been reconciled, but CLI commands
  have not been exercised against a local or staging database.

## Ordered action items

### P0 — block unsafe cutover

1. Reconcile runtime/API/SQL names and verify all current database contracts
   against a live staging catalog.
2. Execute and test the audit, webhook, tenant-domain, role and reseller RLS
   policies with actual database roles.
3. Establish direct-client grants policy, membership authorization, secure
   tenant context, composite tenant-aware foreign keys and private Storage RLS.
4. Verify prior SQL Editor work and migration history against staging before
   any push.

### P1 — persistence foundation

5. Define typed per-module repositories; use parameterized SQL, explicit
   transaction boundaries, pagination/cursors and expected-version updates.
6. Implement pooled Postgres adapter with TLS verification, per-transaction
   tenant context and fail-fast startup if required DB configuration is absent.
7. Add explicit relationships/profile mapping to `auth.users`; keep identities
   and password operations inside Supabase Auth.
8. Add scheduler exclusion/locking guarantees, transactional outbox,
   idempotency records, webhook retry state and durable DLQ semantics.

### P2 — operability and scale

9. Design indexes from observed query shapes and staging `EXPLAIN (ANALYZE,
   BUFFERS)`; add cursor pagination and bounded retention for high-volume event,
   message, audit and usage tables.
10. Move rate limits and job execution to shared services (Redis/Postgres),
    not per-process memory; expose queue depth, retries, DB pool saturation,
    slow query and lock metrics.
11. Make Python AI routing async and sanitize provider errors; verify provider
    timeouts/circuit breaking and tenant-budget enforcement end to end.
12. Fix CI workspace paths and add ephemeral PostgreSQL/Supabase-compatible
    migration, contract, integration and RLS gates.

## Release status

**Not staging-ready or production-ready.** No production deployment/migration
was attempted. All credentials must be rotated/managed out-of-band; none are
included in this report.
