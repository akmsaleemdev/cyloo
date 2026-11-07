# Security assessment & remediation register (living)

| # | Finding / risk | Severity | Status | Owner | Notes |
|---|---|---|---|---|---|
| R-01 | No local Postgres runtime (Docker/Podman unavailable) → migrations/RLS untested at runtime | High | Open (blocked) | DBA | SQL+pgTAP sources ready; validate on local Supabase and isolated staging |
| R-02 | Provider credentials absent → connectors disabled (never faked) | Info | Accepted | Eng | Matrix shows unconfigured states |
| R-03 | Playwright browsers unavailable → visual/a11y baselines staged | Medium | Open | FE | next build gate only, for now |
| R-04 | API uses MemoryStore; no PostgreSQL adapter is implemented | High | Open (blocks production) | BE | A generic adapter is unsafe because Db uses JavaScript predicates; implement typed repositories and a real TenantStore |
| R-05 | DAST/load tests require staging | Medium | Open | DevOps | Phase 6 |
| R-06 | VAT rates must be verified vs official sources before production | High | Open (gate) | Finance eng | tax_rate_versions.source_url enforced |
| R-07 | Secrets: dev tokens only; prod requires secret manager + envelope keys | High | Open | Sec | No secrets committed (verified) |
| R-08 | AI live calls need provider keys + data-policy review | Medium | Open | AI | Offline eval harness planned P3 |

Verified in this environment: no credentials are included in these reports;
request validation, outbound webhook host checks, rate limits on auth
endpoints, and in-memory RBAC/isolation tests are present. SQL persistence and
database RLS have not been verified.
