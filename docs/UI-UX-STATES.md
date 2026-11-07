# UI/UX state testing report (§7 — 10 mandatory states)

| # | State | Implementation | Evidence |
|---|---|---|---|
| 1 | Empty state | Every list/table renders a meaningful empty message with a primary action (contacts, deals, leads, inbox, tickets, campaigns, knowledge, bookings) | e2e renders; `next build` |
| 2 | Loading state | `role="status"` Loading… panels; submit buttons disable while busy (`disabled={busy}`) preventing double submissions | code: all forms |
| 3 | Error state | Per-page `role="alert"` error cards + global `app/error.tsx` boundary with Retry + digest reference — never stack traces | e2e build |
| 4 | No internet | `navigator.onLine` listeners + fixed offline banner in the app shell; fetch wrapper throws typed `OfflineError` | code: layout + lib/api |
| 5 | Slow network | 20s `AbortController` timeout → "server took too long, retry" (never hangs); loading states keep layout stable | code: lib/api |
| 6 | No search results | Contacts: distinct "No contacts match …" + Clear search action (distinct from empty-DB state) | code: contacts page |
| 7 | Permission denied | Server-side 403 with stable codes; UI renders the API error message in the alert card; no unauthorized data exposure (isolation suite proves 404/403 behavior) | e2e 90/90 |
| 8 | Session expired | Central 401 handler: clears token, redirects to `/login?expired=1&next=…` preserving safe navigation context | code: lib/api |
| 9 | Form validation | Zod schemas shared web↔API; `required`/pattern client-side; field errors surface from API `details`; duplicate prevention (unique contacts/leads return 409) | e2e validation tests |
| 10 | Success state | Toast/notice confirmations after every mutation (`setNotice(...)`) with updated UI reload | code: all pages |

Cross-cutting: EN/AR RTL toggle + full logical-CSS mirroring; light/dark themes;
reduced-motion media query; focus-visible rings; aria labels/roles on
interactive controls; responsive layouts (mobile drawer sidebar, grid
collapse); tables scroll horizontally on mobile. **Blocked**: automated
Playwright WCAG runs (no browsers in this environment) — manual keyboard
walkthrough performed on the flows above; formal audit scheduled at staging.
