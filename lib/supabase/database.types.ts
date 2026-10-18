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
      admin_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          created_by: string | null
          email: string
          expires_at: string
          id: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["admin_role"]
          society_id: string | null
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string | null
          email: string
          expires_at: string
          id?: string
          revoked_at?: string | null
          role: Database["public"]["Enums"]["admin_role"]
          society_id?: string | null
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          created_by?: string | null
          email?: string
          expires_at?: string
          id?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["admin_role"]
          society_id?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_invites_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["admin_role"]
          society_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["admin_role"]
          society_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["admin_role"]
          society_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_roles_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_label: string
          at: string
          id: number
          society_id: string | null
          summary: Json
          target_id: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_label?: string
          at?: string
          id?: never
          society_id?: string | null
          summary?: Json
          target_id?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_label?: string
          at?: string
          id?: never
          society_id?: string | null
          summary?: Json
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          body: string
          created_at: string
          flagged_at: string | null
          from_admin: boolean
          id: number
          sender_id: string | null
          thread_id: string
        }
        Insert: {
          body: string
          created_at?: string
          flagged_at?: string | null
          from_admin: boolean
          id?: never
          sender_id?: string | null
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string
          flagged_at?: string | null
          from_admin?: boolean
          id?: never
          sender_id?: string | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "chat_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_threads: {
        Row: {
          admin_unread: number
          created_at: string
          id: string
          last_message_at: string
          status: string
          user_id: string
          user_unread: number
        }
        Insert: {
          admin_unread?: number
          created_at?: string
          id?: string
          last_message_at?: string
          status?: string
          user_id: string
          user_unread?: number
        }
        Update: {
          admin_unread?: number
          created_at?: string
          id?: string
          last_message_at?: string
          status?: string
          user_id?: string
          user_unread?: number
        }
        Relationships: [
          {
            foreignKeyName: "chat_threads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_requests: {
        Row: {
          admin_note: string
          created_at: string
          details: Json
          email: string | null
          id: string
          ip_hash: string | null
          is_anonymous: boolean
          kind: Database["public"]["Enums"]["community_kind"]
          message: string
          name: string | null
          organisation: string | null
          phone: string | null
          status: Database["public"]["Enums"]["community_status"]
          subject: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          admin_note?: string
          created_at?: string
          details?: Json
          email?: string | null
          id?: string
          ip_hash?: string | null
          is_anonymous?: boolean
          kind: Database["public"]["Enums"]["community_kind"]
          message: string
          name?: string | null
          organisation?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["community_status"]
          subject: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          admin_note?: string
          created_at?: string
          details?: Json
          email?: string | null
          id?: string
          ip_hash?: string | null
          is_anonymous?: boolean
          kind?: Database["public"]["Enums"]["community_kind"]
          message?: string
          name?: string | null
          organisation?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["community_status"]
          subject?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      event_speakers: {
        Row: {
          event_id: string
          sort_order: number
          speaker_id: string
        }
        Insert: {
          event_id: string
          sort_order?: number
          speaker_id: string
        }
        Update: {
          event_id?: string
          sort_order?: number
          speaker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_speakers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_speakers_speaker_id_fkey"
            columns: ["speaker_id"]
            isOneToOne: false
            referencedRelation: "speakers"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          agenda: Json
          bring: string[]
          capacity: number
          created_at: string
          description: string
          ends_at: string
          formats: string[]
          id: string
          is_finale: boolean
          level: string
          mode: Database["public"]["Enums"]["event_mode"]
          outcomes: string[]
          poster_url: string | null
          prerequisites: string[]
          price_paise: number
          questions: Json
          registration_closes_at: string | null
          registration_opens_at: string | null
          resources: Json
          slug: string
          society_id: string
          starts_at: string
          status: Database["public"]["Enums"]["event_status"]
          step_number: number
          summary: string
          ticket_type: Database["public"]["Enums"]["ticket_type"]
          title: string
          token_prefix: string
          topic: string
          track_id: string | null
          updated_at: string
          venue: string
          video_url: string | null
          winners: Json
        }
        Insert: {
          agenda?: Json
          bring?: string[]
          capacity?: number
          created_at?: string
          description?: string
          ends_at: string
          formats?: string[]
          id?: string
          is_finale?: boolean
          level?: string
          mode?: Database["public"]["Enums"]["event_mode"]
          outcomes?: string[]
          poster_url?: string | null
          prerequisites?: string[]
          price_paise?: number
          questions?: Json
          registration_closes_at?: string | null
          registration_opens_at?: string | null
          resources?: Json
          slug: string
          society_id: string
          starts_at: string
          status?: Database["public"]["Enums"]["event_status"]
          step_number: number
          summary?: string
          ticket_type?: Database["public"]["Enums"]["ticket_type"]
          title: string
          token_prefix?: string
          topic?: string
          track_id?: string | null
          updated_at?: string
          venue?: string
          video_url?: string | null
          winners?: Json
        }
        Update: {
          agenda?: Json
          bring?: string[]
          capacity?: number
          created_at?: string
          description?: string
          ends_at?: string
          formats?: string[]
          id?: string
          is_finale?: boolean
          level?: string
          mode?: Database["public"]["Enums"]["event_mode"]
          outcomes?: string[]
          poster_url?: string | null
          prerequisites?: string[]
          price_paise?: number
          questions?: Json
          registration_closes_at?: string | null
          registration_opens_at?: string | null
          resources?: Json
          slug?: string
          society_id?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["event_status"]
          step_number?: number
          summary?: string
          ticket_type?: Database["public"]["Enums"]["ticket_type"]
          title?: string
          token_prefix?: string
          topic?: string
          track_id?: string | null
          updated_at?: string
          venue?: string
          video_url?: string | null
          winners?: Json
        }
        Relationships: [
          {
            foreignKeyName: "events_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      faqs: {
        Row: {
          answer: string
          created_at: string
          id: string
          question: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          answer: string
          created_at?: string
          id?: string
          question: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          answer?: string
          created_at?: string
          id?: string
          question?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      gallery_items: {
        Row: {
          alt: string
          caption: string
          created_at: string
          event_id: string | null
          id: string
          image_url: string | null
          ratio: string
          society_id: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          alt?: string
          caption?: string
          created_at?: string
          event_id?: string | null
          id?: string
          image_url?: string | null
          ratio?: string
          society_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          alt?: string
          caption?: string
          created_at?: string
          event_id?: string | null
          id?: string
          image_url?: string | null
          ratio?: string
          society_id?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gallery_items_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gallery_items_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      ieee_claims: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          member_number: string
          method: string | null
          prescreen: Json
          prescreen_attempts: number
          prescreen_status: string
          proof_path: string | null
          reject_reason: string | null
          roster_matched: boolean
          status: Database["public"]["Enums"]["ieee_claim_status"]
          updated_at: string
          user_id: string
          verified_until: string | null
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          member_number: string
          method?: string | null
          prescreen?: Json
          prescreen_attempts?: number
          prescreen_status?: string
          proof_path?: string | null
          reject_reason?: string | null
          roster_matched?: boolean
          status: Database["public"]["Enums"]["ieee_claim_status"]
          updated_at?: string
          user_id: string
          verified_until?: string | null
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          member_number?: string
          method?: string | null
          prescreen?: Json
          prescreen_attempts?: number
          prescreen_status?: string
          proof_path?: string | null
          reject_reason?: string | null
          roster_matched?: boolean
          status?: Database["public"]["Enums"]["ieee_claim_status"]
          updated_at?: string
          user_id?: string
          verified_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ieee_claims_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_experience: {
        Row: {
          created_at: string
          description: string
          end_date: string | null
          id: string
          organization: string
          sort_order: number
          start_date: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string
          end_date?: string | null
          id?: string
          organization: string
          sort_order?: number
          start_date: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string
          end_date?: string | null
          id?: string
          organization?: string
          sort_order?: number
          start_date?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_experience_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_private: {
        Row: {
          created_at: string
          email: string
          ieee_member_id: string
          phone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string
          ieee_member_id?: string
          phone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          ieee_member_id?: string
          phone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profile_projects: {
        Row: {
          created_at: string
          description: string
          id: string
          image_url: string | null
          sort_order: number
          title: string
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          image_url?: string | null
          sort_order?: number
          title: string
          updated_at?: string
          url?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          image_url?: string | null
          sort_order?: number
          title?: string
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_projects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string
          branch: string
          college: string
          created_at: string
          full_name: string
          handle: string
          headline: string
          id: string
          links: Json
          onboarded: boolean
          skills: string[]
          updated_at: string
          year: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string
          branch?: string
          college?: string
          created_at?: string
          full_name?: string
          handle: string
          headline?: string
          id: string
          links?: Json
          onboarded?: boolean
          skills?: string[]
          updated_at?: string
          year?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string
          branch?: string
          college?: string
          created_at?: string
          full_name?: string
          handle?: string
          headline?: string
          id?: string
          links?: Json
          onboarded?: boolean
          skills?: string[]
          updated_at?: string
          year?: string
        }
        Relationships: []
      }
      registrations: {
        Row: {
          amount_paise: number
          answers: Json
          cancel_reason: string | null
          cancelled_at: string | null
          checked_in_at: string | null
          checked_in_by: string | null
          confirmed_at: string | null
          created_at: string
          event_id: string
          hold_expires_at: string | null
          id: string
          paid_at: string | null
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          razorpay_refund_id: string | null
          receipt_number: string | null
          refund_claimed_until: string | null
          refunded_at: string | null
          status: Database["public"]["Enums"]["registration_status"]
          ticket_code: string
          token_number: number | null
          updated_at: string
          user_id: string
          waitlist_position: number | null
        }
        Insert: {
          amount_paise?: number
          answers?: Json
          cancel_reason?: string | null
          cancelled_at?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          confirmed_at?: string | null
          created_at?: string
          event_id: string
          hold_expires_at?: string | null
          id?: string
          paid_at?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_refund_id?: string | null
          receipt_number?: string | null
          refund_claimed_until?: string | null
          refunded_at?: string | null
          status: Database["public"]["Enums"]["registration_status"]
          ticket_code: string
          token_number?: number | null
          updated_at?: string
          user_id: string
          waitlist_position?: number | null
        }
        Update: {
          amount_paise?: number
          answers?: Json
          cancel_reason?: string | null
          cancelled_at?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          confirmed_at?: string | null
          created_at?: string
          event_id?: string
          hold_expires_at?: string | null
          id?: string
          paid_at?: string | null
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_refund_id?: string | null
          receipt_number?: string | null
          refund_claimed_until?: string | null
          refunded_at?: string | null
          status?: Database["public"]["Enums"]["registration_status"]
          ticket_code?: string
          token_number?: number | null
          updated_at?: string
          user_id?: string
          waitlist_position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      site_blocks: {
        Row: {
          data: Json
          key: string
          updated_at: string
        }
        Insert: {
          data?: Json
          key: string
          updated_at?: string
        }
        Update: {
          data?: Json
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      societies: {
        Row: {
          color: string
          created_at: string
          description: string
          id: string
          logo_url: string | null
          name: string
          page_content: Json
          short_name: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color: string
          created_at?: string
          description?: string
          id?: string
          logo_url?: string | null
          name: string
          page_content?: Json
          short_name: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          description?: string
          id?: string
          logo_url?: string | null
          name?: string
          page_content?: Json
          short_name?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      speakers: {
        Row: {
          bio: string
          created_at: string
          designation: string
          id: string
          links: Json
          name: string
          organization: string
          photo_url: string | null
          slug: string
          society_id: string | null
          sort_order: number
          topic: string
          updated_at: string
        }
        Insert: {
          bio?: string
          created_at?: string
          designation?: string
          id?: string
          links?: Json
          name: string
          organization?: string
          photo_url?: string | null
          slug: string
          society_id?: string | null
          sort_order?: number
          topic?: string
          updated_at?: string
        }
        Update: {
          bio?: string
          created_at?: string
          designation?: string
          id?: string
          links?: Json
          name?: string
          organization?: string
          photo_url?: string | null
          slug?: string
          society_id?: string | null
          sort_order?: number
          topic?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "speakers_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
      sponsors: {
        Row: {
          created_at: string
          id: string
          logo_url: string | null
          name: string
          sort_order: number
          tier: string
          tier_size: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          sort_order?: number
          tier: string
          tier_size?: string
          updated_at?: string
          url?: string
        }
        Update: {
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          sort_order?: number
          tier?: string
          tier_size?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          created_at: string
          fun_fact: string
          group: string
          id: string
          links: Json
          name: string
          photo_url: string | null
          role: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          fun_fact?: string
          group: string
          id?: string
          links?: Json
          name: string
          photo_url?: string | null
          role: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          fun_fact?: string
          group?: string
          id?: string
          links?: Json
          name?: string
          photo_url?: string | null
          role?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      testimonials: {
        Row: {
          created_at: string
          detail: string
          id: string
          name: string
          photo_url: string | null
          quote: string
          sort_order: number
          step_label: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          detail?: string
          id?: string
          name: string
          photo_url?: string | null
          quote: string
          sort_order?: number
          step_label?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          detail?: string
          id?: string
          name?: string
          photo_url?: string | null
          quote?: string
          sort_order?: number
          step_label?: string
          updated_at?: string
        }
        Relationships: []
      }
      tracks: {
        Row: {
          created_at: string
          description: string
          id: string
          name: string
          society_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          name: string
          society_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          name?: string
          society_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracks_society_id_fkey"
            columns: ["society_id"]
            isOneToOne: false
            referencedRelation: "societies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      event_attendees: {
        Row: {
          avatar_url: string | null
          event_id: string | null
          full_name: string | null
          handle: string | null
          headline: string | null
        }
        Relationships: []
      }
      event_seat_counts: {
        Row: {
          attending: number | null
          event_id: string | null
          seats_taken: number | null
          waitlisted: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_admin_invite: { Args: { p_token_hash: string }; Returns: Json }
      admin_cancel_event: { Args: { p_event_id: string }; Returns: Json }
      admin_cancel_registration: {
        Args: { p_registration_id: string }
        Returns: Json
      }
      admin_check_in: {
        Args: {
          p_code?: string
          p_confirm?: boolean
          p_event_id: string
          p_registration_id?: string
        }
        Returns: Json
      }
      admin_chat_block: {
        Args: { p_reason: string; p_user_id: string }
        Returns: undefined
      }
      admin_chat_close: { Args: { p_thread_id: string }; Returns: undefined }
      admin_chat_flag: { Args: { p_message_id: number }; Returns: undefined }
      admin_chat_threads: {
        Args: { p_limit: number; p_offset: number; p_status: string }
        Returns: Json
      }
      admin_chat_unblock: { Args: { p_user_id: string }; Returns: undefined }
      admin_claim_proof: { Args: { p_claim_id: string }; Returns: string }
      admin_decide_claim: {
        Args: {
          p_approve: boolean
          p_claim_id: string
          p_reason: string
          p_verified_until: string
        }
        Returns: undefined
      }
      admin_event_registrants: {
        Args: {
          p_event_id: string
          p_limit?: number
          p_offset?: number
          p_q?: string
          p_status?: string
        }
        Returns: Json
      }
      admin_inbox_counts: { Args: never; Returns: Json }
      admin_membership_queue: {
        Args: { p_limit: number; p_offset: number }
        Returns: Json
      }
      admin_overview: { Args: { p_society_id?: string }; Returns: Json }
      admin_payments_flag: { Args: never; Returns: boolean }
      admin_promote_waitlist: { Args: { p_event_id: string }; Returns: Json }
      admin_revoke_claim: { Args: { p_claim_id: string }; Returns: undefined }
      admin_roster_status: { Args: never; Returns: Json }
      admin_undo_check_in: {
        Args: { p_registration_id: string }
        Returns: Json
      }
      admin_verified_members: {
        Args: { p_limit: number; p_offset: number }
        Returns: Json
      }
      anonymise_user: { Args: { p_user_id: string }; Returns: Json }
      attach_payment_order: {
        Args: {
          p_amount_paise: number
          p_order_id: string
          p_registration_id: string
          p_user_id: string
        }
        Returns: Json
      }
      begin_prescreen: { Args: { p_claim_id: string }; Returns: Json }
      cancel_registration: {
        Args: { p_registration_id: string }
        Returns: Json
      }
      chat_mark_read: { Args: { p_thread_id: string }; Returns: undefined }
      chat_send: {
        Args: { p_body: string; p_thread_id: string }
        Returns: Json
      }
      chat_state: { Args: never; Returns: Json }
      claim_refund: { Args: { p_registration_id: string }; Returns: Json }
      claim_sync_batch: { Args: { p_limit?: number }; Returns: Json }
      complete_sync: {
        Args: {
          p_error?: string
          p_id: string
          p_ok: boolean
          p_permanent?: boolean
        }
        Returns: string
      }
      confirm_payment: {
        Args: {
          p_amount_paise: number
          p_currency: string
          p_details?: Json
          p_event_id?: string
          p_event_name?: string
          p_order_id: string
          p_payment_id: string
          p_registration_id: string
          p_source: string
        }
        Returns: Json
      }
      expire_holds: { Args: { p_limit?: number }; Returns: Json }
      import_ieee_roster: {
        Args: { p_replace: boolean; p_rows: Json }
        Returns: Json
      }
      log_admin_event: {
        Args: {
          p_action: string
          p_society_id: string
          p_summary?: Json
          p_target_id: string
          p_target_type: string
        }
        Returns: undefined
      }
      mark_refunded: {
        Args: {
          p_amount_paise: number
          p_event_id?: string
          p_payment_id: string
          p_refund_id: string
          p_registration_id: string
          p_source: string
        }
        Returns: Json
      }
      my_membership: { Args: never; Returns: Json }
      profile_verified: { Args: { p_user: string }; Returns: boolean }
      record_prescreen: {
        Args: { p_claim_id: string; p_ok: boolean; p_result: Json }
        Returns: undefined
      }
      purge_community: { Args: never; Returns: Json }
      register_for_event: {
        Args: { p_answers?: Json; p_event_id: string }
        Returns: Json
      }
      submit_community_request: {
        Args: {
          p_anonymous: boolean
          p_details: Json
          p_email: string
          p_hp: string
          p_ip_hash: string
          p_kind: Database["public"]["Enums"]["community_kind"]
          p_message: string
          p_name: string
          p_organisation: string
          p_phone: string
          p_subject: string
        }
        Returns: Json
      }
      submit_ieee_claim: {
        Args: { p_member_number: string; p_proof_path: string }
        Returns: Json
      }
    }
    Enums: {
      admin_role: "super_admin" | "society_admin"
      community_kind: "host_event" | "partner" | "feedback"
      community_status: "new" | "in_review" | "resolved" | "closed"
      event_mode: "offline" | "online" | "hybrid"
      event_status: "draft" | "published" | "cancelled"
      ieee_claim_status:
        | "pending_review"
        | "verified"
        | "rejected"
        | "revoked"
        | "withdrawn"
      registration_status:
        | "pending_payment"
        | "confirmed"
        | "waitlisted"
        | "cancelled"
        | "refunded"
        | "refund_needed"
      ticket_type: "qr" | "token"
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
    Enums: {
      admin_role: ["super_admin", "society_admin"],
      community_kind: ["host_event", "partner", "feedback"],
      community_status: ["new", "in_review", "resolved", "closed"],
      event_mode: ["offline", "online", "hybrid"],
      event_status: ["draft", "published", "cancelled"],
      ieee_claim_status: [
        "pending_review",
        "verified",
        "rejected",
        "revoked",
        "withdrawn",
      ],
      registration_status: [
        "pending_payment",
        "confirmed",
        "waitlisted",
        "cancelled",
        "refunded",
        "refund_needed",
      ],
      ticket_type: ["qr", "token"],
    },
  },
} as const
