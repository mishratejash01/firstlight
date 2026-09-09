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
      article_tags: {
        Row: {
          ai_suggested: boolean
          article_id: string
          created_at: string
          tag_id: string
        }
        Insert: {
          ai_suggested?: boolean
          article_id: string
          created_at?: string
          tag_id: string
        }
        Update: {
          ai_suggested?: boolean
          article_id?: string
          created_at?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_tags_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      article_versions: {
        Row: {
          article_id: string
          body: string | null
          change_note: string | null
          changed_by: string | null
          created_at: string
          headline: string | null
          id: string
          snapshot: Json
          standfirst: string | null
          status: Database["public"]["Enums"]["article_status"] | null
          summary: string | null
          version_number: number
        }
        Insert: {
          article_id: string
          body?: string | null
          change_note?: string | null
          changed_by?: string | null
          created_at?: string
          headline?: string | null
          id?: string
          snapshot: Json
          standfirst?: string | null
          status?: Database["public"]["Enums"]["article_status"] | null
          summary?: string | null
          version_number: number
        }
        Update: {
          article_id?: string
          body?: string | null
          change_note?: string | null
          changed_by?: string | null
          created_at?: string
          headline?: string | null
          id?: string
          snapshot?: Json
          standfirst?: string | null
          status?: Database["public"]["Enums"]["article_status"] | null
          summary?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "article_versions_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      articles: {
        Row: {
          ai_assisted: boolean
          attribution_label: string | null
          attribution_url: string | null
          author_id: string | null
          body: string | null
          canonical_url: string | null
          category_id: string
          created_at: string
          created_by: string | null
          headline: string
          hero_image_alt: string | null
          hero_image_credit: string | null
          hero_image_url: string | null
          id: string
          is_breaking: boolean
          meta_description: string | null
          meta_title: string | null
          origin: Database["public"]["Enums"]["content_origin"]
          published_at: string | null
          read_count: number
          reviewed_by: string | null
          scheduled_for: string | null
          search_vector: unknown
          slug: string
          source_id: string | null
          standfirst: string | null
          status: Database["public"]["Enums"]["article_status"]
          summary: string | null
          updated_at: string
        }
        Insert: {
          ai_assisted?: boolean
          attribution_label?: string | null
          attribution_url?: string | null
          author_id?: string | null
          body?: string | null
          canonical_url?: string | null
          category_id: string
          created_at?: string
          created_by?: string | null
          headline: string
          hero_image_alt?: string | null
          hero_image_credit?: string | null
          hero_image_url?: string | null
          id?: string
          is_breaking?: boolean
          meta_description?: string | null
          meta_title?: string | null
          origin?: Database["public"]["Enums"]["content_origin"]
          published_at?: string | null
          read_count?: number
          reviewed_by?: string | null
          scheduled_for?: string | null
          search_vector?: unknown
          slug: string
          source_id?: string | null
          standfirst?: string | null
          status?: Database["public"]["Enums"]["article_status"]
          summary?: string | null
          updated_at?: string
        }
        Update: {
          ai_assisted?: boolean
          attribution_label?: string | null
          attribution_url?: string | null
          author_id?: string | null
          body?: string | null
          canonical_url?: string | null
          category_id?: string
          created_at?: string
          created_by?: string | null
          headline?: string
          hero_image_alt?: string | null
          hero_image_credit?: string | null
          hero_image_url?: string | null
          id?: string
          is_breaking?: boolean
          meta_description?: string | null
          meta_title?: string | null
          origin?: Database["public"]["Enums"]["content_origin"]
          published_at?: string | null
          read_count?: number
          reviewed_by?: string | null
          scheduled_for?: string | null
          search_vector?: unknown
          slug?: string
          source_id?: string | null
          standfirst?: string | null
          status?: Database["public"]["Enums"]["article_status"]
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "articles_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "authors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      authors: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          links: Json
          slug: string
          title: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          links?: Json
          slug: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          links?: Json
          slug?: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          iptc_label: string | null
          iptc_qcode: string | null
          is_active: boolean
          name: string
          show_in_nav: boolean
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          iptc_label?: string | null
          iptc_qcode?: string | null
          is_active?: boolean
          name: string
          show_in_nav?: boolean
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          iptc_label?: string | null
          iptc_qcode?: string | null
          is_active?: boolean
          name?: string
          show_in_nav?: boolean
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      homepage_placements: {
        Row: {
          article_id: string
          category_id: string | null
          created_at: string
          expires_at: string | null
          id: string
          pinned_by: string | null
          position: number
          starts_at: string
          updated_at: string
          zone: string
        }
        Insert: {
          article_id: string
          category_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          pinned_by?: string | null
          position?: number
          starts_at?: string
          updated_at?: string
          zone: string
        }
        Update: {
          article_id?: string
          category_id?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          pinned_by?: string | null
          position?: number
          starts_at?: string
          updated_at?: string
          zone?: string
        }
        Relationships: [
          {
            foreignKeyName: "homepage_placements_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homepage_placements_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_subscribers: {
        Row: {
          confirmation_token: string
          confirmed_at: string | null
          created_at: string
          email: string
          id: string
          signup_context: string | null
          status: string
          unsubscribed_at: string | null
          updated_at: string
        }
        Insert: {
          confirmation_token?: string
          confirmed_at?: string | null
          created_at?: string
          email: string
          id?: string
          signup_context?: string | null
          status?: string
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Update: {
          confirmation_token?: string
          confirmed_at?: string | null
          created_at?: string
          email?: string
          id?: string
          signup_context?: string | null
          status?: string
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      reading_events: {
        Row: {
          anonymous_id: string | null
          article_id: string | null
          author_id: string | null
          category_id: string | null
          event_type: string
          id: number
          occurred_at: string
          path: string | null
          properties: Json
          referrer: string | null
          session_id: string | null
          tag_id: string | null
          user_id: string | null
        }
        Insert: {
          anonymous_id?: string | null
          article_id?: string | null
          author_id?: string | null
          category_id?: string | null
          event_type: string
          id?: never
          occurred_at?: string
          path?: string | null
          properties?: Json
          referrer?: string | null
          session_id?: string | null
          tag_id?: string | null
          user_id?: string | null
        }
        Update: {
          anonymous_id?: string | null
          article_id?: string | null
          author_id?: string | null
          category_id?: string | null
          event_type?: string
          id?: never
          occurred_at?: string
          path?: string | null
          properties?: Json
          referrer?: string | null
          session_id?: string | null
          tag_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reading_events_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_events_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "authors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_events_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reading_events_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      source_licences: {
        Row: {
          allow_full_text: boolean
          attribution_required: boolean
          created_at: string
          feed_format: string | null
          feed_url: string | null
          ingest_config: Json
          last_ingest_error: string | null
          last_ingested_at: string | null
          licence_expires_at: string | null
          licence_holder: string | null
          licence_starts_at: string | null
          licence_terms: string | null
          source_id: string
          updated_at: string
        }
        Insert: {
          allow_full_text?: boolean
          attribution_required?: boolean
          created_at?: string
          feed_format?: string | null
          feed_url?: string | null
          ingest_config?: Json
          last_ingest_error?: string | null
          last_ingested_at?: string | null
          licence_expires_at?: string | null
          licence_holder?: string | null
          licence_starts_at?: string | null
          licence_terms?: string | null
          source_id: string
          updated_at?: string
        }
        Update: {
          allow_full_text?: boolean
          attribution_required?: boolean
          created_at?: string
          feed_format?: string | null
          feed_url?: string | null
          ingest_config?: Json
          last_ingest_error?: string | null
          last_ingested_at?: string | null
          licence_expires_at?: string | null
          licence_holder?: string | null
          licence_starts_at?: string | null
          licence_terms?: string | null
          source_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "source_licences_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: true
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          created_at: string
          homepage_url: string | null
          id: string
          is_active: boolean
          name: string
          origin: Database["public"]["Enums"]["content_origin"]
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          homepage_url?: string | null
          id?: string
          is_active?: boolean
          name: string
          origin: Database["public"]["Enums"]["content_origin"]
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          homepage_url?: string | null
          id?: string
          is_active?: boolean
          name?: string
          origin?: Database["public"]["Enums"]["content_origin"]
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          created_at: string
          description: string | null
          id: string
          iptc_qcode: string | null
          is_active: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          iptc_qcode?: string | null
          is_active?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          iptc_qcode?: string | null
          is_active?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      subscribe_to_newsletter: {
        Args: { p_context?: string; p_email: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "editor" | "author"
      article_status:
        | "draft"
        | "in_review"
        | "scheduled"
        | "published"
        | "archived"
        | "rejected"
      content_origin: "wire" | "original" | "curated"
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
      app_role: ["admin", "editor", "author"],
      article_status: [
        "draft",
        "in_review",
        "scheduled",
        "published",
        "archived",
        "rejected",
      ],
      content_origin: ["wire", "original", "curated"],
    },
  },
} as const
