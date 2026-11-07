# Test strategy

| Layer | Tool | What runs now (this environment) |
|---|---|---|
| Unit — core (schemas, money, RBAC, scoring) | vitest | ✅ runs locally |
| API integration (NestJS e2e via supertest, MemoryStore) | vitest | ✅ runs locally — tenant isolation, RBAC, state machines, idempotency, webhook dedupe |
| Contract | generated OpenAPI snapshot diff | ✅ |
| DB — RLS + constraints | pgTAP against Supabase (docker/creds) | ⛔ blocked — SQL + test plan delivered, runs at cutover |
| Web | next build + component smoke | ✅ build gate; interactive browser tests need Playwright install (next) |
| E2E browser | Playwright, 1440/1024/768/390, RTL+dark baselines | ⛔ browsers not installed in env — staged |
| Security | npm audit / gitleaks / SAST in CI | CI config delivered; gitleaks run when network policy allows |
| Load | k6 on staging | ⛔ staged |
| AI evals | offline eval harness (fixtures, no live calls) + injection set | ✅ harness in P3 |

Failure-recovery tests: webhook out-of-order + duplicate replay; worker retry
then DLQ; provider outage → deterministic fallback; idempotent lead convert.

Evidence rule: every claim of "tested" links to a suite in this repo;
anything not runnable here is listed blocked in remediation-register.md.
