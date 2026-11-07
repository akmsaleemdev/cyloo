# CYLOO — Integration Capability Matrix

## Policy & Honesty Declaration
Every external integration connector in CYLOO adheres to strict architectural principles:
1. **No Fake Responses**: Unconfigured adapters report status `unconfigured` and return HTTP 409 (`CHANNEL_UNCONFIGURED`) with explicit prerequisites rather than simulated success.
2. **Official APIs Only**: No scraping, unauthorized reverse engineering, or policy-violating automations.
3. **Explicit Consent & Suppression**: All outbound channels enforce verified opt-in (`consents` table) and suppression checks (`suppressions` table) before message dispatch.
4. **Tenant Isolation**: Provider credentials (`provider_credentials`) are stored using authenticated AES-GCM ciphertext (`secret_ciphertext`) with server-side key rotation (`APP_ENCRYPTION_KEY`).

---

## Detailed Channel & Platform Capability Register

| Integration Service | Supported Operations | Rate Limits & Windows | Webhooks & Idempotency | Prerequisites & Approvals | Runtime Status |
|---|---|---|---|---|---|
| **WhatsApp Cloud API (Meta)** | Two-way messaging, approved templates, media attachments, delivery receipts | 80 msg/sec (Tier 1); 24-hour customer service window; opt-in required | Inbound webhook with HMAC-SHA256 signature; deduplication on `provider_event_id` | Meta Business Account, verified phone number, WABA ID, permanent token | ⛔ Blocked (Credentials & App Review) |
| **Instagram Direct & Messenger** | Direct messages, attachment handling, private reply to comments | Platform graph limits (~200 calls/hr/user); 24-hour standard messaging window | Inbound webhook; sha256 signature validation on raw payload | Meta Developer App, `instagram_manage_messages`, Business Verification | ⛔ Blocked (App Review) |
| **TikTok Business Messaging** | Business messaging within supported geographic markets | Follows TikTok for Business API quotas | Webhook signature verification via TikTok app secret | Approved TikTok Developer App, Business Account link | ⛔ Blocked (Developer Approval) |
| **Snapchat Marketing API** | Lead generation form ingestion, Campaign insights, CAPI | Snap Conversions API rate limits | Inbound lead sync webhook; deduplication on lead ID | Snap Business Manager, OAuth 2.0 app credentials | ⛔ Blocked (OAuth Approval) |
| **First-Party Web Chat Widget** | Realtime customer chat, offline contact form, session management | 60 requests/minute per IP; bot prevention challenge | First-party endpoint `/api/v1/inbox/web-chat`; HMAC signed token | None (First-party native module) | ✅ Active & Implemented |
| **Transactional & Inbound Email** | Outbound transactional templates, bounce/complaint webhooks, inbound parsing | Provider quota (e.g. AWS SES 14/sec baseline); strict SPF/DKIM/DMARC checks | Inbound webhook from Postmark / SES; suppresses bounced recipients automatically | Verified domain, AWS SES / Postmark account, DNS records | ⛔ Blocked (Production SMTP/API Keys) |
| **SMS Gateway (GCC Aggregators)** | Transactional SMS, OTP, localized Arabic templates | Regional DLT rules (UAE TDRA / KSA CITC); strictly 09:00–21:00 marketing | Status receipt webhook; DLQ on delivery failure | Registered Sender ID with GCC telcos (Etisalat, du, STC) | ⛔ Blocked (Telco Sender ID Registration) |
| **Voice & Telephony Hub** | Inbound/outbound calling, two-party consent recording, live transcription | SIP trunk concurrency limit | Webhook for call state machine (ringing, connected, completed) | Twilio / regional SIP trunk, telephony recording legal review | ⛔ Blocked (SIP Provider & Compliance Review) |
| **Google Ads & Offline Conversions**| Lead form webhook sync, offline conversion upload (CAPI), spend telemetry | Google Ads API quota (15k ops/day standard developer token) | Google lead form webhook with secret token verification | Google Ads Manager, Developer Token approval, OAuth client | ⛔ Blocked (Developer Token Approval) |
| **Meta Ads & Lead Gen** | Instant forms lead ingest, Conversions API (CAPI) offline purchase events | Graph API rate limits (tiered by ad account) | Realtime leadgen webhook with SHA256 HMAC | Meta App Review for `leads_retrieval` and `ads_management` | ⛔ Blocked (App Review) |
| **Calendar Sync (Google & MS Graph)**| Two-way free/busy slot sync, appointment booking, calendar events | Google Calendar API / Microsoft Graph throttling quotas | Webhook push notifications for calendar modifications | Verified OAuth consent screens (Google Cloud / Azure Entra) | ⛔ Blocked (OAuth Consent Verification) |
| **AI Providers (OpenAI, Bedrock, Vertex)**| Chat completions, tool execution, text embeddings, document chunk ranking | Tenant monthly budget cap (`ai_budgets`); model rate limits | Async provider calls; token cost metering per execution | `OPENAI_API_KEY` / AWS Bedrock IAM role / Google Cloud ADC | 🔶 Gateway Contract Active (Live Keys Blocked) |
| **Payment Gateways (Stripe, GCC)** | Payment links, partial/full capture, refunds, automated invoicing | Gateway API limits (100 req/sec) | Signed webhook (`stripe-signature` / HMAC); idempotency on event ID | Gateway merchant account (Stripe, Telr, HyperPay, Network Int) | ⛔ Blocked (Merchant Gateway Approval) |

---

## 3. Integration Failure & Fallback Handling
- **Circuit Breaking**: Repeated adapter network failures trigger exponential backoff (1s, 2s, 4s, 8s) up to 3 retries.
- **Dead-Letter Queue (DLQ)**: Failed webhooks and unsent outbound notifications are persisted to `dlq_entries` with error diagnostics and payload snapshots.
- **Feature Flagging**: All unapproved or unconfigured providers are gated via `provider_accounts.status = 'unconfigured'`, preventing background dispatch attempts.
