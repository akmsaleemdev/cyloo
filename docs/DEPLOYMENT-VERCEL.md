# Vercel deployment guide (web) + backend placement decision

## Architecture decision (required by the audit prompt)
| Component | Runs where | Why |
|---|---|---|
| apps/web (Next.js) | **Vercel** | SSR + static, edge CDN, preview envs — ideal fit |
| apps/api (NestJS) | **Vercel Functions OK initially → dedicated container at scale** | stateless REST fits serverless; webhook ingest + queues need long-running execution at volume |
| apps/worker (BullMQ) + AI service (FastAPI) | **NOT Vercel** — AWS ECS/Fargate or Render | long-running jobs, outbound calls, streaming AI — never force into serverless |

## Steps (executed by you — I hold no Vercel credentials)
1. `cd gcc-crm/apps/web && npx vercel login` → link project (`vercel link`).
2. Framework auto-detected (Next.js). Build `next build`, install `npm ci`.
3. Environment variables (Project → Settings → Environment Variables):
   - `NEXT_PUBLIC_API_URL` = your API base (Preview + Production values differ)
   - `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (at cutover)
   - Browser-safe (`NEXT_PUBLIC_*`) only here; service keys NEVER in web env.
4. Deploy API: `vercel --prod` from apps/api with `api/dist` serverless entry,
   **or** deploy the Dockerfile to ECS/Render for webhook+queue longevity
   (recommended once WhatsApp volume is real).
5. Environments: use Vercel Preview URLs per PR; Production branch = `main`.
6. Custom domain: Settings → Domains → add `app.yourdomain.ae` → create the
   CNAME record shown → SSL auto-issued (Let's Encrypt) — verify with
   `curl -I https://app.yourdomain.ae` (HTTP/2 + `strict-transport-security`).
7. Webhooks (providers) point at the API deployment, not the web app.
8. CI/CD: GitHub → repo Settings → Vercel GitHub App (auto preview deploys);
   `.github/workflows/gcc-crm.yml` already gates merges on tests/builds.
9. Rollback: Deployments → previous production → "Promote to Production"
   (instant); database rollbacks follow docs/runbooks.
10. Observability: Vercel Analytics + runtime logs; wire Sentry (both DSNs in
    env reference) for error tracking.

## Verification checklist post-deploy
- [ ] Preview deploy of a PR renders /login (HTTPS, padlock)
- [ ] `NEXT_PUBLIC_API_URL` points at the staging API; login works E2E
- [ ] Production protection ON (Vercel Authentication for previews)
- [ ] Custom domain resolves; SSL valid; HSTS present
- [ ] Rollback rehearsed once (promote previous deployment)
