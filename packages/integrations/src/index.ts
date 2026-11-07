// @crm/integrations — provider capability descriptors + adapter contracts.
// Single source of truth for the integration matrix (docs/INTEGRATION-INVENTORY.md):
// every connector declares supported operations, prerequisites and honest
// status. Adapters MUST report `unconfigured` until credentials validate —
// never fake success (docs/gcccrm/ARCHITECTURE.md ADR-0005).

export type ChannelKind =
  | 'whatsapp' | 'instagram' | 'messenger' | 'tiktok' | 'snapchat'
  | 'webchat' | 'email' | 'sms' | 'voice';

export interface ChannelCapability {
  ops: string[];            // declared supported operations
  prerequisites: string;    // exact credentials/approvals required
  note: string;             // honest status note surfaced in the UI
}

export const CHANNEL_CAPABILITIES: Record<ChannelKind, ChannelCapability> = {
  webchat: { ops: ['receive', 'send', 'media', 'receipts'], prerequisites: 'none (first-party)', note: 'Fully operational.' },
  whatsapp: { ops: ['receive', 'send', 'templates', 'media', 'receipts'], prerequisites: 'WABA account, phone number, Meta app review, permanent token, webhook verify', note: 'Blocked until credentials + app review (integration matrix).' },
  instagram: { ops: ['receive', 'send', 'media', 'receipts'], prerequisites: 'Meta app + IG business account + instagram_manage_messages review', note: 'Blocked until app review.' },
  messenger: { ops: ['receive', 'send', 'media', 'receipts'], prerequisites: 'Meta app + pages_messaging review', note: 'Blocked until app review.' },
  tiktok: { ops: ['receive', 'send'], prerequisites: 'TikTok for Business approval; verify current API availability', note: 'Blocked until approval.' },
  snapchat: { ops: ['lead_forms', 'ads_metrics'], prerequisites: 'Snap app + OAuth; messaging scope verification', note: 'Marketing/lead scope only.' },
  email: { ops: ['receive', 'send', 'templates', 'receipts'], prerequisites: 'Transactional provider account + inbound mailbox', note: 'Blocked until credentials.' },
  sms: { ops: ['send', 'receipts'], prerequisites: 'Gateway account + sender ID approval per country', note: 'Blocked until credentials.' },
  voice: { ops: ['receive', 'send', 'recording', 'transcription'], prerequisites: 'Telephony provider + numbers + recording-consent policy', note: 'Phase 5.' },
};

export const CONSENT_REQUIRED_CHANNELS: ChannelKind[] = ['whatsapp', 'email', 'sms'];

// Canonical inbound provider event (ADR-0005) — normalized by every adapter.
export interface ProviderInboundEvent {
  event_id: string;                       // unique per provider account → dedupe
  type: 'message.in' | 'delivery.receipt' | 'message.failed';
  account_ref: string;                    // provider account / chat ref
  data: {
    session_ref?: string;
    text?: string;
    provider_message_id?: string;
    status?: 'sent' | 'delivered' | 'read' | 'failed';
    visitor_name?: string;
    error_code?: string;
    timestamp?: string;
  };
}

// Every adapter implements this; `configured()` gates sending honestly.
export interface ChannelAdapter {
  kind: ChannelKind;
  configured(): boolean;
  send(args: { to: string; body: string; templateId?: string }): Promise<{ providerMessageId: string }>;
}

// Ads connector registry descriptors (H) — honest unconfigured states.
export const ADS_CONNECTORS = [
  { provider: 'google_ads', status: 'unconfigured', prerequisites: 'developer token + OAuth + API ACLs' },
  { provider: 'meta_ads', status: 'unconfigured', prerequisites: 'app review: ads_management + Conversions API' },
  { provider: 'tiktok_ads', status: 'unconfigured', prerequisites: 'developer approval; verify current API availability' },
  { provider: 'snapchat_ads', status: 'unconfigured', prerequisites: 'Snap app + OAuth scope verification' },
] as const;
