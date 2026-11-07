# Environment variable inventory (gcc-crm)

| Variable | Used by | Required | Notes |
|---|---|---|---|
| PORT | apps/api | no (3001) | |
| NODE_ENV | all | no | |
| DATA_DIR | MemoryStore | no | dev double storage |
| DEV_AUTH_SECRET | apps/api | yes (dev) | HMAC for dev tokens; prod uses Supabase JWT (DEV_AUTH_SECRET unused) |
| SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY | web/api (prod) | at cutover | service role only in workers/api server-side |
| DATABASE_URL | not currently consumed by API | when PostgreSQL adapter is implemented | Use a least-privilege NOBYPASSRLS runtime role; migrations use a separate role |
| APP_ENCRYPTION_KEY | apps/api outbound webhook registration | required when creating webhook secrets | 32-byte AES-256-GCM key, hex or base64; store in a secret manager, never in the browser or repository |
| REDIS_URL | worker | P2 | BullMQ |
| OPENAI_API_KEY / ANTHROPIC_API_KEY | ai gateway | P3 | absent → deterministic fallback |
| AI_DEFAULT_MODEL | ai | no | |

Integration setup instructions per connector live in the integration matrix;
each adapter validates credentials at startup and reports `unconfigured`
with the exact missing prerequisite.
