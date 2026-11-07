// Store provider (ADR-0004). MemoryStore = explicit dev/test double with
// identical semantics. PgStore (Supabase, parameterized SQL + RLS GUC)
// implements the same TenantStore interface at cutover.
import { MemoryStore, TenantStore } from '@crm/shared';
import { PostgresStore } from './postgres-store.js';

export { PostgresStore };

export const TABLES = [
  'tenants', 'users', 'memberships', 'roles', 'departments', 'teams',
  'team_memberships', 'audit_events', 'activity_events',
  'companies', 'contacts', 'custom_field_definitions', 'custom_field_values',
  'segments', 'leads', 'lead_sources', 'scoring_rules', 'routing_rules',
  'pipelines', 'pipeline_stages', 'opportunities', 'quotes', 'quote_lines', 'quote_versions',
  'approvals', 'tasks', 'notifications', 'usage_events', 'number_sequences',
  // P2 — inbox
  'channels', 'provider_accounts', 'provider_credentials', 'conversations',
  'messages', 'message_attachments', 'message_templates', 'webhook_events',
  'delivery_receipts', 'suppressions', 'consents', 'frequency_caps', 'dlq_entries',
  // P3 — AI studio + scheduling
  'ai_conversations', 'ai_messages', 'agents', 'agent_versions', 'agent_runs',
  'tool_invocations', 'knowledge_documents', 'knowledge_chunks', 'ai_budgets',
  'staff', 'availability_rules', 'booking_pages', 'appointments', 'appointment_reminders',
  // P4 — workflows + marketing + analytics
  'workflows', 'workflow_versions', 'workflow_runs', 'workflow_steps',
  'campaigns', 'audiences', 'campaign_sends', 'attribution_touches',
  // P5 — service, commerce, social/ads
  'sla_policies', 'queues', 'tickets', 'ticket_comments', 'kb_articles',
  'csat_responses', 'nps_responses', 'portal_accounts', 'portal_grants',
  'products', 'tax_rate_versions', 'invoices', 'invoice_lines',
  'payment_links', 'gateway_events', 'social_posts',
  // P6 — developer hub, governance, platform
  'api_keys', 'outbound_webhooks', 'webhook_deliveries', 'dsar_requests',
  'resellers',
];

export function createStore(): TenantStore {
  if (process.env.DATABASE_URL) {
    return new PostgresStore({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
    });
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Production API startup is disabled until a PostgreSQL TenantStore is implemented and configured via DATABASE_URL.');
  }
  return new MemoryStore(TABLES);
}

export const store = createStore();

export const STORE_TOKEN = 'TENANT_STORE';
