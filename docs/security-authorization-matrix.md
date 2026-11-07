# CYLOO — Security & Authorization Matrix

## 1. Zero-Trust Access Model
CYLOO enforces strict multi-tenant isolation, deny-by-default access control, and least-privilege role scoping at three distinct architectural layers:
1. **Database Layer (RLS)**: PostgreSQL Row-Level Security checks `tenant_id = current_tenant_id()` on all tenant tables. Client roles have zero bypass permissions.
2. **Application Layer (API Guards)**: NestJS `TenancyService` evaluates caller memberships, role permissions, department/team scoping, and explicit sensitive data rights before any business logic executes.
3. **AI Execution Layer (Governed Tools)**: AI tool calls run under the authenticated user's context; model-asserted privileges are discarded, and mutations require SHA-256 bound approvals.

---

## 2. Role Scoping & Hierarchy

| Role Identity | Scope & Authority Boundary | Cross-Tenant Allowed? | Sensitive Data Access |
|---|---|---|---|
| **Standard User (`rep`)** | Assigned, owned, or explicitly shared records within assigned department/team. | ❌ Never | Denied by default; requires explicit grant |
| **Team Leader (`lead`)** | Team records and direct-report assigned records within tenant. | ❌ Never | Denied by default |
| **Department Manager (`manager`)** | Department-scoped records within tenant. Cross-department access requires explicit tenant-admin grant. | ❌ Never | Requires `sensitive.finance.read` / `sensitive.customer.read` |
| **Tenant Admin (`admin`)** | Full organization administration within tenant; manages users, roles, billing, and settings. | ❌ Never | Permitted within tenant |
| **Tenant Owner (`owner`)** | Organization owner; billing, plan lifecycle, API keys, and full tenant administration. | ❌ Never | Permitted within tenant |
| **Platform Super Admin** | Platform infrastructure, billing catalog, and tenant lifecycle control. **Zero default visibility** into tenant CRM business data. | Controlled lifecycle only | ❌ Denied without emergency tenant consent |
| **Platform Support** | Temporary, incident-linked, MFA-verified, independently approved, tenant-admin approved, read-only by default. Max 60-minute auto-expiry. | ❌ Standing access prohibited | Tamper-evident audit logged per operation |

---

## 3. Granular Permission Matrix

| Module & Domain | Operation | Required Permission | Allowed Roles (Default) | Scope Enforcement Rules |
|---|---|---|---|---|
| **CRM Contacts** | Read | `crm.contacts.read` | `owner`, `admin`, `manager`, `rep` | Rep: assigned/owned; Manager: department; Admin: tenant-wide |
| **CRM Contacts** | Write / Create | `crm.contacts.write` | `owner`, `admin`, `manager`, `rep` | Rep: sets owner to self; department inherited |
| **CRM Sensitive** | Read PII / Customer Data | `sensitive.customer.read` | `owner`, `admin` (or explicit grant) | Required by AI tools for contact search |
| **Leads** | Read / Convert | `leads.read`, `leads.convert`| `owner`, `admin`, `manager`, `rep` | Idempotent conversion creates contact, company, opportunity |
| **Sales Deals** | Read / Update Stage | `sales.deals.read`, `write` | `owner`, `admin`, `manager`, `rep` | Pipeline stage transitions validated against DAG |
| **Sales Finance** | Read Pipeline Valuation | `sensitive.finance.read` | `owner`, `admin` (or explicit grant) | AI tool `sales.pipeline_summary` enforces server re-check |
| **Quotes & Pricing** | Create / Approve | `sales.quotes.write`, `approve` | `owner`, `admin`, `manager` | Discounts > threshold require manager approval |
| **Unified Inbox** | View Conversations | `inbox.conversations.read` | `owner`, `admin`, `manager`, `agent` | Scoped to assigned channel or department |
| **Unified Inbox** | Send Outbound Messages | `inbox.messages.send` | `owner`, `admin`, `agent` | Requires opt-in consent; suppression check enforced |
| **AI Studio** | Chat / Execute Agents | `ai.agents.execute` | `owner`, `admin`, `manager`, `rep` | Tool calls re-verify permissions at execution time |
| **AI External Actions**| Send Email / Dispatch | `ai.actions.external` | Requires SHA-256 Approval | Human-in-the-loop approval bound to payload hash |
| **Marketing** | Campaign Send | `marketing.campaigns.send` | `owner`, `admin`, `marketer` | Consent + frequency cap (max 2/24h default) enforced |
| **Service Tickets** | Manage / Escalate | `service.tickets.write` | `owner`, `admin`, `support_rep` | SLA timer tracked; automatic escalation on breach |
| **Customer Portal** | View Granted Ticket | Portal Account Token | `portal_customer` | Isolated to `portal_grants` resource_id; 404 for ungranted |
| **Commerce Invoices**| Issue / Pay | `commerce.invoices.write` | `owner`, `admin` | Tax rate locked to versioned rate; number sequenced |
| **Developer API** | Manage Keys & Webhooks | `platform.api_keys.manage` | `owner`, `admin` | Plaintext key shown once; SHA-256 hash stored |
| **Privacy (DSAR)** | Export / Anonymize | `platform.privacy.dsar` | `owner`, `admin` | Audited access log; automated PII redaction |

---

## 4. Platform Support Access Zero-Trust Architecture
As codified in migration `0004_zero_trust_authorization.sql`:
1. **No Standing Privileges**: Tables `support_access_requests`, `support_access_approvals`, and `support_access_audit` have **FORCE RLS** enabled with zero client policies. Only trusted server backend workers can access them.
2. **Two-Party Approval Required**:
   - Platform supervisor approval recorded in `support_access_approvals`.
   - Tenant Administrator explicit grant recorded in `support_access_approvals`.
3. **Time-Bounded Grants**: Requests enforce `expires_at <= now() + interval '60 minutes'`.
4. **Tamper-Evident Audit Trail**: Every SQL query executed under an active support session writes an immutable event to `support_access_audit`. Triggers prevent modification or deletion.

---

## 5. Security Verification & Test Coverage
- **Cross-Tenant Isolation**: Verified in `packages/database/supabase/tests/rls.test.sql` and `apps/api/e2e/api.e2e.spec.ts`. Cross-tenant reads return 0 rows or 404; cross-tenant writes trigger PostgreSQL error `42501` or 404.
- **Audit Tamper Resistance**: Triggers on `audit_events` and `activity_events` reject `UPDATE` and `DELETE` operations even from authenticated tenant roles.
- **Webhook Replay Protection & Signature Verification**: Verified in `apps/api/e2e/inbox.e2e.spec.ts` using HMAC-SHA256 signatures, timestamp window verification, and provider event ID deduplication.

