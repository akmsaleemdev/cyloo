# API credential & integration inventory (complete)

Status legend: ✅ operational · 🔶 adapter done, needs credentials · ⛔ blocked
(approval/review). Verify each provider's CURRENT requirements at its official
docs URL before enabling — requirements change; nothing here is assumed.

| Integration | Purpose | Docs | Auth | Env vars (server unless noted) | Cost | Approval | Status |
|---|---|---|---|---|---|---|---|
| **WhatsApp Business (Cloud API)** | WhatsApp inbox + campaigns | developers.facebook.com/docs/whatsapp | System-user token + HMAC webhook | `WA_TOKEN`, `WA_PHONE_ID`, `WA_WABA_ID`, `WA_VERIFY_TOKEN`, `WA_WEBHOOK_SECRET` | Per-conversation pricing | Meta app review (business verification) | ⛔ |
| **Instagram Messaging** | IG DMs inbox | developers.facebook.com/docs/messenger-platform/instagram | Meta OAuth token | `IG_TOKEN`, `IG_ACCOUNT_ID` | Free + usage | App review `instagram_manage_messages` | ⛔ |
| **Facebook Messenger** | FB page DMs | developers.facebook.com/docs/messenger-platform | Page token | `FB_PAGE_TOKEN` | Free + usage | App review `pages_messaging` | ⛔ |
| **TikTok Business Messaging** | TikTok DMs (supported scope) | developers.tiktok.com | OAuth | `TIKTOK_CLIENT_KEY/SECRET` | Free + usage | TikTok app approval — VERIFY current availability | ⛔ |
| **Snapchat Marketing/Lead** | Lead forms + ads | developers.snap.com | OAuth 2.0 | `SNAP_CLIENT_ID/SECRET` | Free | Scope verification | ⛔ |
| **Web chat (first-party)** | Website live chat | internal | Widget key | — (key per channel in DB) | Free | none | ✅ |
| **Email (transactional)** | Campaigns/receipts/notifications | e.g. postmarkapp.com or SES docs | API key | `EMAIL_API_KEY`, `EMAIL_FROM` | ~$15/mo tier | Domain SPF/DKIM setup | ⛔ |
| **SMS** | OTP + campaigns | e.g. twilio.com/docs or local aggregator | API key/sid | `SMS_SID`, `SMS_TOKEN`, `SMS_FROM` | Per SMS | Sender ID registration (per country) | ⛔ |
| **Voice/Telephony (O)** | Inbound/outbound calls | twilio.com/docs/voice | API key/sid | `VOICE_SID`, `VOICE_TOKEN`, `VOICE_NUMBER` | Per minute | Numbers + recording-consent policy | ⛔ |
| **Google Ads** | Lead forms, spend, offline conversions | developers.google.com/google-ads | OAuth2 + dev token | `GOOGLE_ADS_TOKEN`, `GOOGLE_ADS_CLIENT_ID/SECRET`, `GOOGLE_ADS_REFRESH` | Free API | Developer-token approval | ⛔ |
| **Meta Marketing API** | Ads metrics + CAPI | developers.facebook.com/docs/marketing-api | OAuth | `META_ADS_TOKEN` | Free | App review `ads_management` | ⛔ |
| **TikTok / Snapchat Ads** | Ads metrics + lead forms | per-provider dev portals | OAuth | `TIKTOK_ADS_*`, `SNAP_ADS_*` | Free | Developer approval | ⛔ |
| **GA4 + GTM** | Web analytics (Conversion Hub) | developers.google.com/analytics | Measurement ID | `NEXT_PUBLIC_GA4_ID` (browser) | Free | none | ⛔ |
| **Google Calendar** | 2-way booking sync | developers.google.com/calendar | OAuth2 | `GOOGLE_CAL_CLIENT_ID/SECRET` | Free | OAuth consent screen verified | ⛔ |
| **Microsoft Graph Calendar** | 2-way booking sync | learn.microsoft.com/graph | OAuth2 | `MS_CAL_CLIENT_ID/SECRET` | Free | Entra admin consent | ⛔ |
| **Stripe** | Subscriptions + payment links | stripe.com/docs/api | Secret key + HMAC webhooks | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | 2.9%+ | Account activation | ⛔ (sandbox contract proven) |
| **GCC gateways** (Telr / N-Genius / HyperPay) | Local cards (KNET, NAPS) | per-gateway docs | Keys + HMAC | `GCC_GW_*` | Per-transaction | Merchant onboarding (trade licence) | ⛔ |
| **Supabase** | DB/Auth/Storage/Realtime | supabase.com/docs | Keys | see SUPABASE-SETUP.md | $25+/mo | none | 🔶 (schema ready) |
| **Redis (Upstash/ElastiCache)** | BullMQ queues, rate limits | upstash.com/docs | URL/token | `REDIS_URL` | ~$10/mo | none | ⛔ (contracts proven) |
| **OpenAI** | AI agents + embeddings | platform.openai.com/docs | API key | `OPENAI_API_KEY` | Usage-based | none | ⛔ (governance live) |
| **Anthropic** | Model fallback | docs.anthropic.com | API key | `ANTHROPIC_API_KEY` | Usage-based | none | ⛔ |
| **AWS Bedrock / Vertex** | Regional model routing | aws.amazon.com/bedrock | IAM/OAuth | `AWS_*` / `GCP_*` | Usage-based | Cloud account | ⛔ |
| **Sentry** | Error tracking | docs.sentry.io | DSN | `SENTRY_DSN` (server) + `NEXT_PUBLIC_SENTRY_DSN` | Free tier | none | ⛔ |

**MVP classification**: Mandatory = Supabase, Vercel, web chat, Stripe (or one
GCC gateway), OpenAI OR Anthropic, email provider. Recommended = WhatsApp,
Redis, Sentry, GA4. Optional/Enterprise = TikTok/Snapchat/voice/calendar sync.
No paid duplicate services; open-source alternatives noted where viable
(self-host n8n exists for workflows but the built-in engine covers it).
