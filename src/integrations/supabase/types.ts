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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      action_logs: {
        Row: {
          action: string
          actor_telegram_id: number | null
          actor_user_id: string | null
          created_at: string
          details: Json | null
          family_id: string | null
          id: number
        }
        Insert: {
          action: string
          actor_telegram_id?: number | null
          actor_user_id?: string | null
          created_at?: string
          details?: Json | null
          family_id?: string | null
          id?: number
        }
        Update: {
          action?: string
          actor_telegram_id?: number | null
          actor_user_id?: string | null
          created_at?: string
          details?: Json | null
          family_id?: string | null
          id?: number
        }
        Relationships: [
          {
            foreignKeyName: "action_logs_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_notifications: {
        Row: {
          admin_user_id: string | null
          created_at: string
          family_id: string
          id: number
          is_read: boolean
          message_text: string
          notification_type: Database["public"]["Enums"]["notification_type"]
          related_join_request: string | null
        }
        Insert: {
          admin_user_id?: string | null
          created_at?: string
          family_id: string
          id?: number
          is_read?: boolean
          message_text: string
          notification_type: Database["public"]["Enums"]["notification_type"]
          related_join_request?: string | null
        }
        Update: {
          admin_user_id?: string | null
          created_at?: string
          family_id?: string
          id?: number
          is_read?: boolean
          message_text?: string
          notification_type?: Database["public"]["Enums"]["notification_type"]
          related_join_request?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_notifications_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_notifications_related_join_request_fkey"
            columns: ["related_join_request"]
            isOneToOne: false
            referencedRelation: "join_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      banned_words: {
        Row: {
          action: string
          created_at: string
          created_by: string | null
          family_id: string
          id: string
          is_regex: boolean
          pattern: string
        }
        Insert: {
          action?: string
          created_at?: string
          created_by?: string | null
          family_id: string
          id?: string
          is_regex?: boolean
          pattern: string
        }
        Update: {
          action?: string
          created_at?: string
          created_by?: string | null
          family_id?: string
          id?: string
          is_regex?: boolean
          pattern?: string
        }
        Relationships: []
      }
      birthday_greetings: {
        Row: {
          created_at: string
          family_id: string
          greeter_name: string | null
          greeter_telegram_id: number
          greeting_text: string | null
          greeting_year: number
          id: string
          member_id: string
        }
        Insert: {
          created_at?: string
          family_id: string
          greeter_name?: string | null
          greeter_telegram_id: number
          greeting_text?: string | null
          greeting_year: number
          id?: string
          member_id: string
        }
        Update: {
          created_at?: string
          family_id?: string
          greeter_name?: string | null
          greeter_telegram_id?: number
          greeting_text?: string | null
          greeting_year?: number
          id?: string
          member_id?: string
        }
        Relationships: []
      }
      bot_broadcasts: {
        Row: {
          created_at: string
          failed_targets: Json | null
          failures_count: number
          family_id: string
          gender_filter: string | null
          id: string
          message_text: string
          recipients_count: number
          sent_by_user_id: string | null
          target: string
        }
        Insert: {
          created_at?: string
          failed_targets?: Json | null
          failures_count?: number
          family_id: string
          gender_filter?: string | null
          id?: string
          message_text: string
          recipients_count?: number
          sent_by_user_id?: string | null
          target: string
        }
        Update: {
          created_at?: string
          failed_targets?: Json | null
          failures_count?: number
          family_id?: string
          gender_filter?: string | null
          id?: string
          message_text?: string
          recipients_count?: number
          sent_by_user_id?: string | null
          target?: string
        }
        Relationships: []
      }
      bot_integrations: {
        Row: {
          added_by: string | null
          bot_username: string
          created_at: string
          family_id: string
          id: string
          is_active: boolean
          mode: Database["public"]["Enums"]["bot_integration_mode"]
        }
        Insert: {
          added_by?: string | null
          bot_username: string
          created_at?: string
          family_id: string
          id?: string
          is_active?: boolean
          mode?: Database["public"]["Enums"]["bot_integration_mode"]
        }
        Update: {
          added_by?: string | null
          bot_username?: string
          created_at?: string
          family_id?: string
          id?: string
          is_active?: boolean
          mode?: Database["public"]["Enums"]["bot_integration_mode"]
        }
        Relationships: [
          {
            foreignKeyName: "bot_integrations_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_sessions: {
        Row: {
          data: Json
          step: string
          telegram_id: number
          updated_at: string
        }
        Insert: {
          data?: Json
          step: string
          telegram_id: number
          updated_at?: string
        }
        Update: {
          data?: Json
          step?: string
          telegram_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      daily_message_buffer: {
        Row: {
          created_at: string
          family_id: string
          id: number
          member_id: string | null
          message_date: string
          telegram_id: number
          text: string
          text_hash: string
        }
        Insert: {
          created_at?: string
          family_id: string
          id?: number
          member_id?: string | null
          message_date: string
          telegram_id: number
          text: string
          text_hash: string
        }
        Update: {
          created_at?: string
          family_id?: string
          id?: number
          member_id?: string | null
          message_date?: string
          telegram_id?: number
          text?: string
          text_hash?: string
        }
        Relationships: []
      }
      event_rsvps: {
        Row: {
          event_id: string
          family_id: string
          id: string
          member_id: string
          responded_at: string
          status: Database["public"]["Enums"]["rsvp_status"]
        }
        Insert: {
          event_id: string
          family_id: string
          id?: string
          member_id: string
          responded_at?: string
          status: Database["public"]["Enums"]["rsvp_status"]
        }
        Update: {
          event_id?: string
          family_id?: string
          id?: string
          member_id?: string
          responded_at?: string
          status?: Database["public"]["Enums"]["rsvp_status"]
        }
        Relationships: [
          {
            foreignKeyName: "event_rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          event_at: string
          family_id: string
          id: string
          is_recurring_yearly: boolean
          location: string | null
          notify_days_before: number[]
          notify_group: boolean
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_at: string
          family_id: string
          id?: string
          is_recurring_yearly?: boolean
          location?: string | null
          notify_days_before?: number[]
          notify_group?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_at?: string
          family_id?: string
          id?: string
          is_recurring_yearly?: boolean
          location?: string | null
          notify_days_before?: number[]
          notify_group?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      families: {
        Row: {
          created_at: string
          id: string
          invite_code: string
          name: string
          owner_user_id: string
          telegram_group_id: number | null
          telegram_group_title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          invite_code?: string
          name: string
          owner_user_id: string
          telegram_group_id?: number | null
          telegram_group_title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          invite_code?: string
          name?: string
          owner_user_id?: string
          telegram_group_id?: number | null
          telegram_group_title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      family_members: {
        Row: {
          bio: string | null
          birth_date: string | null
          created_at: string
          family_id: string
          full_name: string
          gender: Database["public"]["Enums"]["gender_type"] | null
          id: string
          invited_by: string | null
          joined_at: string
          last_seen_at: string | null
          phone: string | null
          photo_is_private: boolean
          photo_url: string | null
          relationship_to_inviter:
            | Database["public"]["Enums"]["relationship_type"]
            | null
          sentiment_opt_out: boolean
          status: Database["public"]["Enums"]["member_status"]
          telegram_id: number
          updated_at: string
          user_id: string | null
          username: string | null
        }
        Insert: {
          bio?: string | null
          birth_date?: string | null
          created_at?: string
          family_id: string
          full_name: string
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id?: string
          invited_by?: string | null
          joined_at?: string
          last_seen_at?: string | null
          phone?: string | null
          photo_is_private?: boolean
          photo_url?: string | null
          relationship_to_inviter?:
            | Database["public"]["Enums"]["relationship_type"]
            | null
          sentiment_opt_out?: boolean
          status?: Database["public"]["Enums"]["member_status"]
          telegram_id: number
          updated_at?: string
          user_id?: string | null
          username?: string | null
        }
        Update: {
          bio?: string | null
          birth_date?: string | null
          created_at?: string
          family_id?: string
          full_name?: string
          gender?: Database["public"]["Enums"]["gender_type"] | null
          id?: string
          invited_by?: string | null
          joined_at?: string
          last_seen_at?: string | null
          phone?: string | null
          photo_is_private?: boolean
          photo_url?: string | null
          relationship_to_inviter?:
            | Database["public"]["Enums"]["relationship_type"]
            | null
          sentiment_opt_out?: boolean
          status?: Database["public"]["Enums"]["member_status"]
          telegram_id?: number
          updated_at?: string
          user_id?: string | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "family_members_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "family_members_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
      family_settings: {
        Row: {
          admin_notification_channel_id: number | null
          allowed_link_domains: string[]
          anti_flood_seconds: number
          anti_forward: boolean
          anti_link: boolean
          backup_frequency: string
          backup_telegram_chat_id: number | null
          birthday_notify_time: string
          delete_join_leave_messages: boolean
          enforce_bot_onboarding: boolean
          family_id: string
          feature_birthdays: boolean
          feature_events: boolean
          feature_stats_public: boolean
          female_photo_visibility: string
          join_request_auto_approve_timeout_hours: number
          join_request_auto_reject_timeout_hours: number
          language: string
          log_telegram_chat_id: number | null
          log_topic_actions: number | null
          log_topic_admin: number | null
          log_topic_backup: number | null
          log_topic_moderation: number | null
          manage_foreign_bot_media: boolean
          max_warnings: number
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          soft_moderation_enabled: boolean
          updated_at: string
          warning_action: string
          welcome_message_auto_delete_seconds: number
        }
        Insert: {
          admin_notification_channel_id?: number | null
          allowed_link_domains?: string[]
          anti_flood_seconds?: number
          anti_forward?: boolean
          anti_link?: boolean
          backup_frequency?: string
          backup_telegram_chat_id?: number | null
          birthday_notify_time?: string
          delete_join_leave_messages?: boolean
          enforce_bot_onboarding?: boolean
          family_id: string
          feature_birthdays?: boolean
          feature_events?: boolean
          feature_stats_public?: boolean
          female_photo_visibility?: string
          join_request_auto_approve_timeout_hours?: number
          join_request_auto_reject_timeout_hours?: number
          language?: string
          log_telegram_chat_id?: number | null
          log_topic_actions?: number | null
          log_topic_admin?: number | null
          log_topic_backup?: number | null
          log_topic_moderation?: number | null
          manage_foreign_bot_media?: boolean
          max_warnings?: number
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          soft_moderation_enabled?: boolean
          updated_at?: string
          warning_action?: string
          welcome_message_auto_delete_seconds?: number
        }
        Update: {
          admin_notification_channel_id?: number | null
          allowed_link_domains?: string[]
          anti_flood_seconds?: number
          anti_forward?: boolean
          anti_link?: boolean
          backup_frequency?: string
          backup_telegram_chat_id?: number | null
          birthday_notify_time?: string
          delete_join_leave_messages?: boolean
          enforce_bot_onboarding?: boolean
          family_id?: string
          feature_birthdays?: boolean
          feature_events?: boolean
          feature_stats_public?: boolean
          female_photo_visibility?: string
          join_request_auto_approve_timeout_hours?: number
          join_request_auto_reject_timeout_hours?: number
          language?: string
          log_telegram_chat_id?: number | null
          log_topic_actions?: number | null
          log_topic_admin?: number | null
          log_topic_backup?: number | null
          log_topic_moderation?: number | null
          manage_foreign_bot_media?: boolean
          max_warnings?: number
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          soft_moderation_enabled?: boolean
          updated_at?: string
          warning_action?: string
          welcome_message_auto_delete_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "family_settings_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: true
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      join_requests: {
        Row: {
          applicant_full_name: string | null
          applicant_phone: string | null
          applicant_telegram_id: number
          applicant_username: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          family_id: string
          id: string
          reject_reason: string | null
          relationship_type:
            | Database["public"]["Enums"]["relationship_type"]
            | null
          relative_hint: string | null
          relative_member_id: string | null
          status: Database["public"]["Enums"]["join_request_status"]
          updated_at: string
        }
        Insert: {
          applicant_full_name?: string | null
          applicant_phone?: string | null
          applicant_telegram_id: number
          applicant_username?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          family_id: string
          id?: string
          reject_reason?: string | null
          relationship_type?:
            | Database["public"]["Enums"]["relationship_type"]
            | null
          relative_hint?: string | null
          relative_member_id?: string | null
          status?: Database["public"]["Enums"]["join_request_status"]
          updated_at?: string
        }
        Update: {
          applicant_full_name?: string | null
          applicant_phone?: string | null
          applicant_telegram_id?: number
          applicant_username?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          family_id?: string
          id?: string
          reject_reason?: string | null
          relationship_type?:
            | Database["public"]["Enums"]["relationship_type"]
            | null
          relative_hint?: string | null
          relative_member_id?: string | null
          status?: Database["public"]["Enums"]["join_request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "join_requests_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "join_requests_relative_member_id_fkey"
            columns: ["relative_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
      kinship_sessions: {
        Row: {
          family_id: string | null
          first_member_id: string | null
          updated_at: string
          user_telegram_id: number
        }
        Insert: {
          family_id?: string | null
          first_member_id?: string | null
          updated_at?: string
          user_telegram_id: number
        }
        Update: {
          family_id?: string | null
          first_member_id?: string | null
          updated_at?: string
          user_telegram_id?: number
        }
        Relationships: []
      }
      member_warnings: {
        Row: {
          auto: boolean
          created_at: string
          family_id: string
          id: string
          issued_by_telegram_id: number | null
          issued_by_user_id: string | null
          member_id: string
          reason: string
          telegram_id: number | null
        }
        Insert: {
          auto?: boolean
          created_at?: string
          family_id: string
          id?: string
          issued_by_telegram_id?: number | null
          issued_by_user_id?: string | null
          member_id: string
          reason: string
          telegram_id?: number | null
        }
        Update: {
          auto?: boolean
          created_at?: string
          family_id?: string
          id?: string
          issued_by_telegram_id?: number | null
          issued_by_user_id?: string | null
          member_id?: string
          reason?: string
          telegram_id?: number | null
        }
        Relationships: []
      }
      memories: {
        Row: {
          caption: string | null
          created_at: string
          family_id: string
          id: string
          kind: string
          message_year: number
          saved_by_member_id: string | null
          saved_by_telegram_id: number | null
          source_chat_id: number | null
          source_message_id: number | null
          storage_url: string | null
          telegram_file_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          family_id: string
          id?: string
          kind: string
          message_year?: number
          saved_by_member_id?: string | null
          saved_by_telegram_id?: number | null
          source_chat_id?: number | null
          source_message_id?: number | null
          storage_url?: string | null
          telegram_file_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          family_id?: string
          id?: string
          kind?: string
          message_year?: number
          saved_by_member_id?: string | null
          saved_by_telegram_id?: number | null
          source_chat_id?: number | null
          source_message_id?: number | null
          storage_url?: string | null
          telegram_file_id?: string
        }
        Relationships: []
      }
      messages_stats: {
        Row: {
          family_id: string
          id: number
          member_id: string | null
          message_date: string
          messages_count: number
          sentiment_analyzed_at: string | null
          sentiment_score: number | null
          telegram_id: number | null
        }
        Insert: {
          family_id: string
          id?: number
          member_id?: string | null
          message_date: string
          messages_count?: number
          sentiment_analyzed_at?: string | null
          sentiment_score?: number | null
          telegram_id?: number | null
        }
        Update: {
          family_id?: string
          id?: number
          member_id?: string | null
          message_date?: string
          messages_count?: number
          sentiment_analyzed_at?: string | null
          sentiment_score?: number | null
          telegram_id?: number | null
        }
        Relationships: []
      }
      nominations: {
        Row: {
          category: string
          created_at: string
          details: Json | null
          family_id: string
          id: string
          member_id: string | null
          member_name: string | null
          metric_value: number | null
          year: number
        }
        Insert: {
          category: string
          created_at?: string
          details?: Json | null
          family_id: string
          id?: string
          member_id?: string | null
          member_name?: string | null
          metric_value?: number | null
          year: number
        }
        Update: {
          category?: string
          created_at?: string
          details?: Json | null
          family_id?: string
          id?: string
          member_id?: string | null
          member_name?: string | null
          metric_value?: number | null
          year?: number
        }
        Relationships: []
      }
      notification_log: {
        Row: {
          family_id: string
          id: number
          kind: string
          notify_date: string
          ref_id: string
          sent_at: string
        }
        Insert: {
          family_id: string
          id?: number
          kind: string
          notify_date: string
          ref_id: string
          sent_at?: string
        }
        Update: {
          family_id?: string
          id?: number
          kind?: string
          notify_date?: string
          ref_id?: string
          sent_at?: string
        }
        Relationships: []
      }
      pending_avatar_uploads: {
        Row: {
          created_at: string
          file_id: string
          id: string
          telegram_id: number
        }
        Insert: {
          created_at?: string
          file_id: string
          id?: string
          telegram_id: number
        }
        Update: {
          created_at?: string
          file_id?: string
          id?: string
          telegram_id?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          language: string | null
          telegram_id: number | null
          telegram_username: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          language?: string | null
          telegram_id?: number | null
          telegram_username?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          language?: string | null
          telegram_id?: number | null
          telegram_username?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      relationships: {
        Row: {
          created_at: string
          created_by: string | null
          family_id: string
          id: string
          member_id_1: string
          member_id_2: string
          relationship_type: Database["public"]["Enums"]["relationship_type"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          family_id: string
          id?: string
          member_id_1: string
          member_id_2: string
          relationship_type: Database["public"]["Enums"]["relationship_type"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          family_id?: string
          id?: string
          member_id_1?: string
          member_id_2?: string
          relationship_type?: Database["public"]["Enums"]["relationship_type"]
        }
        Relationships: [
          {
            foreignKeyName: "relationships_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationships_member_id_1_fkey"
            columns: ["member_id_1"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "relationships_member_id_2_fkey"
            columns: ["member_id_2"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_bot_state: {
        Row: {
          id: number
          last_polled_at: string | null
          update_offset: number
        }
        Insert: {
          id?: number
          last_polled_at?: string | null
          update_offset?: number
        }
        Update: {
          id?: number
          last_polled_at?: string | null
          update_offset?: number
        }
        Relationships: []
      }
      telegram_updates_raw: {
        Row: {
          created_at: string
          error: string | null
          payload: Json
          processed_at: string | null
          update_id: number
        }
        Insert: {
          created_at?: string
          error?: string | null
          payload: Json
          processed_at?: string | null
          update_id: number
        }
        Update: {
          created_at?: string
          error?: string | null
          payload?: Json
          processed_at?: string | null
          update_id?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          family_id: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          family_id: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          family_id?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: false
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _family_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_family_admin: {
        Args: { _family_id: string; _user_id: string }
        Returns: boolean
      }
      is_family_member: {
        Args: { _family_id: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "superadmin" | "admin" | "member"
      bot_integration_mode: "media_only" | "delete_all" | "keep_all"
      gender_type: "male" | "female"
      join_request_status:
        | "awaiting_relative_choice"
        | "awaiting_relative_confirm"
        | "awaiting_admin_approval"
        | "approved"
        | "rejected"
        | "expired"
      member_status: "pending" | "active" | "blocked"
      notification_type:
        | "join_request"
        | "approval_needed"
        | "spam_detected"
        | "error_report"
        | "system"
      relationship_type:
        | "father"
        | "mother"
        | "son"
        | "daughter"
        | "brother"
        | "sister"
        | "husband"
        | "wife"
        | "uncle_paternal"
        | "uncle_maternal"
        | "aunt_paternal"
        | "aunt_maternal"
        | "cousin_male"
        | "cousin_female"
        | "grandfather"
        | "grandmother"
        | "grandson"
        | "granddaughter"
        | "father_in_law"
        | "mother_in_law"
        | "son_in_law"
        | "daughter_in_law"
        | "brother_in_law"
        | "sister_in_law"
        | "nephew"
        | "niece"
        | "other"
        | "self"
        | "step_father"
        | "step_mother"
        | "step_son"
        | "step_daughter"
        | "half_brother"
        | "half_sister"
        | "great_grandfather"
        | "great_grandmother"
        | "great_grandson"
        | "great_granddaughter"
        | "godfather"
        | "godmother"
        | "family_friend"
      rsvp_status: "yes" | "no" | "maybe"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["superadmin", "admin", "member"],
      bot_integration_mode: ["media_only", "delete_all", "keep_all"],
      gender_type: ["male", "female"],
      join_request_status: [
        "awaiting_relative_choice",
        "awaiting_relative_confirm",
        "awaiting_admin_approval",
        "approved",
        "rejected",
        "expired",
      ],
      member_status: ["pending", "active", "blocked"],
      notification_type: [
        "join_request",
        "approval_needed",
        "spam_detected",
        "error_report",
        "system",
      ],
      relationship_type: [
        "father",
        "mother",
        "son",
        "daughter",
        "brother",
        "sister",
        "husband",
        "wife",
        "uncle_paternal",
        "uncle_maternal",
        "aunt_paternal",
        "aunt_maternal",
        "cousin_male",
        "cousin_female",
        "grandfather",
        "grandmother",
        "grandson",
        "granddaughter",
        "father_in_law",
        "mother_in_law",
        "son_in_law",
        "daughter_in_law",
        "brother_in_law",
        "sister_in_law",
        "nephew",
        "niece",
        "other",
        "self",
        "step_father",
        "step_mother",
        "step_son",
        "step_daughter",
        "half_brother",
        "half_sister",
        "great_grandfather",
        "great_grandmother",
        "great_grandson",
        "great_granddaughter",
        "godfather",
        "godmother",
        "family_friend",
      ],
      rsvp_status: ["yes", "no", "maybe"],
    },
  },
} as const
