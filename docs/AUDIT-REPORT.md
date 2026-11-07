# Final technical audit & remediation report (2026-11-05)

Scope: enterprise-crm tree (packages/shared, packages/database, apps/api,
apps/web, scripts) + the preserved BMSSYS reference build.

## Findings fixed in this pass
| # | Severity | Finding | Fix | Evidence |
|---|---|---|---|---|
| F-01 | **High** | Portal login had NO rate limit → credential brute-force vector | `checkRate(10/min)` on `/api/v1/portal/login` (dev/token already guarded) | code; manual smoke |
| F-02 | **High** | Web client left dead UI on expired sessions (401 unhandled) | Central 401 handler: token purge + `/login?expired=1&next=…` redirect | code: lib/api.ts |
| F-03 | Medium | No offline detection / network-failure UX | `navigator.onLine` banner + typed `OfflineError` | code: layout, lib/api |
| F-04 | Medium | Fetches could hang indefinitely (slow network) | 20s AbortController timeout → typed TIMEOUT error | code: lib/api |
| F-05 | Medium | No React error boundary → white screen on render errors | `app/error.tsx` with retry + digest, `app/not-found.tsx` | build |
| F-06 | Low | Contacts search conflated "no results" with "empty DB" | Distinct no-results state with clear-search action | code |
| F-07 | Low | `npm audit` reported low-severity advisory noise | Reviewed: no high/critical in prod deps; advisories in dev-only tooling; lockfile pinned; gate `--audit-level=critical` in CI | CI config |

## Verified clean
- **Secret scan**: no credentials/keys/passwords in gcc-crm sources (grep patterns: provider keys, private-key blocks, seeded passwords) — the BMSSYS reference build's demo credentials are documented dev fixtures in its own README, not used by gcc-crm.
- **No TODO/FIXME debt** in shipped code.
- **Tenant isolation**: 90-check suite includes cross-tenant 404s, portal ungranted == 404, API-key tenant scoping, suspended-tenant cutoff.
- **Injection/SSRF**: Zod validation on request bodies and an SSRF host blocklist on outbound webhook URLs. The API has no SQL persistence adapter, so SQL query parameterization and database RLS remain unverified.
- **Money integrity**: server-computed minor-unit totals everywhere; client numbers never trusted (e2e-pinned AED/KWD vectors).

## Residual risks (open, tracked in remediation-register.md)
| Severity | Risk | Gate |
|---|---|---|
| High | Migrations and RLS/pgTAP unexecuted at runtime; no PostgreSQL adapter exists | Staging database + persistence implementation |
| High | VAT rates are tenant-configured — official FTA/ZATCA verification is a human gate before go-live | recorded per rate (source_url + verified_on enforced) |
| Medium | In-memory rate limiter + MemoryStore → single-node only | Shared rate limiter + PostgreSQL persistence |
| Medium | Playwright WCAG + DAST + external pen test not run | staging environment |
| Low | Arabic long-form content EN-first | content sprint |
