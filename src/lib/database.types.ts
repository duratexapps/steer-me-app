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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id?: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      draw_pro_entry_link_teams: {
        Row: {
          created_at: string
          entry_link_id: string
          id: string
          partner_classification_number: number | null
          partner_name: string | null
          partner_role: string | null
          team_number: number
        }
        Insert: {
          created_at?: string
          entry_link_id: string
          id?: string
          partner_classification_number?: number | null
          partner_name?: string | null
          partner_role?: string | null
          team_number: number
        }
        Update: {
          created_at?: string
          entry_link_id?: string
          id?: string
          partner_classification_number?: number | null
          partner_name?: string | null
          partner_role?: string | null
          team_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "draw_pro_entry_link_teams_entry_link_id_fkey"
            columns: ["entry_link_id"]
            isOneToOne: false
            referencedRelation: "draw_pro_entry_links"
            referencedColumns: ["id"]
          },
        ]
      }
      draw_pro_entry_links: {
        Row: {
          created_at: string
          event_id: string
          id: string
          role: string | null
          steer_me_user_id: string
          token: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          role?: string | null
          steer_me_user_id: string
          token?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          role?: string | null
          steer_me_user_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "draw_pro_entry_links_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draw_pro_entry_links_steer_me_user_id_fkey"
            columns: ["steer_me_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draw_pro_entry_links_steer_me_user_id_fkey"
            columns: ["steer_me_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      draw_pro_round_results: {
        Row: {
          broken_barrier: boolean
          created_at: string
          entry_link_team_id: string
          final_time: number | null
          id: string
          no_time: boolean
          one_leg_catch: boolean
          penalty_seconds: number
          raw_time: number | null
          round: number
          updated_at: string
        }
        Insert: {
          broken_barrier?: boolean
          created_at?: string
          entry_link_team_id: string
          final_time?: number | null
          id?: string
          no_time?: boolean
          one_leg_catch?: boolean
          penalty_seconds?: number
          raw_time?: number | null
          round: number
          updated_at?: string
        }
        Update: {
          broken_barrier?: boolean
          created_at?: string
          entry_link_team_id?: string
          final_time?: number | null
          id?: string
          no_time?: boolean
          one_leg_catch?: boolean
          penalty_seconds?: number
          raw_time?: number | null
          round?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "draw_pro_round_results_entry_link_team_id_fkey"
            columns: ["entry_link_team_id"]
            isOneToOne: false
            referencedRelation: "draw_pro_entry_link_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_handoffs: {
        Row: {
          consumed_at: string | null
          created_at: string
          created_by: string
          event_id: string
          expires_at: string
          id: string
          me_classification: number | null
          me_contact: string | null
          me_first_name: string
          me_global_membership_id: string | null
          me_last_name: string
          me_role: string | null
          partner_classification: number | null
          partner_contact: string | null
          partner_first_name: string | null
          partner_global_membership_id: string | null
          partner_last_name: string | null
          partner_role: string | null
        }
        Insert: {
          consumed_at?: string | null
          created_at?: string
          created_by: string
          event_id: string
          expires_at?: string
          id?: string
          me_classification?: number | null
          me_contact?: string | null
          me_first_name: string
          me_global_membership_id?: string | null
          me_last_name: string
          me_role?: string | null
          partner_classification?: number | null
          partner_contact?: string | null
          partner_first_name?: string | null
          partner_global_membership_id?: string | null
          partner_last_name?: string | null
          partner_role?: string | null
        }
        Update: {
          consumed_at?: string | null
          created_at?: string
          created_by?: string
          event_id?: string
          expires_at?: string
          id?: string
          me_classification?: number | null
          me_contact?: string | null
          me_first_name?: string
          me_global_membership_id?: string | null
          me_last_name?: string
          me_role?: string | null
          partner_classification?: number | null
          partner_contact?: string | null
          partner_first_name?: string | null
          partner_global_membership_id?: string | null
          partner_last_name?: string | null
          partner_role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entry_handoffs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_handoffs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_handoffs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_attendance: {
        Row: {
          athlete_id: string
          created_at: string
          division: number
          event_id: string
        }
        Insert: {
          athlete_id?: string
          created_at?: string
          division: number
          event_id: string
        }
        Update: {
          athlete_id?: string
          created_at?: string
          division?: number
          event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_attendance_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendance_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_attendance_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_ratings: {
        Row: {
          athlete_id: string
          created_at: string
          event_id: string
          id: string
          review: string | null
          stars: number
        }
        Insert: {
          athlete_id?: string
          created_at?: string
          event_id: string
          id?: string
          review?: string | null
          stars: number
        }
        Update: {
          athlete_id?: string
          created_at?: string
          event_id?: string
          id?: string
          review?: string | null
          stars?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_ratings_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_ratings_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_ratings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_reports: {
        Row: {
          created_at: string
          description: string
          event_id: string
          id: string
          offense: string
          priority: string
          reporter_id: string
          status: string
        }
        Insert: {
          created_at?: string
          description: string
          event_id: string
          id?: string
          offense: string
          priority?: string
          reporter_id?: string
          status?: string
        }
        Update: {
          created_at?: string
          description?: string
          event_id?: string
          id?: string
          offense?: string
          priority?: string
          reporter_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_reports_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          admin_poster_id: string | null
          created_at: string
          description: string | null
          division_details: Json | null
          divisions: number[]
          draw_pro_entry_url: string | null
          draw_pro_event_id: string | null
          entry_fee: string | null
          event_date: string
          event_end_date: string | null
          external_producer_name: string | null
          flier_path: string | null
          id: string
          location: string
          name: string
          posted_by_admin: boolean
          producer_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          admin_poster_id?: string | null
          created_at?: string
          description?: string | null
          division_details?: Json | null
          divisions: number[]
          draw_pro_entry_url?: string | null
          draw_pro_event_id?: string | null
          entry_fee?: string | null
          event_date: string
          event_end_date?: string | null
          external_producer_name?: string | null
          flier_path?: string | null
          id?: string
          location: string
          name: string
          posted_by_admin?: boolean
          producer_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          admin_poster_id?: string | null
          created_at?: string
          description?: string | null
          division_details?: Json | null
          divisions?: number[]
          draw_pro_entry_url?: string | null
          draw_pro_event_id?: string | null
          entry_fee?: string | null
          event_date?: string
          event_end_date?: string | null
          external_producer_name?: string | null
          flier_path?: string | null
          id?: string
          location?: string
          name?: string
          posted_by_admin?: boolean
          producer_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_admin_poster_id_fkey"
            columns: ["admin_poster_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_admin_poster_id_fkey"
            columns: ["admin_poster_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "producer_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_producer_id_fkey"
            columns: ["producer_id"]
            isOneToOne: false
            referencedRelation: "public_producer_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          favorite_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          favorite_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          favorite_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_favorite_id_fkey"
            columns: ["favorite_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_favorite_id_fkey"
            columns: ["favorite_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      issue_reports: {
        Row: {
          created_at: string
          description: string
          draft_reply: string | null
          id: string
          page_context: string | null
          reporter_id: string
          reporter_name_override: string | null
          resolution_type: string | null
          role: string
          screenshot_path: string | null
          status: string
          triage_note: string | null
          triaged_at: string | null
        }
        Insert: {
          created_at?: string
          description: string
          draft_reply?: string | null
          id?: string
          page_context?: string | null
          reporter_id?: string
          reporter_name_override?: string | null
          resolution_type?: string | null
          role: string
          screenshot_path?: string | null
          status?: string
          triage_note?: string | null
          triaged_at?: string | null
        }
        Update: {
          created_at?: string
          description?: string
          draft_reply?: string | null
          id?: string
          page_context?: string | null
          reporter_id?: string
          reporter_name_override?: string | null
          resolution_type?: string | null
          role?: string
          screenshot_path?: string | null
          status?: string
          triage_note?: string | null
          triaged_at?: string | null
        }
        Relationships: []
      }
      need_post_visible_to: {
        Row: {
          athlete_id: string
          need_post_id: string
        }
        Insert: {
          athlete_id: string
          need_post_id: string
        }
        Update: {
          athlete_id?: string
          need_post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "need_post_visible_to_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "need_post_visible_to_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "need_post_visible_to_need_post_id_fkey"
            columns: ["need_post_id"]
            isOneToOne: false
            referencedRelation: "need_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      need_posts: {
        Row: {
          athlete_id: string
          created_at: string
          division: number | null
          event_date: string
          event_id: string | null
          event_name: string
          facebook_link: string | null
          flier_path: string | null
          id: string
          is_goat_roping: boolean
          location: string | null
          producer_name: string
          visibility: string
        }
        Insert: {
          athlete_id?: string
          created_at?: string
          division?: number | null
          event_date: string
          event_id?: string | null
          event_name: string
          facebook_link?: string | null
          flier_path?: string | null
          id?: string
          is_goat_roping?: boolean
          location?: string | null
          producer_name: string
          visibility?: string
        }
        Update: {
          athlete_id?: string
          created_at?: string
          division?: number | null
          event_date?: string
          event_id?: string | null
          event_name?: string
          facebook_link?: string | null
          flier_path?: string | null
          id?: string
          is_goat_roping?: boolean
          location?: string | null
          producer_name?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "need_posts_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "need_posts_athlete_id_fkey"
            columns: ["athlete_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "need_posts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_requests: {
        Row: {
          created_at: string
          division: number | null
          event_id: string | null
          id: string
          is_goat_roping: boolean
          need_post_id: string | null
          recipient_id: string
          requester_id: string
          responded_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          division?: number | null
          event_id?: string | null
          id?: string
          is_goat_roping?: boolean
          need_post_id?: string | null
          recipient_id: string
          requester_id?: string
          responded_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          division?: number | null
          event_id?: string | null
          id?: string
          is_goat_roping?: boolean
          need_post_id?: string | null
          recipient_id?: string
          requester_id?: string
          responded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_requests_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_requests_need_post_id_fkey"
            columns: ["need_post_id"]
            isOneToOne: false
            referencedRelation: "need_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_requests_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_requests_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      producer_profiles: {
        Row: {
          affiliation: string | null
          contact_info: string | null
          contact_name: string | null
          created_at: string
          id: string
          org_name: string
          updated_at: string
          verification_doc_path: string | null
          verification_status: string
        }
        Insert: {
          affiliation?: string | null
          contact_info?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          org_name: string
          updated_at?: string
          verification_doc_path?: string | null
          verification_status?: string
        }
        Update: {
          affiliation?: string | null
          contact_info?: string | null
          contact_name?: string | null
          created_at?: string
          id?: string
          org_name?: string
          updated_at?: string
          verification_doc_path?: string | null
          verification_status?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          contact: string | null
          created_at: string
          expo_push_token: string | null
          full_name: string
          global_classification: number | null
          global_membership_id: string | null
          guardian_consent_at: string | null
          guardian_contact: string | null
          guardian_name: string | null
          guidelines_accepted_at: string
          header_classification: number | null
          heeler_classification: number | null
          home_area: string
          id: string
          is_admin: boolean
          is_minor: boolean
          membership_expiration_date: string | null
          needs_manual_review: boolean
          position: string
          referral_code: string | null
          referral_reward_granted_at: string | null
          referred_by: string | null
          scrubbed: boolean
          suspended: boolean
          suspended_reason: string | null
          updated_at: string
          verification_screenshot_path: string | null
        }
        Insert: {
          avatar_url?: string | null
          contact?: string | null
          created_at?: string
          expo_push_token?: string | null
          full_name: string
          global_classification?: number | null
          global_membership_id?: string | null
          guardian_consent_at?: string | null
          guardian_contact?: string | null
          guardian_name?: string | null
          guidelines_accepted_at?: string
          header_classification?: number | null
          heeler_classification?: number | null
          home_area: string
          id?: string
          is_admin?: boolean
          is_minor?: boolean
          membership_expiration_date?: string | null
          needs_manual_review?: boolean
          position: string
          referral_code?: string | null
          referral_reward_granted_at?: string | null
          referred_by?: string | null
          scrubbed?: boolean
          suspended?: boolean
          suspended_reason?: string | null
          updated_at?: string
          verification_screenshot_path?: string | null
        }
        Update: {
          avatar_url?: string | null
          contact?: string | null
          created_at?: string
          expo_push_token?: string | null
          full_name?: string
          global_classification?: number | null
          global_membership_id?: string | null
          guardian_consent_at?: string | null
          guardian_contact?: string | null
          guardian_name?: string | null
          guidelines_accepted_at?: string
          header_classification?: number | null
          heeler_classification?: number | null
          home_area?: string
          id?: string
          is_admin?: boolean
          is_minor?: boolean
          membership_expiration_date?: string | null
          needs_manual_review?: boolean
          position?: string
          referral_code?: string | null
          referral_reward_granted_at?: string | null
          referred_by?: string | null
          scrubbed?: boolean
          suspended?: boolean
          suspended_reason?: string | null
          updated_at?: string
          verification_screenshot_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_referred_by_fkey"
            columns: ["referred_by"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          entitlement_active: boolean
          expires_at: string | null
          id: string
          product_id: string | null
          updated_at: string
        }
        Insert: {
          entitlement_active?: boolean
          expires_at?: string | null
          id: string
          product_id?: string | null
          updated_at?: string
        }
        Update: {
          entitlement_active?: boolean
          expires_at?: string | null
          id?: string
          product_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      town_distances: {
        Row: {
          created_at: string
          destination_town: string
          id: string
          miles: number
          origin_town: string
        }
        Insert: {
          created_at?: string
          destination_town: string
          id?: string
          miles: number
          origin_town: string
        }
        Update: {
          created_at?: string
          destination_town?: string
          id?: string
          miles?: number
          origin_town?: string
        }
        Relationships: []
      }
      user_reports: {
        Row: {
          content_ref: string | null
          created_at: string
          description: string
          id: string
          offense: string
          reporter_id: string
          status: string
          target_user_id: string
        }
        Insert: {
          content_ref?: string | null
          created_at?: string
          description: string
          id?: string
          offense: string
          reporter_id?: string
          status?: string
          target_user_id: string
        }
        Update: {
          content_ref?: string | null
          created_at?: string
          description?: string
          id?: string
          offense?: string
          reporter_id?: string
          status?: string
          target_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "public_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      event_rating_summary: {
        Row: {
          avg_stars: number | null
          event_id: string | null
          rating_count: number | null
        }
        Relationships: [
          {
            foreignKeyName: "event_ratings_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      public_producer_profiles: {
        Row: {
          id: string | null
          org_name: string | null
          verification_status: string | null
        }
        Insert: {
          id?: string | null
          org_name?: string | null
          verification_status?: string | null
        }
        Update: {
          id?: string | null
          org_name?: string | null
          verification_status?: string | null
        }
        Relationships: []
      }
      public_profiles: {
        Row: {
          avatar_url: string | null
          full_name: string | null
          global_classification: number | null
          header_classification: number | null
          heeler_classification: number | null
          home_area: string | null
          id: string | null
          is_minor: boolean | null
          membership_expiration_date: string | null
          position: string | null
        }
        Insert: {
          avatar_url?: string | null
          full_name?: string | null
          global_classification?: number | null
          header_classification?: number | null
          heeler_classification?: number | null
          home_area?: string | null
          id?: string | null
          is_minor?: boolean | null
          membership_expiration_date?: string | null
          position?: string | null
        }
        Update: {
          avatar_url?: string | null
          full_name?: string | null
          global_classification?: number | null
          header_classification?: number | null
          heeler_classification?: number | null
          home_area?: string | null
          id?: string | null
          is_minor?: boolean | null
          membership_expiration_date?: string | null
          position?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      create_draw_pro_entry_link: {
        Args: { p_event_id: string; p_role?: string }
        Returns: string
      }
      create_entry_handoff: {
        Args: {
          p_event_id: string
          p_me_role?: string
          p_partner_request_id?: string
          p_partner_role?: string
        }
        Returns: string
      }
      generate_referral_code: { Args: never; Returns: string }
      get_blocked_profiles: {
        Args: never
        Returns: {
          avatar_url: string
          full_name: string
          global_classification: number
          header_classification: number
          heeler_classification: number
          home_area: string
          id: string
          position: string
        }[]
      }
      get_referral_stats: {
        Args: never
        Returns: {
          referred_count: number
          rewarded_count: number
        }[]
      }
      get_request_contact: {
        Args: { request_id: string }
        Returns: {
          contact: string
          guardian_name: string
          is_guardian: boolean
          verification_screenshot_path: string
        }[]
      }
      has_active_subscription: { Args: { uid: string }; Returns: boolean }
      is_blocked_pair: { Args: { a: string; b: string }; Returns: boolean }
      is_favorited_by: {
        Args: { poster: string; viewer: string }
        Returns: boolean
      }
      is_selected_for_post: {
        Args: { post_id: string; viewer: string }
        Returns: boolean
      }
      is_suspended: { Args: { uid: string }; Returns: boolean }
      resolve_referral_code: { Args: { code: string }; Returns: string }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
