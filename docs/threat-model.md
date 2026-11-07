# Threat model (STRIDE, per surface) + ASVS mapping

Scope: multi-tenant SaaS; trust boundaries = internet ↔ web ↔ API ↔ workers
↔ providers ↔ DB.

| Surface | Threat | Control |
|---|---|---|
| Web/API | Spoofed identity, token theft | Supabase JWT (prod) with aud/iss/exp validation; httpOnly cookies for web BFF; MFA policy hook (U) |
| API | IDOR / cross-tenant access (API Top-10 #1) | Every query scoped by tenant_id from verified membership, never from client input; RLS as second line; isolation tests (P1) |
| API | Broken auth on object level | Ownership/ABAC checks in domain services (e.g., contact.owner vs role) |
| Webhooks (in) | Forgery, replay, flooding | HMAC signature on raw body, timestamp window, provider event id UNIQUE dedupe, 200ms-ack + durable persist + queue (D) |
| Webhooks (out) | SSRF | Egress allowlist, no user-supplied URLs; validate host, deny private/loopback/link-local IPs |
| Workers | Re-processing side effects | Idempotency keys; at-least-once + dedupe; DLQ with alert |
| Uploads | Malicious files | MIME sniff + size caps, private bucket, signed short-lived URLs, AV scan hook (P5) |
| AI | Prompt injection via retrieved docs / provider text | Docs treated as data; tool layer re-checks permissions; allowlisted tools; approval gates on external actions; injection eval set (E) |
| AI | Cost/DoS via model abuse | Per-tenant budgets, per-run step limits, timeouts |
| Secrets | Leakage | Env/secret-manager only; provider credentials envelope-encrypted (app key from KMS) in DB; no secrets in logs; gitleaks in CI |
| Data | Exfil via exports/reports | Export jobs re-check access at execution; audit every export |
| DB | Policy bypass | FORCE RLS on tenant tables; app role is NOBYPASSRLS; migration role separate |
| Sessions | CSRF on BFF mutations | SameSite=strict + double-submit token for cookie flows |
| API abuse | Rate/scraping | Per-principal + per-tenant rate limits; pagination bounds |
| Supply chain | Dependency compromise | npm ci with lockfile, npm audit + SCA gate, SAST (CodeQL-style) in CI, DAST against staging |

ASVS L2 alignment noted per control group in remediation register
(remediation-register.md). Residual risks listed there honestly (e.g., DAST
not runnable in this environment until staging exists).
