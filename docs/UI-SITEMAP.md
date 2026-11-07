# UI design system + sitemap (apps/web, Next.js App Router)

## Design tokens (continuity with the approved brand table)
Light/dark pairs, CSS custom properties in `gcc-crm/apps/web/app/tokens.css`:
primary `#0F766E/#2DD4BF`, hover `#115E59/#5EEAD4`, page `#F8FAFC/#0F172A`,
cards `#FFFFFF/#1E293B`, secondary surface `#F1F5F9/#334155`, text
`#0F172A/#F8FAFC`, secondary text `#475569/#CBD5E1`, borders
`#E2E8F0/#334155`, input borders `#64748B/#94A3B8`, AI accent
`#7C3AED/#A78BFA`. Refined-neutral enterprise styling, logical CSS
properties everywhere (RTL mirror), WCAG 2.2 AA contrast targets, reduced
motion respected.

## Sitemap
```
/login /signup                          auth (Supabase Auth in prod)
/(app)
  /dashboard                            KPI cards, today, SLA alerts
  /inbox                                split-pane: list|conversation + context pane (D)
  /contacts  /contacts/:id              list + Customer 360 (timeline, associations)
  /companies /companies/:id
  /leads                                capture board, scoring, routing config
  /deals                                multi-pipeline Kanban (drag + keyboard), forecast
  /deals/:id                            opportunity detail, quotes, approvals
  /quotes /products                     commerce-adjacent (C/N)
  /tasks                                operations (L)
  /campaigns  /campaigns/:id            builder, journeys, A/B (F)
  /segments                             builder + preview counts
  /agents  /agents/:id                  AI Agent Studio: prompt, tools, knowledge, evals (E)
  /knowledge                            documents, indexing status
  /bookings                             scheduling hub (I)
  /tickets /kb                          service hub (J)
  /workflows  /workflows/:id            visual canvas + dry-run (K)
  /reports /dashboards                  analytics workspace (M)
  /ads  /social                         ads + social hubs (G,H)
  /settings
      /team /roles                      memberships, RBAC
      /fields /tags /pipelines          CRM config
      /channels                         connector health + capability states (D)
      /billing /usage                   plans, entitlements, metering (Q)
      /localization                     currency/VAT/calendar/privacy (S)
      /audit /privacy                   governance (U): audit search, DSAR
/(admin)                                super-admin console (Q/U): tenants,
                                        plans, flags, impersonation-grants, audit
```
Every list: search/filter/sort/pagination + saved views; loading/empty/error
states mandatory; command palette (⌘K) + global search across contacts/
deals/messages/tickets, permission-filtered server-side.
