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
            referencedRelation: "event_seat_counts"
            referencedColumns: ["event_id"]
          },
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
            referencedRelation: "event_seat_counts"
            referencedColumns: ["event_id"]
          },
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
      event_seat_counts: {
        Row: {
          event_id: string | null
          seats_taken: number | null
        }
        Insert: {
          event_id?: string | null
          seats_taken?: never
        }
        Update: {
          event_id?: string | null
          seats_taken?: never
        }
        Relationships: []
      }
    }
    Functions: {
      is_any_admin: { Args: never; Returns: boolean }
      is_society_admin: { Args: { sid: string }; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      admin_role: "super_admin" | "society_admin"
      event_mode: "offline" | "online" | "hybrid"
      event_status: "draft" | "published" | "cancelled"
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
      event_mode: ["offline", "online", "hybrid"],
      event_status: ["draft", "published", "cancelled"],
      ticket_type: ["qr", "token"],
    },
  },
} as const
