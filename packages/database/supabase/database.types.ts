export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      activity_events: {
        Row: {
          actor_id: string | null
          actor_type: string
          entity: string
          entity_id: string
          id: number
          kind: string
          occurred_at: string
          payload: Json
          tenant_id: string
          trace_id: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_type?: string
          entity: string
          entity_id: string
          id?: number
          kind: string
          occurred_at?: string
          payload?: Json
          tenant_id: string
          trace_id?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_type?: string
          entity?: string
          entity_id?: string
          id?: number
          kind?: string
          occurred_at?: string
          payload?: Json
          tenant_id?: string
          trace_id?: string | null
        }
        Relationships: []
      }
      agent_runs: {
        Row: {
          agent_id: string | null
          conversation_id: string | null
          cost_micro: number | null
          engine: string | null
          fallback_used: boolean | null
          finished_at: string | null
          id: string
          started_at: string
          status: string
          tenant_id: string
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          agent_id?: string | null
          conversation_id?: string | null
          cost_micro?: number | null
          engine?: string | null
          fallback_used?: boolean | null
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
          tenant_id: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          agent_id?: string | null
          conversation_id?: string | null
          cost_micro?: number | null
          engine?: string | null
          fallback_used?: boolean | null
          finished_at?: string | null
          id?: string
          started_at?: string
          status?: string
          tenant_id?: string
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_conversation_same_tenant_fk"
            columns: ["tenant_id", "conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      agent_versions: {
        Row: {
          agent_id: string
          id: string
          model_policy: Json
          system_prompt: string
          tenant_id: string
          tool_allowlist: string[]
          version: number
        }
        Insert: {
          agent_id: string
          id?: string
          model_policy?: Json
          system_prompt: string
          tenant_id: string
          tool_allowlist?: string[]
          version: number
        }
        Update: {
          agent_id?: string
          id?: string
          model_policy?: Json
          system_prompt?: string
          tenant_id?: string
          tool_allowlist?: string[]
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "agent_versions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          active_version: number
          created_at: string
          id: string
          kind: string
          languages: string[]
          name: string
          tenant_id: string
        }
        Insert: {
          active_version?: number
          created_at?: string
          id?: string
          kind: string
          languages?: string[]
          name: string
          tenant_id: string
        }
        Update: {
          active_version?: number
          created_at?: string
          id?: string
          kind?: string
          languages?: string[]
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_budgets: {
        Row: {
          monthly_cost_micro: number
          monthly_tokens: number
          period: string
          tenant_id: string
        }
        Insert: {
          monthly_cost_micro?: number
          monthly_tokens?: number
          period: string
          tenant_id: string
        }
        Update: {
          monthly_cost_micro?: number
          monthly_tokens?: number
          period?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_budgets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_conversations: {
        Row: {
          agent_id: string | null
          created_at: string
          id: string
          row_version: number
          tenant_id: string
          title: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          agent_id?: string | null
          created_at?: string
          id?: string
          row_version?: number
          tenant_id: string
          title: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          agent_id?: string | null
          created_at?: string
          id?: string
          row_version?: number
          tenant_id?: string
          title?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_agent_same_tenant_fk"
            columns: ["tenant_id", "agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "ai_conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          citations: Json
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          row_version: number
          run_id: string | null
          tenant_id: string
          tools: Json
        }
        Insert: {
          citations?: Json
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          row_version?: number
          run_id?: string | null
          tenant_id: string
          tools?: Json
        }
        Update: {
          citations?: Json
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          row_version?: number
          run_id?: string | null
          tenant_id?: string
          tools?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_same_tenant_fk"
            columns: ["tenant_id", "conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "ai_messages_run_same_tenant_fk"
            columns: ["tenant_id", "run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "ai_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      api_keys: {
        Row: {
          created_at: string
          id: string
          key_hash: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          scopes: string[]
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          key_hash: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
          scopes?: string[]
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          key_hash?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          scopes?: string[]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "api_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_reminders: {
        Row: {
          appointment_id: string
          channel_kind: string
          id: number
          send_at: string
          status: string
          tenant_id: string
        }
        Insert: {
          appointment_id: string
          channel_kind: string
          id?: number
          send_at: string
          status?: string
          tenant_id: string
        }
        Update: {
          appointment_id?: string
          channel_kind?: string
          id?: number
          send_at?: string
          status?: string
          tenant_id?: string
        }
        Relationships: []
      }
      appointments: {
        Row: {
          booking_page_id: string | null
          contact_id: string | null
          created_at: string
          ends_at: string
          id: string
          row_version: number
          staff_id: string | null
          starts_at: string
          status: string
          tenant_id: string
          timezone: string
        }
        Insert: {
          booking_page_id?: string | null
          contact_id?: string | null
          created_at?: string
          ends_at: string
          id?: string
          row_version?: number
          staff_id?: string | null
          starts_at: string
          status?: string
          tenant_id: string
          timezone: string
        }
        Update: {
          booking_page_id?: string | null
          contact_id?: string | null
          created_at?: string
          ends_at?: string
          id?: string
          row_version?: number
          staff_id?: string | null
          starts_at?: string
          status?: string
          tenant_id?: string
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_booking_page_id_fkey"
            columns: ["booking_page_id"]
            isOneToOne: false
            referencedRelation: "booking_pages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      approvals: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          payload: Json
          payload_hash: string
          policy: string
          requested_by: string | null
          resource_id: string
          resource_type: string
          status: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          payload: Json
          payload_hash: string
          policy: string
          requested_by?: string | null
          resource_id: string
          resource_type: string
          status?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          payload?: Json
          payload_hash?: string
          policy?: string
          requested_by?: string | null
          resource_id?: string
          resource_type?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      associations: {
        Row: {
          from_entity: string
          from_id: string
          kind: string
          tenant_id: string
          to_entity: string
          to_id: string
        }
        Insert: {
          from_entity: string
          from_id: string
          kind?: string
          tenant_id: string
          to_entity: string
          to_id: string
        }
        Update: {
          from_entity?: string
          from_id?: string
          kind?: string
          tenant_id?: string
          to_entity?: string
          to_id?: string
        }
        Relationships: []
      }
      attribution_touches: {
        Row: {
          campaign: string | null
          channel: string | null
          contact_id: string | null
          id: number
          lead_id: string | null
          occurred_at: string
          tenant_id: string
          utm: Json | null
        }
        Insert: {
          campaign?: string | null
          channel?: string | null
          contact_id?: string | null
          id?: number
          lead_id?: string | null
          occurred_at?: string
          tenant_id: string
          utm?: Json | null
        }
        Update: {
          campaign?: string | null
          channel?: string | null
          contact_id?: string | null
          id?: number
          lead_id?: string | null
          occurred_at?: string
          tenant_id?: string
          utm?: Json | null
        }
        Relationships: []
      }
      audiences: {
        Row: {
          created_at: string
          department_id: string | null
          id: string
          name: string
          owner_id: string | null
          segment_id: string | null
          snapshot_contact_ids: string[] | null
          team_id: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          id?: string
          name: string
          owner_id?: string | null
          segment_id?: string | null
          snapshot_contact_ids?: string[] | null
          team_id?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          segment_id?: string | null
          snapshot_contact_ids?: string[] | null
          team_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audiences_department_same_tenant_fk"
            columns: ["tenant_id", "department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "audiences_owner_same_tenant_fk"
            columns: ["tenant_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "audiences_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audiences_team_same_tenant_fk"
            columns: ["tenant_id", "team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: string
          id: number
          meta: Json
          occurred_at: string
          resource_id: string | null
          resource_type: string
          tenant_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type?: string
          id?: number
          meta?: Json
          occurred_at?: string
          resource_id?: string | null
          resource_type: string
          tenant_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: string
          id?: number
          meta?: Json
          occurred_at?: string
          resource_id?: string | null
          resource_type?: string
          tenant_id?: string | null
        }
        Relationships: []
      }
      availability_rules: {
        Row: {
          end_time: string
          id: string
          staff_id: string | null
          start_time: string
          tenant_id: string
          weekday: number
        }
        Insert: {
          end_time: string
          id?: string
          staff_id?: string | null
          start_time: string
          tenant_id: string
          weekday: number
        }
        Update: {
          end_time?: string
          id?: string
          staff_id?: string | null
          start_time?: string
          tenant_id?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "availability_rules_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_pages: {
        Row: {
          buffer_min: number
          duration_min: number
          id: string
          is_active: boolean
          service_name: string
          slug: string
          staff_id: string | null
          tenant_id: string
        }
        Insert: {
          buffer_min?: number
          duration_min?: number
          id?: string
          is_active?: boolean
          service_name: string
          slug: string
          staff_id?: string | null
          tenant_id: string
        }
        Update: {
          buffer_min?: number
          duration_min?: number
          id?: string
          is_active?: boolean
          service_name?: string
          slug?: string
          staff_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_pages_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_sends: {
        Row: {
          body: string
          campaign_id: string
          channel_kind: string
          contact_id: string
          id: number
          sent_at: string
          status: string
          tenant_id: string
        }
        Insert: {
          body: string
          campaign_id: string
          channel_kind: string
          contact_id: string
          id?: number
          sent_at?: string
          status?: string
          tenant_id: string
        }
        Update: {
          body?: string
          campaign_id?: string
          channel_kind?: string
          contact_id?: string
          id?: number
          sent_at?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_sends_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          ab_variant_of: string | null
          audience_id: string | null
          channel_kind: string
          created_at: string
          created_by: string | null
          department_id: string | null
          id: string
          metrics: Json
          name: string
          owner_id: string | null
          scheduled_at: string | null
          status: string
          team_id: string | null
          template_id: string | null
          tenant_id: string
        }
        Insert: {
          ab_variant_of?: string | null
          audience_id?: string | null
          channel_kind: string
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          id?: string
          metrics?: Json
          name: string
          owner_id?: string | null
          scheduled_at?: string | null
          status?: string
          team_id?: string | null
          template_id?: string | null
          tenant_id: string
        }
        Update: {
          ab_variant_of?: string | null
          audience_id?: string | null
          channel_kind?: string
          created_at?: string
          created_by?: string | null
          department_id?: string | null
          id?: string
          metrics?: Json
          name?: string
          owner_id?: string | null
          scheduled_at?: string | null
          status?: string
          team_id?: string | null
          template_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_ab_variant_of_fkey"
            columns: ["ab_variant_of"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_department_same_tenant_fk"
            columns: ["tenant_id", "department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "campaigns_owner_same_tenant_fk"
            columns: ["tenant_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "campaigns_team_same_tenant_fk"
            columns: ["tenant_id", "team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "message_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          capability_ops: string[]
          config: Json
          created_at: string
          display_name: string
          id: string
          kind: string
          status: string
          tenant_id: string
        }
        Insert: {
          capability_ops?: string[]
          config?: Json
          created_at?: string
          display_name: string
          id?: string
          kind: string
          status?: string
          tenant_id: string
        }
        Update: {
          capability_ops?: string[]
          config?: Json
          created_at?: string
          display_name?: string
          id?: string
          kind?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      commissions: {
        Row: {
          amount: number
          basis_amount: number
          created_at: string
          id: string
          opportunity_id: string
          rate: number
          status: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          amount: number
          basis_amount: number
          created_at?: string
          id?: string
          opportunity_id: string
          rate: number
          status?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          amount?: number
          basis_amount?: number
          created_at?: string
          id?: string
          opportunity_id?: string
          rate?: number
          status?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          billing_country: string | null
          created_at: string
          department_id: string | null
          domain: string | null
          email: string | null
          id: string
          industry: string | null
          name: string
          parent_company_id: string | null
          phone: string | null
          row_version: number
          team_id: string | null
          tenant_id: string
          trn: string | null
          updated_at: string
        }
        Insert: {
          billing_country?: string | null
          created_at?: string
          department_id?: string | null
          domain?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          name: string
          parent_company_id?: string | null
          phone?: string | null
          row_version?: number
          team_id?: string | null
          tenant_id: string
          trn?: string | null
          updated_at?: string
        }
        Update: {
          billing_country?: string | null
          created_at?: string
          department_id?: string | null
          domain?: string | null
          email?: string | null
          id?: string
          industry?: string | null
          name?: string
          parent_company_id?: string | null
          phone?: string | null
          row_version?: number
          team_id?: string | null
          tenant_id?: string
          trn?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_department_same_tenant_fk"
            columns: ["tenant_id", "department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "companies_parent_company_id_fkey"
            columns: ["parent_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "companies_team_same_tenant_fk"
            columns: ["tenant_id", "team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "companies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      consents: {
        Row: {
          channel_kind: string
          contact_id: string
          evidence: Json
          external_ref: string | null
          id: string
          occurred_at: string
          state: string
          tenant_id: string
        }
        Insert: {
          channel_kind: string
          contact_id: string
          evidence?: Json
          external_ref?: string | null
          id?: string
          occurred_at?: string
          state: string
          tenant_id: string
        }
        Update: {
          channel_kind?: string
          contact_id?: string
          evidence?: Json
          external_ref?: string | null
          id?: string
          occurred_at?: string
          state?: string
          tenant_id?: string
        }
        Relationships: []
      }
      contacts: {
        Row: {
          company_id: string | null
          created_at: string
          department_id: string | null
          email: string | null
          first_name: string | null
          id: string
          job_title: string | null
          last_name: string | null
          lifecycle_stage: string
          merged_into: string | null
          owner_id: string | null
          phone: string | null
          row_version: number
          source: string | null
          team_id: string | null
          tenant_id: string
          updated_at: string
          whatsapp_phone: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          department_id?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          job_title?: string | null
          last_name?: string | null
          lifecycle_stage?: string
          merged_into?: string | null
          owner_id?: string | null
          phone?: string | null
          row_version?: number
          source?: string | null
          team_id?: string | null
          tenant_id: string
          updated_at?: string
          whatsapp_phone?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string
          department_id?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          job_title?: string | null
          last_name?: string | null
          lifecycle_stage?: string
          merged_into?: string | null
          owner_id?: string | null
          phone?: string | null
          row_version?: number
          source?: string | null
          team_id?: string | null
          tenant_id?: string
          updated_at?: string
          whatsapp_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_department_same_tenant_fk"
            columns: ["tenant_id", "department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "contacts_merged_into_fkey"
            columns: ["merged_into"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_owner_same_tenant_fk"
            columns: ["tenant_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "contacts_team_same_tenant_fk"
            columns: ["tenant_id", "team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assignee_id: string | null
          channel_id: string
          contact_id: string | null
          created_at: string
          department_id: string | null
          external_ref: string | null
          id: string
          last_message_at: string | null
          mode: string
          provider_account_id: string | null
          row_version: number
          status: string
          subject: string | null
          team_id: string | null
          tenant_id: string
          unread_count: number
        }
        Insert: {
          assignee_id?: string | null
          channel_id: string
          contact_id?: string | null
          created_at?: string
          department_id?: string | null
          external_ref?: string | null
          id?: string
          last_message_at?: string | null
          mode?: string
          provider_account_id?: string | null
          row_version?: number
          status?: string
          subject?: string | null
          team_id?: string | null
          tenant_id: string
          unread_count?: number
        }
        Update: {
          assignee_id?: string | null
          channel_id?: string
          contact_id?: string | null
          created_at?: string
          department_id?: string | null
          external_ref?: string | null
          id?: string
          last_message_at?: string | null
          mode?: string
          provider_account_id?: string | null
          row_version?: number
          status?: string
          subject?: string | null
          team_id?: string | null
          tenant_id?: string
          unread_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "conversations_assignee_same_tenant_fk"
            columns: ["tenant_id", "assignee_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "conversations_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_department_same_tenant_fk"
            columns: ["tenant_id", "department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "conversations_provider_account_id_fkey"
            columns: ["provider_account_id"]
            isOneToOne: false
            referencedRelation: "provider_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_team_same_tenant_fk"
            columns: ["tenant_id", "team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      csat_responses: {
        Row: {
          comment: string | null
          created_at: string
          id: number
          score: number
          tenant_id: string
          ticket_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: number
          score: number
          tenant_id: string
          ticket_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: number
          score?: number
          tenant_id?: string
          ticket_id?: string
        }
        Relationships: []
      }
      custom_field_definitions: {
        Row: {
          entity: string
          field_type: string
          id: string
          key: string
          label: string
          options: Json | null
          required: boolean
          tenant_id: string
        }
        Insert: {
          entity: string
          field_type: string
          id?: string
          key: string
          label: string
          options?: Json | null
          required?: boolean
          tenant_id: string
        }
        Update: {
          entity?: string
          field_type?: string
          id?: string
          key?: string
          label?: string
          options?: Json | null
          required?: boolean
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_field_definitions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_field_values: {
        Row: {
          definition_id: string
          entity_id: string
          id: string
          tenant_id: string
          value_bool: boolean | null
          value_date: string | null
          value_json: Json | null
          value_number: number | null
          value_text: string | null
        }
        Insert: {
          definition_id: string
          entity_id: string
          id?: string
          tenant_id: string
          value_bool?: boolean | null
          value_date?: string | null
          value_json?: Json | null
          value_number?: number | null
          value_text?: string | null
        }
        Update: {
          definition_id?: string
          entity_id?: string
          id?: string
          tenant_id?: string
          value_bool?: boolean | null
          value_date?: string | null
          value_json?: Json | null
          value_number?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_field_values_definition_id_fkey"
            columns: ["definition_id"]
            isOneToOne: false
            referencedRelation: "custom_field_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_field_values_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_widgets: {
        Row: {
          dashboard_id: string
          id: number
          kind: string
          position: number
          spec: Json
          tenant_id: string
        }
        Insert: {
          dashboard_id: string
          id?: number
          kind: string
          position: number
          spec: Json
          tenant_id: string
        }
        Update: {
          dashboard_id?: string
          id?: number
          kind?: string
          position?: number
          spec?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_widgets_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "dashboards"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboards: {
        Row: {
          id: string
          layout: Json
          name: string
          tenant_id: string
        }
        Insert: {
          id?: string
          layout?: Json
          name: string
          tenant_id: string
        }
        Update: {
          id?: string
          layout?: Json
          name?: string
          tenant_id?: string
        }
        Relationships: []
      }
      delivery_receipts: {
        Row: {
          id: number
          message_id: string
          raw: Json | null
          status: string
          tenant_id: string
          timestamp: string | null
        }
        Insert: {
          id?: number
          message_id: string
          raw?: Json | null
          status: string
          tenant_id: string
          timestamp?: string | null
        }
        Update: {
          id?: number
          message_id?: string
          raw?: Json | null
          status?: string
          tenant_id?: string
          timestamp?: string | null
        }
        Relationships: []
      }
      departments: {
        Row: {
          created_at: string
          id: string
          name: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dlq_entries: {
        Row: {
          error: string
          failed_at: string
          id: number
          payload: Json
          queue: string
          replayed_at: string | null
          tenant_id: string | null
        }
        Insert: {
          error: string
          failed_at?: string
          id?: number
          payload: Json
          queue: string
          replayed_at?: string | null
          tenant_id?: string | null
        }
        Update: {
          error?: string
          failed_at?: string
          id?: number
          payload?: Json
          queue?: string
          replayed_at?: string | null
          tenant_id?: string | null
        }
        Relationships: []
      }
      dsar_requests: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          reason: string
          requested_by: string | null
          result_summary: Json | null
          row_version: number
          status: string
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          reason: string
          requested_by?: string | null
          result_summary?: Json | null
          row_version?: number
          status?: string
          tenant_id: string
          type: string
          updated_at?: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          reason?: string
          requested_by?: string | null
          result_summary?: Json | null
          row_version?: number
          status?: string
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dsar_requests_tenant_id_contact_id_fkey"
            columns: ["tenant_id", "contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "dsar_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      export_jobs: {
        Row: {
          created_at: string
          created_by: string | null
          entity: string
          expires_at: string | null
          file_ref: string | null
          filters: Json | null
          id: string
          status: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entity: string
          expires_at?: string | null
          file_ref?: string | null
          filters?: Json | null
          id?: string
          status?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entity?: string
          expires_at?: string | null
          file_ref?: string | null
          filters?: Json | null
          id?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "export_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          created_at: string
          id: string
          mime: string | null
          name: string
          scanned_status: string
          size_bytes: number | null
          storage_ref: string
          tenant_id: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          mime?: string | null
          name: string
          scanned_status?: string
          size_bytes?: number | null
          storage_ref: string
          tenant_id: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          mime?: string | null
          name?: string
          scanned_status?: string
          size_bytes?: number | null
          storage_ref?: string
          tenant_id?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      frequency_caps: {
        Row: {
          channel_kind: string
          contact_id: string
          max_messages: number
          tenant_id: string
          window: string
        }
        Insert: {
          channel_kind: string
          contact_id: string
          max_messages: number
          tenant_id: string
          window: string
        }
        Update: {
          channel_kind?: string
          contact_id?: string
          max_messages?: number
          tenant_id?: string
          window?: string
        }
        Relationships: []
      }
      gateway_events: {
        Row: {
          gateway: string
          gateway_event_id: string
          id: number
          raw: Json
          received_at: string
          status: string
          tenant_id: string | null
        }
        Insert: {
          gateway: string
          gateway_event_id: string
          id?: number
          raw: Json
          received_at?: string
          status?: string
          tenant_id?: string | null
        }
        Update: {
          gateway?: string
          gateway_event_id?: string
          id?: number
          raw?: Json
          received_at?: string
          status?: string
          tenant_id?: string | null
        }
        Relationships: []
      }
      import_jobs: {
        Row: {
          created_at: string
          created_by: string | null
          entity: string
          file_ref: string | null
          id: string
          stats: Json | null
          status: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entity: string
          file_ref?: string | null
          id?: string
          stats?: Json | null
          status?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entity?: string
          file_ref?: string | null
          id?: string
          stats?: Json | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_logs: {
        Row: {
          connector: string
          created_at: string
          direction: string
          endpoint: string | null
          error: string | null
          id: number
          latency_ms: number | null
          meta: Json
          ok: boolean
          status_code: number | null
          tenant_id: string | null
        }
        Insert: {
          connector: string
          created_at?: string
          direction: string
          endpoint?: string | null
          error?: string | null
          id?: number
          latency_ms?: number | null
          meta?: Json
          ok: boolean
          status_code?: number | null
          tenant_id?: string | null
        }
        Update: {
          connector?: string
          created_at?: string
          direction?: string
          endpoint?: string | null
          error?: string | null
          id?: number
          latency_ms?: number | null
          meta?: Json
          ok?: boolean
          status_code?: number | null
          tenant_id?: string | null
        }
        Relationships: []
      }
      invoice_lines: {
        Row: {
          description: string
          id: number
          invoice_id: string
          line_total: number
          qty: number
          tax_rate: number
          tenant_id: string
          unit_price: number
        }
        Insert: {
          description: string
          id?: number
          invoice_id: string
          line_total: number
          qty: number
          tax_rate: number
          tenant_id: string
          unit_price: number
        }
        Update: {
          description?: string
          id?: number
          invoice_id?: string
          line_total?: number
          qty?: number
          tax_rate?: number
          tenant_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          contact_id: string | null
          currency: string
          department_id: string | null
          due_date: string | null
          id: string
          issued_at: string | null
          number: string
          owner_id: string | null
          quote_id: string | null
          row_version: number
          status: string
          subtotal: number | null
          tax_total: number | null
          team_id: string | null
          tenant_id: string
          total: number
        }
        Insert: {
          contact_id?: string | null
          currency: string
          department_id?: string | null
          due_date?: string | null
          id?: string
          issued_at?: string | null
          number: string
          owner_id?: string | null
          quote_id?: string | null
          row_version?: number
          status?: string
          subtotal?: number | null
          tax_total?: number | null
          team_id?: string | null
          tenant_id: string
          total: number
        }
        Update: {
          contact_id?: string | null
          currency?: string
          department_id?: string | null
          due_date?: string | null
          id?: string
          issued_at?: string | null
          number?: string
          owner_id?: string | null
          quote_id?: string | null
          row_version?: number
          status?: string
          subtotal?: number | null
          tax_total?: number | null
          team_id?: string | null
          tenant_id?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_department_same_tenant_fk"
            columns: ["tenant_id", "department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "invoices_owner_same_tenant_fk"
            columns: ["tenant_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "invoices_team_same_tenant_fk"
            columns: ["tenant_id", "team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      journey_steps: {
        Row: {
          campaign_id: string | null
          config: Json
          id: number
          kind: string
          position: number
          tenant_id: string
        }
        Insert: {
          campaign_id?: string | null
          config: Json
          id?: number
          kind: string
          position: number
          tenant_id: string
        }
        Update: {
          campaign_id?: string | null
          config?: Json
          id?: number
          kind?: string
          position?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journey_steps_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      kb_articles: {
        Row: {
          body: string
          id: string
          slug: string
          status: string
          tenant_id: string
          title: string
        }
        Insert: {
          body: string
          id?: string
          slug: string
          status?: string
          tenant_id: string
          title: string
        }
        Update: {
          body?: string
          id?: string
          slug?: string
          status?: string
          tenant_id?: string
          title?: string
        }
        Relationships: []
      }
      knowledge_chunks: {
        Row: {
          chunk_index: number
          content: string
          document_id: string
          embedding: string | null
          id: string
          tenant_id: string
        }
        Insert: {
          chunk_index: number
          content: string
          document_id: string
          embedding?: string | null
          id?: string
          tenant_id: string
        }
        Update: {
          chunk_index?: number
          content?: string
          document_id?: string
          embedding?: string | null
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_documents: {
        Row: {
          acl: Json
          created_at: string
          id: string
          source_ref: string | null
          status: string
          tenant_id: string
          title: string
        }
        Insert: {
          acl?: Json
          created_at?: string
          id?: string
          source_ref?: string | null
          status?: string
          tenant_id: string
          title: string
        }
        Update: {
          acl?: Json
          created_at?: string
          id?: string
          source_ref?: string | null
          status?: string
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_sources: {
        Row: {
          id: string
          key: string
          name: string
          tenant_id: string
        }
        Insert: {
          id?: string
          key: string
          name: string
          tenant_id: string
        }
        Update: {
          id?: string
          key?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_sources_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          attribution: Json
          company_name: string | null
          converted_contact_id: string | null
          converted_opportunity_id: string | null
          created_at: string
          department_id: string | null
          email: string | null
          id: string
          name: string | null
          owner_id: string | null
          phone: string | null
          row_version: number
          score: number
          sla_due_at: string | null
          source_id: string | null
          status: string
          team_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attribution?: Json
          company_name?: string | null
          converted_contact_id?: string | null
          converted_opportunity_id?: string | null
          created_at?: string
          department_id?: string | null
          email?: string | null
          id?: string
          name?: string | null
          owner_id?: string | null
          phone?: string | null
          row_version?: number
          score?: number
          sla_due_at?: string | null
          source_id?: string | null
          status?: string
          team_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attribution?: Json
          company_name?: string | null
          converted_contact_id?: string | null
          converted_opportunity_id?: string | null
          created_at?: string
          department_id?: string | null
          email?: string | null
          id?: string
          name?: string | null
          owner_id?: string | null
          phone?: string | null
          row_version?: number
          score?: number
          sla_due_at?: string | null
          source_id?: string | null
          status?: string
          team_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_converted_contact_id_fkey"
            columns: ["converted_contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_department_same_tenant_fk"
            columns: ["tenant_id", "department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "leads_owner_same_tenant_fk"
            columns: ["tenant_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "leads_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "lead_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_team_same_tenant_fk"
            columns: ["tenant_id", "team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          department_id: string | null
          id: string
          roles: string[]
          status: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          id?: string
          roles?: string[]
          status?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          id?: string
          roles?: string[]
          status?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_department_same_tenant_fk"
            columns: ["tenant_id", "department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      message_attachments: {
        Row: {
          created_at: string
          id: string
          kind: string
          message_id: string
          mime: string | null
          size_bytes: number | null
          storage_ref: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          message_id: string
          mime?: string | null
          size_bytes?: number | null
          storage_ref: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          message_id?: string
          mime?: string | null
          size_bytes?: number | null
          storage_ref?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      message_templates: {
        Row: {
          approval_status: string | null
          body: string
          channel_kind: string
          id: string
          language: string
          name: string
          provider_template_id: string | null
          tenant_id: string
          variables: Json | null
        }
        Insert: {
          approval_status?: string | null
          body: string
          channel_kind: string
          id?: string
          language?: string
          name: string
          provider_template_id?: string | null
          tenant_id: string
          variables?: Json | null
        }
        Update: {
          approval_status?: string | null
          body?: string
          channel_kind?: string
          id?: string
          language?: string
          name?: string
          provider_template_id?: string | null
          tenant_id?: string
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "message_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string
          direction: string
          error_code: string | null
          id: string
          provider_message_id: string | null
          retry_count: number
          sender_id: string | null
          sender_type: string
          sent_at: string | null
          status: string
          template_id: string | null
          tenant_id: string
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string
          direction: string
          error_code?: string | null
          id?: string
          provider_message_id?: string | null
          retry_count?: number
          sender_id?: string | null
          sender_type: string
          sent_at?: string | null
          status?: string
          template_id?: string | null
          tenant_id: string
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string
          direction?: string
          error_code?: string | null
          id?: string
          provider_message_id?: string | null
          retry_count?: number
          sender_id?: string | null
          sender_type?: string
          sent_at?: string | null
          status?: string
          template_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      metric_snapshots: {
        Row: {
          computed_at: string
          id: number
          metric: string
          period: string
          tenant_id: string
          value: number
        }
        Insert: {
          computed_at?: string
          id?: number
          metric: string
          period: string
          tenant_id: string
          value: number
        }
        Update: {
          computed_at?: string
          id?: number
          metric?: string
          period?: string
          tenant_id?: string
          value?: number
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: number
          kind: string
          payload: Json
          read_at: string | null
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          kind: string
          payload?: Json
          read_at?: string | null
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: number
          kind?: string
          payload?: Json
          read_at?: string | null
          tenant_id?: string
          user_id?: string
        }
        Relationships: []
      }
      nps_responses: {
        Row: {
          comment: string | null
          contact_id: string | null
          created_at: string
          id: number
          score: number
          tenant_id: string
        }
        Insert: {
          comment?: string | null
          contact_id?: string | null
          created_at?: string
          id?: number
          score: number
          tenant_id: string
        }
        Update: {
          comment?: string | null
          contact_id?: string | null
          created_at?: string
          id?: number
          score?: number
          tenant_id?: string
        }
        Relationships: []
      }
      number_sequences: {
        Row: {
          created_at: string
          id: string
          key: string
          next: number
          row_version: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          next?: number
          row_version?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          next?: number
          row_version?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "number_sequences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          amount: number
          company_id: string | null
          contact_id: string | null
          created_at: string
          currency: string
          department_id: string | null
          expected_close_date: string | null
          id: string
          name: string
          owner_id: string | null
          pipeline_id: string
          row_version: number
          source_lead_id: string | null
          stage_id: string
          status: string
          team_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          currency?: string
          department_id?: string | null
          expected_close_date?: string | null
          id?: string
          name: string
          owner_id?: string | null
          pipeline_id: string
          row_version?: number
          source_lead_id?: string | null
          stage_id: string
          status?: string
          team_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          currency?: string
          department_id?: string | null
          expected_close_date?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          pipeline_id?: string
          row_version?: number
          source_lead_id?: string | null
          stage_id?: string
          status?: string
          team_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_department_same_tenant_fk"
            columns: ["tenant_id", "department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "opportunities_owner_same_tenant_fk"
            columns: ["tenant_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "opportunities_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_source_lead_id_fkey"
            columns: ["source_lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_team_same_tenant_fk"
            columns: ["tenant_id", "team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "opportunities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      outbound_webhooks: {
        Row: {
          created_at: string
          events: string[]
          id: string
          revoked_at: string | null
          row_version: number
          secret_ciphertext: string
          secret_key_version: number
          tenant_id: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          events: string[]
          id?: string
          revoked_at?: string | null
          row_version?: number
          secret_ciphertext: string
          secret_key_version?: number
          tenant_id: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          events?: string[]
          id?: string
          revoked_at?: string | null
          row_version?: number
          secret_ciphertext?: string
          secret_key_version?: number
          tenant_id?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "outbound_webhooks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_links: {
        Row: {
          amount: number
          created_at: string
          currency: string
          gateway: string
          id: string
          quote_id: string | null
          status: string
          tenant_id: string
          url: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency: string
          gateway: string
          id?: string
          quote_id?: string | null
          status?: string
          tenant_id: string
          url?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          gateway?: string
          id?: string
          quote_id?: string | null
          status?: string
          tenant_id?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_links_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          id: string
          is_lost: boolean
          is_won: boolean
          name: string
          pipeline_id: string
          position: number
          probability: number
          tenant_id: string
        }
        Insert: {
          id?: string
          is_lost?: boolean
          is_won?: boolean
          name: string
          pipeline_id: string
          position: number
          probability?: number
          tenant_id: string
        }
        Update: {
          id?: string
          is_lost?: boolean
          is_won?: boolean
          name?: string
          pipeline_id?: string
          position?: number
          probability?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          id: string
          is_default: boolean
          name: string
          tenant_id: string
        }
        Insert: {
          id?: string
          is_default?: boolean
          name: string
          tenant_id: string
        }
        Update: {
          id?: string
          is_default?: boolean
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipelines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_versions: {
        Row: {
          active: boolean
          currency: string
          entitlements: Json
          id: string
          plan_key: string
          price_monthly_micro: number
          version: number
        }
        Insert: {
          active?: boolean
          currency?: string
          entitlements: Json
          id?: string
          plan_key: string
          price_monthly_micro: number
          version: number
        }
        Update: {
          active?: boolean
          currency?: string
          entitlements?: Json
          id?: string
          plan_key?: string
          price_monthly_micro?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_versions_plan_key_fkey"
            columns: ["plan_key"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["key"]
          },
        ]
      }
      plans: {
        Row: {
          key: string
          name: string
          sort_order: number | null
        }
        Insert: {
          key: string
          name: string
          sort_order?: number | null
        }
        Update: {
          key?: string
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      platform_memberships: {
        Row: {
          active: boolean
          created_at: string
          mfa_enrolled: boolean
          role_key: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          mfa_enrolled?: boolean
          role_key: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          mfa_enrolled?: boolean
          role_key?: string
          user_id?: string
        }
        Relationships: []
      }
      portal_accounts: {
        Row: {
          email: string
          external_auth_id: string | null
          id: string
          name: string | null
          tenant_id: string
        }
        Insert: {
          email: string
          external_auth_id?: string | null
          id?: string
          name?: string | null
          tenant_id: string
        }
        Update: {
          email?: string
          external_auth_id?: string | null
          id?: string
          name?: string | null
          tenant_id?: string
        }
        Relationships: []
      }
      portal_grants: {
        Row: {
          id: number
          portal_account_id: string
          resource_id: string
          resource_type: string
          revoked_at: string | null
          tenant_id: string
        }
        Insert: {
          id?: number
          portal_account_id: string
          resource_id: string
          resource_type: string
          revoked_at?: string | null
          tenant_id: string
        }
        Update: {
          id?: number
          portal_account_id?: string
          resource_id?: string
          resource_type?: string
          revoked_at?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portal_grants_portal_account_id_fkey"
            columns: ["portal_account_id"]
            isOneToOne: false
            referencedRelation: "portal_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      price_list_items: {
        Row: {
          price_list_id: string
          product_id: string
          tenant_id: string
          unit_price: number
        }
        Insert: {
          price_list_id: string
          product_id: string
          tenant_id: string
          unit_price: number
        }
        Update: {
          price_list_id?: string
          product_id?: string
          tenant_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "price_list_items_price_list_id_fkey"
            columns: ["price_list_id"]
            isOneToOne: false
            referencedRelation: "price_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_list_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      price_lists: {
        Row: {
          currency: string
          effective_from: string | null
          effective_to: string | null
          id: string
          name: string
          tenant_id: string
        }
        Insert: {
          currency: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          name: string
          tenant_id: string
        }
        Update: {
          currency?: string
          effective_from?: string | null
          effective_to?: string | null
          id?: string
          name?: string
          tenant_id?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          active: boolean
          currency: string
          description: string | null
          id: string
          name: string
          sku: string | null
          tax_rate_id: string | null
          tenant_id: string
          unit_price: number
        }
        Insert: {
          active?: boolean
          currency?: string
          description?: string | null
          id?: string
          name: string
          sku?: string | null
          tax_rate_id?: string | null
          tenant_id: string
          unit_price?: number
        }
        Update: {
          active?: boolean
          currency?: string
          description?: string | null
          id?: string
          name?: string
          sku?: string | null
          tax_rate_id?: string | null
          tenant_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_accounts: {
        Row: {
          channel_id: string
          external_id: string
          id: string
          meta: Json
          tenant_id: string
        }
        Insert: {
          channel_id: string
          external_id: string
          id?: string
          meta?: Json
          tenant_id: string
        }
        Update: {
          channel_id?: string
          external_id?: string
          id?: string
          meta?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_accounts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
        ]
      }
      provider_credentials: {
        Row: {
          ciphertext: string
          id: string
          key_version: number
          provider_account_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          ciphertext: string
          id?: string
          key_version?: number
          provider_account_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          ciphertext?: string
          id?: string
          key_version?: number
          provider_account_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "provider_credentials_provider_account_id_fkey"
            columns: ["provider_account_id"]
            isOneToOne: false
            referencedRelation: "provider_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      queues: {
        Row: {
          id: string
          name: string
          tenant_id: string
        }
        Insert: {
          id?: string
          name: string
          tenant_id: string
        }
        Update: {
          id?: string
          name?: string
          tenant_id?: string
        }
        Relationships: []
      }
      quote_lines: {
        Row: {
          description: string
          discount_pct: number
          id: number
          line_total: number
          product_id: string | null
          qty: number
          quote_id: string
          tax_rate: number
          tenant_id: string
          unit_price: number
        }
        Insert: {
          description: string
          discount_pct?: number
          id?: number
          line_total: number
          product_id?: string | null
          qty: number
          quote_id: string
          tax_rate?: number
          tenant_id: string
          unit_price: number
        }
        Update: {
          description?: string
          discount_pct?: number
          id?: number
          line_total?: number
          product_id?: string | null
          qty?: number
          quote_id?: string
          tax_rate?: number
          tenant_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_lines_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_versions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          quote_id: string
          snapshot: Json
          tenant_id: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          quote_id: string
          snapshot: Json
          tenant_id: string
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          quote_id?: string
          snapshot?: Json
          tenant_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_versions_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          created_at: string
          currency: string
          department_id: string | null
          discount_pct: number
          id: string
          number: string
          opportunity_id: string | null
          owner_id: string | null
          row_version: number
          status: string
          subtotal: number
          tax_total: number
          team_id: string | null
          tenant_id: string
          total: number
        }
        Insert: {
          created_at?: string
          currency?: string
          department_id?: string | null
          discount_pct?: number
          id?: string
          number: string
          opportunity_id?: string | null
          owner_id?: string | null
          row_version?: number
          status?: string
          subtotal?: number
          tax_total?: number
          team_id?: string | null
          tenant_id: string
          total?: number
        }
        Update: {
          created_at?: string
          currency?: string
          department_id?: string | null
          discount_pct?: number
          id?: string
          number?: string
          opportunity_id?: string | null
          owner_id?: string | null
          row_version?: number
          status?: string
          subtotal?: number
          tax_total?: number
          team_id?: string | null
          tenant_id?: string
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotes_department_same_tenant_fk"
            columns: ["tenant_id", "department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "quotes_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_owner_same_tenant_fk"
            columns: ["tenant_id", "owner_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "quotes_team_same_tenant_fk"
            columns: ["tenant_id", "team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "quotes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      report_definitions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          spec: Json
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          spec: Json
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          spec?: Json
          tenant_id?: string
        }
        Relationships: []
      }
      report_runs: {
        Row: {
          created_at: string
          id: number
          output_ref: string | null
          report_id: string
          status: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: number
          output_ref?: string | null
          report_id: string
          status?: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: number
          output_ref?: string | null
          report_id?: string
          status?: string
          tenant_id?: string
        }
        Relationships: []
      }
      resellers: {
        Row: {
          id: string
          name: string
          parent_tenant_id: string | null
          settings: Json
          tenant_id: string | null
        }
        Insert: {
          id?: string
          name: string
          parent_tenant_id?: string | null
          settings?: Json
          tenant_id?: string | null
        }
        Update: {
          id?: string
          name?: string
          parent_tenant_id?: string | null
          settings?: Json
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "resellers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      roles: {
        Row: {
          id: string
          key: string
          name: string
          permissions: string[]
          tenant_id: string | null
        }
        Insert: {
          id?: string
          key: string
          name: string
          permissions?: string[]
          tenant_id?: string | null
        }
        Update: {
          id?: string
          key?: string
          name?: string
          permissions?: string[]
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      routing_rules: {
        Row: {
          active: boolean
          config: Json
          id: string
          kind: string
          priority: number
          tenant_id: string
        }
        Insert: {
          active?: boolean
          config?: Json
          id?: string
          kind?: string
          priority?: number
          tenant_id: string
        }
        Update: {
          active?: boolean
          config?: Json
          id?: string
          kind?: string
          priority?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "routing_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_targets: {
        Row: {
          amount: number
          currency: string
          id: string
          period: string
          tenant_id: string
          user_id: string | null
        }
        Insert: {
          amount: number
          currency?: string
          id?: string
          period: string
          tenant_id: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          currency?: string
          id?: string
          period?: string
          tenant_id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      scoring_rules: {
        Row: {
          active: boolean
          event_key: string
          id: string
          name: string
          points: number
          tenant_id: string
        }
        Insert: {
          active?: boolean
          event_key: string
          id?: string
          name: string
          points: number
          tenant_id: string
        }
        Update: {
          active?: boolean
          event_key?: string
          id?: string
          name?: string
          points?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scoring_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      segments: {
        Row: {
          created_at: string
          created_by: string | null
          entity: string
          filters: Json
          id: string
          name: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          entity?: string
          filters: Json
          id?: string
          name: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          entity?: string
          filters?: Json
          id?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "segments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_policies: {
        Row: {
          end_hour: number
          first_response_min: number
          id: string
          name: string
          resolution_min: number | null
          start_hour: number
          tenant_id: string
          week_pattern: string
        }
        Insert: {
          end_hour?: number
          first_response_min: number
          id?: string
          name: string
          resolution_min?: number | null
          start_hour?: number
          tenant_id: string
          week_pattern?: string
        }
        Update: {
          end_hour?: number
          first_response_min?: number
          id?: string
          name?: string
          resolution_min?: number | null
          start_hour?: number
          tenant_id?: string
          week_pattern?: string
        }
        Relationships: []
      }
      social_posts: {
        Row: {
          approvals: Json
          channels: string[]
          content: string
          created_at: string
          id: string
          language: string
          meta: Json
          published_at: string | null
          row_version: number
          scheduled_at: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          approvals?: Json
          channels: string[]
          content: string
          created_at?: string
          id?: string
          language: string
          meta?: Json
          published_at?: string | null
          row_version?: number
          scheduled_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          approvals?: Json
          channels?: string[]
          content?: string
          created_at?: string
          id?: string
          language?: string
          meta?: Json
          published_at?: string | null
          row_version?: number
          scheduled_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_posts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          display_name: string
          id: string
          tenant_id: string
          timezone: string
          user_id: string | null
        }
        Insert: {
          display_name: string
          id?: string
          tenant_id: string
          timezone?: string
          user_id?: string | null
        }
        Update: {
          display_name?: string
          id?: string
          tenant_id?: string
          timezone?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          current_period_end: string | null
          id: string
          plan_key: string
          plan_version_id: string
          status: string
          tenant_id: string
          term: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan_key: string
          plan_version_id: string
          status?: string
          tenant_id: string
          term?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          id?: string
          plan_key?: string
          plan_version_id?: string
          status?: string
          tenant_id?: string
          term?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_version_id_fkey"
            columns: ["plan_version_id"]
            isOneToOne: false
            referencedRelation: "plan_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      support_access_approvals: {
        Row: {
          approval_kind: string
          approved_at: string
          approver_id: string
          id: string
          request_id: string
        }
        Insert: {
          approval_kind: string
          approved_at?: string
          approver_id: string
          id?: string
          request_id: string
        }
        Update: {
          approval_kind?: string
          approved_at?: string
          approver_id?: string
          id?: string
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_access_approvals_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "support_access_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      support_access_audit: {
        Row: {
          action: string
          actor_id: string | null
          details: Json
          id: number
          occurred_at: string
          request_id: string
          resource_id: string | null
          resource_type: string | null
          tenant_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          details?: Json
          id?: number
          occurred_at?: string
          request_id: string
          resource_id?: string | null
          resource_type?: string | null
          tenant_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          details?: Json
          id?: number
          occurred_at?: string
          request_id?: string
          resource_id?: string | null
          resource_type?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_access_audit_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_access_audit_tenant_id_request_id_fkey"
            columns: ["tenant_id", "request_id"]
            isOneToOne: false
            referencedRelation: "support_access_requests"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      support_access_requests: {
        Row: {
          approved_at: string | null
          created_at: string
          expires_at: string | null
          id: string
          independent_approver_id: string | null
          justification: string
          mfa_verified_at: string | null
          permissions: string[]
          resource_types: string[]
          revoked_at: string | null
          status: string
          support_user_id: string
          tenant_approver_id: string | null
          tenant_id: string
          ticket_reference: string
        }
        Insert: {
          approved_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          independent_approver_id?: string | null
          justification: string
          mfa_verified_at?: string | null
          permissions: string[]
          resource_types: string[]
          revoked_at?: string | null
          status?: string
          support_user_id: string
          tenant_approver_id?: string | null
          tenant_id: string
          ticket_reference: string
        }
        Update: {
          approved_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          independent_approver_id?: string | null
          justification?: string
          mfa_verified_at?: string | null
          permissions?: string[]
          resource_types?: string[]
          revoked_at?: string | null
          status?: string
          support_user_id?: string
          tenant_approver_id?: string | null
          tenant_id?: string
          ticket_reference?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_access_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      suppressions: {
        Row: {
          channel_kind: string
          created_at: string
          email: string | null
          id: string
          phone: string | null
          reason: string
          tenant_id: string
        }
        Insert: {
          channel_kind: string
          created_at?: string
          email?: string | null
          id?: string
          phone?: string | null
          reason: string
          tenant_id: string
        }
        Update: {
          channel_kind?: string
          created_at?: string
          email?: string | null
          id?: string
          phone?: string | null
          reason?: string
          tenant_id?: string
        }
        Relationships: []
      }
      tag_links: {
        Row: {
          entity: string
          entity_id: string
          tag_id: string
          tenant_id: string
        }
        Insert: {
          entity: string
          entity_id: string
          tag_id: string
          tenant_id: string
        }
        Update: {
          entity?: string
          entity_id?: string
          tag_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tag_links_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string | null
          id: string
          name: string
          tenant_id: string
        }
        Insert: {
          color?: string | null
          id?: string
          name: string
          tenant_id: string
        }
        Update: {
          color?: string | null
          id?: string
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string | null
          body: string | null
          created_at: string
          department_id: string | null
          due_at: string | null
          id: string
          related_entity: string | null
          related_id: string | null
          row_version: number
          status: string
          team_id: string | null
          tenant_id: string
          title: string
        }
        Insert: {
          assignee_id?: string | null
          body?: string | null
          created_at?: string
          department_id?: string | null
          due_at?: string | null
          id?: string
          related_entity?: string | null
          related_id?: string | null
          row_version?: number
          status?: string
          team_id?: string | null
          tenant_id: string
          title: string
        }
        Update: {
          assignee_id?: string | null
          body?: string | null
          created_at?: string
          department_id?: string | null
          due_at?: string | null
          id?: string
          related_entity?: string | null
          related_id?: string | null
          row_version?: number
          status?: string
          team_id?: string | null
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_same_tenant_fk"
            columns: ["tenant_id", "assignee_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "tasks_department_same_tenant_fk"
            columns: ["tenant_id", "department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "tasks_team_same_tenant_fk"
            columns: ["tenant_id", "team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_rate_versions: {
        Row: {
          country: string
          effective_from: string
          effective_to: string | null
          id: string
          rate_pct: number
          source_url: string
          tenant_id: string
          verified_on: string
        }
        Insert: {
          country: string
          effective_from: string
          effective_to?: string | null
          id?: string
          rate_pct: number
          source_url: string
          tenant_id: string
          verified_on: string
        }
        Update: {
          country?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          rate_pct?: number
          source_url?: string
          tenant_id?: string
          verified_on?: string
        }
        Relationships: []
      }
      team_memberships: {
        Row: {
          created_at: string
          id: string
          membership_id: string
          status: string
          team_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          membership_id: string
          status?: string
          team_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          membership_id?: string
          status?: string
          team_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_memberships_tenant_id_membership_id_fkey"
            columns: ["tenant_id", "membership_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "team_memberships_tenant_id_team_id_fkey"
            columns: ["tenant_id", "team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          department_id: string | null
          id: string
          name: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          id?: string
          name: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          id?: string
          name?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_tenant_id_department_id_fkey"
            columns: ["tenant_id", "department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "teams_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_domains: {
        Row: {
          domain: string
          id: string
          tenant_id: string
          verified_at: string | null
        }
        Insert: {
          domain: string
          id?: string
          tenant_id: string
          verified_at?: string | null
        }
        Update: {
          domain?: string
          id?: string
          tenant_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      tenants: {
        Row: {
          base_currency: string
          country: string
          created_at: string
          id: string
          name: string
          plan_key: string
          settings: Json
          slug: string
          status: string
          timezone: string
          trial_ends_at: string | null
          updated_at: string
          week_pattern: string
        }
        Insert: {
          base_currency?: string
          country?: string
          created_at?: string
          id?: string
          name: string
          plan_key?: string
          settings?: Json
          slug: string
          status?: string
          timezone?: string
          trial_ends_at?: string | null
          updated_at?: string
          week_pattern?: string
        }
        Update: {
          base_currency?: string
          country?: string
          created_at?: string
          id?: string
          name?: string
          plan_key?: string
          settings?: Json
          slug?: string
          status?: string
          timezone?: string
          trial_ends_at?: string | null
          updated_at?: string
          week_pattern?: string
        }
        Relationships: []
      }
      ticket_comments: {
        Row: {
          author_id: string | null
          author_type: string
          body: string
          created_at: string
          id: number
          internal: boolean
          tenant_id: string
          ticket_id: string
        }
        Insert: {
          author_id?: string | null
          author_type: string
          body: string
          created_at?: string
          id?: number
          internal?: boolean
          tenant_id: string
          ticket_id: string
        }
        Update: {
          author_id?: string | null
          author_type?: string
          body?: string
          created_at?: string
          id?: number
          internal?: boolean
          tenant_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          assignee_id: string | null
          contact_id: string | null
          created_at: string
          department_id: string | null
          description: string | null
          first_responded_at: string | null
          first_response_due_at: string | null
          id: string
          number: string
          priority: string
          queue_id: string | null
          resolve_due_at: string | null
          resolved_at: string | null
          row_version: number
          sla_policy_id: string | null
          status: string
          subject: string
          team_id: string | null
          tenant_id: string
        }
        Insert: {
          assignee_id?: string | null
          contact_id?: string | null
          created_at?: string
          department_id?: string | null
          description?: string | null
          first_responded_at?: string | null
          first_response_due_at?: string | null
          id?: string
          number: string
          priority?: string
          queue_id?: string | null
          resolve_due_at?: string | null
          resolved_at?: string | null
          row_version?: number
          sla_policy_id?: string | null
          status?: string
          subject: string
          team_id?: string | null
          tenant_id: string
        }
        Update: {
          assignee_id?: string | null
          contact_id?: string | null
          created_at?: string
          department_id?: string | null
          description?: string | null
          first_responded_at?: string | null
          first_response_due_at?: string | null
          id?: string
          number?: string
          priority?: string
          queue_id?: string | null
          resolve_due_at?: string | null
          resolved_at?: string | null
          row_version?: number
          sla_policy_id?: string | null
          status?: string
          subject?: string
          team_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_assignee_same_tenant_fk"
            columns: ["tenant_id", "assignee_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "tickets_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_department_same_tenant_fk"
            columns: ["tenant_id", "department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "tickets_queue_id_fkey"
            columns: ["queue_id"]
            isOneToOne: false
            referencedRelation: "queues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_sla_policy_id_fkey"
            columns: ["sla_policy_id"]
            isOneToOne: false
            referencedRelation: "sla_policies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_team_same_tenant_fk"
            columns: ["tenant_id", "team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["tenant_id", "id"]
          },
          {
            foreignKeyName: "tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tool_invocations: {
        Row: {
          agent_id: string | null
          approval_id: string | null
          args: Json
          created_at: string
          id: string
          latency_ms: number | null
          permission_ok: boolean | null
          result: Json | null
          run_id: string | null
          status: string
          tenant_id: string
          tool: string
        }
        Insert: {
          agent_id?: string | null
          approval_id?: string | null
          args: Json
          created_at?: string
          id?: string
          latency_ms?: number | null
          permission_ok?: boolean | null
          result?: Json | null
          run_id?: string | null
          status?: string
          tenant_id: string
          tool: string
        }
        Update: {
          agent_id?: string | null
          approval_id?: string | null
          args?: Json
          created_at?: string
          id?: string
          latency_ms?: number | null
          permission_ok?: boolean | null
          result?: Json | null
          run_id?: string | null
          status?: string
          tenant_id?: string
          tool?: string
        }
        Relationships: [
          {
            foreignKeyName: "tool_invocations_approval_id_fkey"
            columns: ["approval_id"]
            isOneToOne: false
            referencedRelation: "approvals"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_aggregates: {
        Row: {
          metric: string
          period: string
          tenant_id: string
          total: number
        }
        Insert: {
          metric: string
          period: string
          tenant_id: string
          total?: number
        }
        Update: {
          metric?: string
          period?: string
          tenant_id?: string
          total?: number
        }
        Relationships: []
      }
      usage_events: {
        Row: {
          id: number
          meta: Json | null
          metric: string
          occurred_at: string
          quantity: number
          tenant_id: string
        }
        Insert: {
          id?: number
          meta?: Json | null
          metric: string
          occurred_at?: string
          quantity?: number
          tenant_id: string
        }
        Update: {
          id?: number
          meta?: Json | null
          metric?: string
          occurred_at?: string
          quantity?: number
          tenant_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      webhook_deliveries: {
        Row: {
          attempts: number
          created_at: string
          delivered_at: string | null
          error: string | null
          event: string
          id: string
          next_attempt_at: string | null
          payload: Json
          row_version: number
          status: string
          tenant_id: string
          updated_at: string
          webhook_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          event: string
          id?: string
          next_attempt_at?: string | null
          payload: Json
          row_version?: number
          status?: string
          tenant_id: string
          updated_at?: string
          webhook_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          delivered_at?: string | null
          error?: string | null
          event?: string
          id?: string
          next_attempt_at?: string | null
          payload?: Json
          row_version?: number
          status?: string
          tenant_id?: string
          updated_at?: string
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_deliveries_tenant_id_webhook_id_fkey"
            columns: ["tenant_id", "webhook_id"]
            isOneToOne: false
            referencedRelation: "outbound_webhooks"
            referencedColumns: ["tenant_id", "id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          error: string | null
          id: number
          processed_at: string | null
          provider_account_ref: string | null
          provider_event_id: string
          raw: Json
          received_at: string
          signature_valid: boolean
          source: string
          status: string
          tenant_id: string | null
        }
        Insert: {
          error?: string | null
          id?: number
          processed_at?: string | null
          provider_account_ref?: string | null
          provider_event_id: string
          raw: Json
          received_at?: string
          signature_valid?: boolean
          source: string
          status?: string
          tenant_id?: string | null
        }
        Update: {
          error?: string | null
          id?: number
          processed_at?: string | null
          provider_account_ref?: string | null
          provider_event_id?: string
          raw?: Json
          received_at?: string
          signature_valid?: boolean
          source?: string
          status?: string
          tenant_id?: string | null
        }
        Relationships: []
      }
      workflow_runs: {
        Row: {
          finished_at: string | null
          id: string
          idempotency_key: string | null
          started_at: string
          status: string
          tenant_id: string
          trigger: Json
          workflow_id: string
          workflow_version: number
        }
        Insert: {
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          started_at?: string
          status?: string
          tenant_id: string
          trigger: Json
          workflow_id: string
          workflow_version: number
        }
        Update: {
          finished_at?: string | null
          id?: string
          idempotency_key?: string | null
          started_at?: string
          status?: string
          tenant_id?: string
          trigger?: Json
          workflow_id?: string
          workflow_version?: number
        }
        Relationships: []
      }
      workflow_steps: {
        Row: {
          attempt: number
          error: string | null
          id: number
          kind: string
          next_run_at: string | null
          node_id: string
          output: Json | null
          run_id: string
          status: string
          tenant_id: string
        }
        Insert: {
          attempt?: number
          error?: string | null
          id?: number
          kind: string
          next_run_at?: string | null
          node_id: string
          output?: Json | null
          run_id: string
          status?: string
          tenant_id: string
        }
        Update: {
          attempt?: number
          error?: string | null
          id?: number
          kind?: string
          next_run_at?: string | null
          node_id?: string
          output?: Json | null
          run_id?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_steps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_versions: {
        Row: {
          created_at: string
          created_by: string | null
          definition: Json
          id: string
          tenant_id: string
          version: number
          workflow_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          definition: Json
          id?: string
          tenant_id: string
          version: number
          workflow_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          definition?: Json
          id?: string
          tenant_id?: string
          version?: number
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_versions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          active: boolean
          created_at: string
          definition: Json
          id: string
          name: string
          tenant_id: string
          trigger_event: string
          version: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          definition: Json
          id?: string
          name: string
          tenant_id: string
          trigger_event: string
          version?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          definition?: Json
          id?: string
          name?: string
          tenant_id?: string
          trigger_event?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "workflows_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_tenant_id: { Args: never; Returns: string }
      current_user_id: { Args: never; Returns: string }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
