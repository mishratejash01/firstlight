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
      ai_key_health: {
        Row: {
          calls: number
          cooling_until: string | null
          errors: number
          key_id: string
          label: string
          last_error: string | null
          last_error_at: string | null
          last_used_at: string | null
          provider: string
          updated_at: string
        }
        Insert: {
          calls?: number
          cooling_until?: string | null
          errors?: number
          key_id: string
          label: string
          last_error?: string | null
          last_error_at?: string | null
          last_used_at?: string | null
          provider: string
          updated_at?: string
        }
        Update: {
          calls?: number
          cooling_until?: string | null
          errors?: number
          key_id?: string
          label?: string
          last_error?: string | null
          last_error_at?: string | null
          last_used_at?: string | null
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_topics: {
        Row: {
          angle: string | null
          cadence_hours: number
          category_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          last_error: string | null
          last_generated_at: string | null
          times_generated: number
          topic: string
          updated_at: string
        }
        Insert: {
          angle?: string | null
          cadence_hours?: number
          category_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_generated_at?: string | null
          times_generated?: number
          topic: string
          updated_at?: string
        }
        Update: {
          angle?: string | null
          cadence_hours?: number
          category_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_generated_at?: string | null
          times_generated?: number
          topic?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_topics_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          anonymous_id: string | null
          article_id: string | null
          author_id: string | null
          category_id: string | null
          device_type: string | null
          event_type: string
          id: number
          is_server_side: boolean
          occurred_at: string
          path: string | null
          properties: Json
          referrer: string | null
          search_query: string | null
          session_id: string | null
          tag_id: string | null
          user_id: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          anonymous_id?: string | null
          article_id?: string | null
          author_id?: string | null
          category_id?: string | null
          device_type?: string | null
          event_type: string
          id?: never
          is_server_side?: boolean
          occurred_at?: string
          path?: string | null
          properties?: Json
          referrer?: string | null
          search_query?: string | null
          session_id?: string | null
          tag_id?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          anonymous_id?: string | null
          article_id?: string | null
          author_id?: string | null
          category_id?: string | null
          device_type?: string | null
          event_type?: string
          id?: never
          is_server_side?: boolean
          occurred_at?: string
          path?: string | null
          properties?: Json
          referrer?: string | null
          search_query?: string | null
          session_id?: string | null
          tag_id?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
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
      article_entities: {
        Row: {
          ai_suggested: boolean
          article_id: string
          created_at: string
          entity_id: string
          relation: string
          role_note: string | null
        }
        Insert: {
          ai_suggested?: boolean
          article_id: string
          created_at?: string
          entity_id: string
          relation?: string
          role_note?: string | null
        }
        Update: {
          ai_suggested?: boolean
          article_id?: string
          created_at?: string
          entity_id?: string
          relation?: string
          role_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "article_entities_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_entities_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      article_events: {
        Row: {
          article_id: string
          created_at: string
          event_id: string
          position: number
          relation: string
        }
        Insert: {
          article_id: string
          created_at?: string
          event_id: string
          position?: number
          relation?: string
        }
        Update: {
          article_id?: string
          created_at?: string
          event_id?: string
          position?: number
          relation?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_events_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "news_events"
            referencedColumns: ["id"]
          },
        ]
      }
      article_faqs: {
        Row: {
          answer: string
          article_id: string
          created_at: string
          id: string
          position: number
          question: string
          updated_at: string
        }
        Insert: {
          answer: string
          article_id: string
          created_at?: string
          id?: string
          position?: number
          question: string
          updated_at?: string
        }
        Update: {
          answer?: string
          article_id?: string
          created_at?: string
          id?: string
          position?: number
          question?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_faqs_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      article_key_facts: {
        Row: {
          article_id: string
          attribution: string
          created_at: string
          entity_id: string | null
          id: string
          label: string
          position: number
          updated_at: string
          value: string
        }
        Insert: {
          article_id: string
          attribution: string
          created_at?: string
          entity_id?: string | null
          id?: string
          label: string
          position?: number
          updated_at?: string
          value: string
        }
        Update: {
          article_id?: string
          attribution?: string
          created_at?: string
          entity_id?: string | null
          id?: string
          label?: string
          position?: number
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_key_facts_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_key_facts_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      article_reviews: {
        Row: {
          article_id: string
          better_section_id: string | null
          created_at: string
          device: string | null
          event_id: string | null
          id: string
          importance: number
          issues: string[]
          quality: number
          reviewer_id: string
          seconds_spent: number | null
          timing: string
          would_not_run: boolean
        }
        Insert: {
          article_id: string
          better_section_id?: string | null
          created_at?: string
          device?: string | null
          event_id?: string | null
          id?: string
          importance: number
          issues?: string[]
          quality: number
          reviewer_id: string
          seconds_spent?: number | null
          timing: string
          would_not_run?: boolean
        }
        Update: {
          article_id?: string
          better_section_id?: string | null
          created_at?: string
          device?: string | null
          event_id?: string | null
          id?: string
          importance?: number
          issues?: string[]
          quality?: number
          reviewer_id?: string
          seconds_spent?: number | null
          timing?: string
          would_not_run?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "article_reviews_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_reviews_better_section_id_fkey"
            columns: ["better_section_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_reviews_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "story_events"
            referencedColumns: ["id"]
          },
        ]
      }
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
          ai_generated_at: string | null
          ai_model: string | null
          ai_unverified_claims: string[]
          attribution_label: string | null
          attribution_url: string | null
          author_id: string | null
          body: string | null
          canonical_url: string | null
          content_updated_at: string | null
          category_id: string
          created_at: string
          created_by: string | null
          headline: string
          hero_image_alt: string | null
          hero_image_credit: string | null
          hero_image_url: string | null
          id: string
          image_brief: string | null
          image_terms: string | null
          is_breaking: boolean
          meta_description: string | null
          meta_title: string | null
          origin: Database["public"]["Enums"]["content_origin"]
          published_at: string | null
          read_count: number
          reviewed_by: string | null
          scheduled_for: string | null
          search_keywords: string[]
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
          ai_generated_at?: string | null
          ai_model?: string | null
          ai_unverified_claims?: string[]
          attribution_label?: string | null
          attribution_url?: string | null
          author_id?: string | null
          body?: string | null
          canonical_url?: string | null
          content_updated_at?: string | null
          category_id: string
          created_at?: string
          created_by?: string | null
          headline: string
          hero_image_alt?: string | null
          hero_image_credit?: string | null
          hero_image_url?: string | null
          id?: string
          image_brief?: string | null
          image_terms?: string | null
          is_breaking?: boolean
          meta_description?: string | null
          meta_title?: string | null
          origin?: Database["public"]["Enums"]["content_origin"]
          published_at?: string | null
          read_count?: number
          reviewed_by?: string | null
          scheduled_for?: string | null
          search_keywords?: string[]
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
          ai_generated_at?: string | null
          ai_model?: string | null
          ai_unverified_claims?: string[]
          attribution_label?: string | null
          attribution_url?: string | null
          author_id?: string | null
          body?: string | null
          canonical_url?: string | null
          content_updated_at?: string | null
          category_id?: string
          created_at?: string
          created_by?: string | null
          headline?: string
          hero_image_alt?: string | null
          hero_image_credit?: string | null
          hero_image_url?: string | null
          id?: string
          image_brief?: string | null
          image_terms?: string | null
          is_breaking?: boolean
          meta_description?: string | null
          meta_title?: string | null
          origin?: Database["public"]["Enums"]["content_origin"]
          published_at?: string | null
          read_count?: number
          reviewed_by?: string | null
          scheduled_for?: string | null
          search_keywords?: string[]
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
          icon_url: string | null
          id: string
          iptc_label: string | null
          iptc_qcode: string | null
          is_active: boolean
          layout: string
          name: string
          seo_title: string | null
          show_in_nav: boolean
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon_url?: string | null
          id?: string
          iptc_label?: string | null
          iptc_qcode?: string | null
          is_active?: boolean
          layout?: string
          name: string
          seo_title?: string | null
          show_in_nav?: boolean
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon_url?: string | null
          id?: string
          iptc_label?: string | null
          iptc_qcode?: string | null
          is_active?: boolean
          layout?: string
          name?: string
          seo_title?: string | null
          show_in_nav?: boolean
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      desk_decisions: {
        Row: {
          decided_at: string
          details: Json | null
          event_id: string
          id: number
          kind: string
          model_version: number | null
          rank: number | null
          reason: string | null
          score: number | null
        }
        Insert: {
          decided_at?: string
          details?: Json | null
          event_id: string
          id?: never
          kind: string
          model_version?: number | null
          rank?: number | null
          reason?: string | null
          score?: number | null
        }
        Update: {
          decided_at?: string
          details?: Json | null
          event_id?: string
          id?: never
          kind?: string
          model_version?: number | null
          rank?: number | null
          reason?: string | null
          score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "desk_decisions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "story_events"
            referencedColumns: ["id"]
          },
        ]
      }
      engine_locks: {
        Row: {
          claimed_at: string | null
          name: string
          released_at: string | null
        }
        Insert: {
          claimed_at?: string | null
          name: string
          released_at?: string | null
        }
        Update: {
          claimed_at?: string | null
          name?: string
          released_at?: string | null
        }
        Relationships: []
      }
      entities: {
        Row: {
          created_at: string
          description: string | null
          entity_type: string
          id: string
          is_active: boolean
          name: string
          same_as: Json
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          entity_type: string
          id?: string
          is_active?: boolean
          name: string
          same_as?: Json
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          entity_type?: string
          id?: string
          is_active?: boolean
          name?: string
          same_as?: Json
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      entity_hourly: {
        Row: {
          entity: string
          hour: string
          mentions: number
          source_kind: string
        }
        Insert: {
          entity: string
          hour: string
          mentions?: number
          source_kind: string
        }
        Update: {
          entity?: string
          hour?: string
          mentions?: number
          source_kind?: string
        }
        Relationships: []
      }
      event_outcomes: {
        Row: {
          applied: boolean
          created_at: string
          details: Json | null
          event_id: string
          features: Json
          id: string
          label: number
          label_source: string
          weight: number
        }
        Insert: {
          applied?: boolean
          created_at?: string
          details?: Json | null
          event_id: string
          features: Json
          id?: string
          label: number
          label_source: string
          weight?: number
        }
        Update: {
          applied?: boolean
          created_at?: string
          details?: Json | null
          event_id?: string
          features?: Json
          id?: string
          label?: number
          label_source?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_outcomes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "story_events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_reviews: {
        Row: {
          created_at: string
          event_id: string
          id: string
          importance: number | null
          reviewer_id: string
          seconds_spent: number | null
          should_have_written: boolean
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          importance?: number | null
          reviewer_id: string
          seconds_spent?: number | null
          should_have_written: boolean
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          importance?: number | null
          reviewer_id?: string
          seconds_spent?: number | null
          should_have_written?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "event_reviews_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "story_events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_snapshots: {
        Row: {
          at: string
          event_id: string
          features: Json | null
          id: number
          independent_sources: number | null
          mention_count: number | null
          p_big: number | null
          score: number | null
          source_count: number | null
          trigger: string
        }
        Insert: {
          at?: string
          event_id: string
          features?: Json | null
          id?: never
          independent_sources?: number | null
          mention_count?: number | null
          p_big?: number | null
          score?: number | null
          source_count?: number | null
          trigger: string
        }
        Update: {
          at?: string
          event_id?: string
          features?: Json | null
          id?: never
          independent_sources?: number | null
          mention_count?: number | null
          p_big?: number | null
          score?: number | null
          source_count?: number | null
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_snapshots_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "story_events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_updates: {
        Row: {
          anchor: string | null
          author_id: string | null
          body: string
          created_at: string
          created_by: string | null
          event_id: string
          headline: string
          id: string
          is_key_update: boolean
          published_at: string
          updated_at: string
        }
        Insert: {
          anchor?: string | null
          author_id?: string | null
          body: string
          created_at?: string
          created_by?: string | null
          event_id: string
          headline: string
          id?: string
          is_key_update?: boolean
          published_at?: string
          updated_at?: string
        }
        Update: {
          anchor?: string | null
          author_id?: string | null
          body?: string
          created_at?: string
          created_by?: string | null
          event_id?: string
          headline?: string
          id?: string
          is_key_update?: boolean
          published_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_updates_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "authors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_updates_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "news_events"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          id: string
          target_id: string
          target_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          target_id: string
          target_type: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          target_id?: string
          target_type?: string
          user_id?: string
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
      media_assets: {
        Row: {
          alt_text: string | null
          bytes: number | null
          caption: string | null
          created_at: string
          creator: string | null
          credit: string | null
          duration: number | null
          format: string | null
          height: number | null
          id: string
          licence: string | null
          licence_url: string | null
          provider: string | null
          public_id: string
          resource_type: string
          secure_url: string
          source_url: string | null
          uploaded_by: string | null
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          bytes?: number | null
          caption?: string | null
          created_at?: string
          creator?: string | null
          credit?: string | null
          duration?: number | null
          format?: string | null
          height?: number | null
          id?: string
          licence?: string | null
          licence_url?: string | null
          provider?: string | null
          public_id: string
          resource_type: string
          secure_url: string
          source_url?: string | null
          uploaded_by?: string | null
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          bytes?: number | null
          caption?: string | null
          created_at?: string
          creator?: string | null
          credit?: string | null
          duration?: number | null
          format?: string | null
          height?: number | null
          id?: string
          licence?: string | null
          licence_url?: string | null
          provider?: string | null
          public_id?: string
          resource_type?: string
          secure_url?: string
          source_url?: string | null
          uploaded_by?: string | null
          width?: number | null
        }
        Relationships: []
      }
      missed_samples: {
        Row: {
          created_at: string
          event_id: string
          reason: string
          sample_date: string
          score: number | null
        }
        Insert: {
          created_at?: string
          event_id: string
          reason: string
          sample_date: string
          score?: number | null
        }
        Update: {
          created_at?: string
          event_id?: string
          reason?: string
          sample_date?: string
          score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "missed_samples_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: true
            referencedRelation: "story_events"
            referencedColumns: ["id"]
          },
        ]
      }
      model_versions: {
        Row: {
          created_at: string
          examples: number | null
          id: number
          kind: string
          metrics: Json
          notes: string | null
          promoted: boolean
          weights: Json
        }
        Insert: {
          created_at?: string
          examples?: number | null
          id?: never
          kind: string
          metrics?: Json
          notes?: string | null
          promoted?: boolean
          weights: Json
        }
        Update: {
          created_at?: string
          examples?: number | null
          id?: never
          kind?: string
          metrics?: Json
          notes?: string | null
          promoted?: boolean
          weights?: Json
        }
        Relationships: []
      }
      news_events: {
        Row: {
          category_id: string | null
          coverage_ends_at: string | null
          coverage_starts_at: string
          created_at: string
          created_by: string | null
          hero_image_alt: string | null
          hero_image_url: string | null
          id: string
          is_live: boolean
          meta_description: string | null
          meta_title: string | null
          published_at: string | null
          slug: string
          status: string
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          coverage_ends_at?: string | null
          coverage_starts_at?: string
          created_at?: string
          created_by?: string | null
          hero_image_alt?: string | null
          hero_image_url?: string | null
          id?: string
          is_live?: boolean
          meta_description?: string | null
          meta_title?: string | null
          published_at?: string | null
          slug: string
          status?: string
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          coverage_ends_at?: string | null
          coverage_starts_at?: string
          created_at?: string
          created_by?: string | null
          hero_image_alt?: string | null
          hero_image_url?: string | null
          id?: string
          is_live?: boolean
          meta_description?: string | null
          meta_title?: string | null
          published_at?: string | null
          slug?: string
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_events_category_id_fkey"
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
      robots_cache: {
        Row: {
          crawl_delay_seconds: number | null
          fetch_failed: boolean
          fetched_at: string
          host: string
          rules: Json
        }
        Insert: {
          crawl_delay_seconds?: number | null
          fetch_failed?: boolean
          fetched_at?: string
          host: string
          rules?: Json
        }
        Update: {
          crawl_delay_seconds?: number | null
          fetch_failed?: boolean
          fetched_at?: string
          host?: string
          rules?: Json
        }
        Relationships: []
      }
      signal_mentions: {
        Row: {
          body: string | null
          created_at: string | null
          embedding: string | null
          entities: string[]
          event_id: string | null
          external_id: string
          id: number
          magnitude: number | null
          observed_at: string
          raw: Json
          region: string | null
          source_key: string
          source_kind: string
          title: string
          url: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          embedding?: string | null
          entities?: string[]
          event_id?: string | null
          external_id: string
          id?: never
          magnitude?: number | null
          observed_at?: string
          raw?: Json
          region?: string | null
          source_key: string
          source_kind: string
          title: string
          url?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string | null
          embedding?: string | null
          entities?: string[]
          event_id?: string | null
          external_id?: string
          id?: never
          magnitude?: number | null
          observed_at?: string
          raw?: Json
          region?: string | null
          source_key?: string
          source_kind?: string
          title?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "signal_mentions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "story_events"
            referencedColumns: ["id"]
          },
        ]
      }
      signal_weights: {
        Row: {
          anchor: number | null
          feature: string
          mean: number
          observations: number
          updated_at: string
          variance: number
        }
        Insert: {
          anchor?: number | null
          feature: string
          mean: number
          observations?: number
          updated_at?: string
          variance: number
        }
        Update: {
          anchor?: number | null
          feature?: string
          mean?: number
          observations?: number
          updated_at?: string
          variance?: number
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      source_authority: {
        Row: {
          created_at: string
          host: string
          name: string
          note: string | null
          weight: number
        }
        Insert: {
          created_at?: string
          host: string
          name: string
          note?: string | null
          weight?: number
        }
        Update: {
          created_at?: string
          host?: string
          name?: string
          note?: string | null
          weight?: number
        }
        Relationships: []
      }
      source_documents: {
        Row: {
          byline: string | null
          content: string | null
          error: string | null
          excerpt: string | null
          fetched_at: string
          host: string
          id: string
          published_at: string | null
          status: string
          title: string | null
          url: string
          word_count: number | null
        }
        Insert: {
          byline?: string | null
          content?: string | null
          error?: string | null
          excerpt?: string | null
          fetched_at?: string
          host: string
          id?: string
          published_at?: string | null
          status?: string
          title?: string | null
          url: string
          word_count?: number | null
        }
        Update: {
          byline?: string | null
          content?: string | null
          error?: string | null
          excerpt?: string | null
          fetched_at?: string
          host?: string
          id?: string
          published_at?: string | null
          status?: string
          title?: string | null
          url?: string
          word_count?: number | null
        }
        Relationships: []
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
      source_pairs: {
        Row: {
          events_a: number
          events_both: number
          source_a: string
          source_b: string
          updated_at: string
        }
        Insert: {
          events_a?: number
          events_both?: number
          source_a: string
          source_b: string
          updated_at?: string
        }
        Update: {
          events_a?: number
          events_both?: number
          source_a?: string
          source_b?: string
          updated_at?: string
        }
        Relationships: []
      }
      source_stats: {
        Row: {
          events_led: number
          events_seen: number
          lead_score: number
          source_key: string
          source_kind: string
          updated_at: string
        }
        Insert: {
          events_led?: number
          events_seen?: number
          lead_score?: number
          source_key: string
          source_kind: string
          updated_at?: string
        }
        Update: {
          events_led?: number
          events_seen?: number
          lead_score?: number
          source_key?: string
          source_kind?: string
          updated_at?: string
        }
        Relationships: []
      }
      sources: {
        Row: {
          created_at: string
          expanded: boolean
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
          expanded?: boolean
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
          expanded?: boolean
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
      story_events: {
        Row: {
          acceleration: number
          article_id: string | null
          burst: number
          centroid: string | null
          claimed_at: string | null
          corroborated_at: string | null
          corroboration: number
          created_at: string
          entities: string[]
          fast_lane_at: string | null
          first_seen_at: string
          freshness: number
          id: string
          independent_sources: number
          last_error: string | null
          last_seen_at: string
          lead_authority: number
          magnitude: number
          mention_count: number
          novelty: number
          p_big: number | null
          p_big_at: string | null
          region_mix: Json
          relevance: number
          score: number
          score_breakdown: Json
          second_source_at: string | null
          severity: string | null
          source_count: number
          source_keys: string[]
          status: string
          summary: string | null
          surprise: number
          title: string
          triage_angle: string | null
          triage_category: string | null
          triage_reason: string | null
          triage_section: string | null
          triaged_at: string | null
          triaged_score: number | null
          updated_at: string
          urgency: string | null
          verification: Json | null
          write_attempts: number
        }
        Insert: {
          acceleration?: number
          article_id?: string | null
          burst?: number
          centroid?: string | null
          claimed_at?: string | null
          corroborated_at?: string | null
          corroboration?: number
          created_at?: string
          entities?: string[]
          fast_lane_at?: string | null
          first_seen_at?: string
          freshness?: number
          id?: string
          independent_sources?: number
          last_error?: string | null
          last_seen_at?: string
          lead_authority?: number
          magnitude?: number
          mention_count?: number
          novelty?: number
          p_big?: number | null
          p_big_at?: string | null
          region_mix?: Json
          relevance?: number
          score?: number
          score_breakdown?: Json
          second_source_at?: string | null
          severity?: string | null
          source_count?: number
          source_keys?: string[]
          status?: string
          summary?: string | null
          surprise?: number
          title: string
          triage_angle?: string | null
          triage_category?: string | null
          triage_reason?: string | null
          triage_section?: string | null
          triaged_at?: string | null
          triaged_score?: number | null
          updated_at?: string
          urgency?: string | null
          verification?: Json | null
          write_attempts?: number
        }
        Update: {
          acceleration?: number
          article_id?: string | null
          burst?: number
          centroid?: string | null
          claimed_at?: string | null
          corroborated_at?: string | null
          corroboration?: number
          created_at?: string
          entities?: string[]
          fast_lane_at?: string | null
          first_seen_at?: string
          freshness?: number
          id?: string
          independent_sources?: number
          last_error?: string | null
          last_seen_at?: string
          lead_authority?: number
          magnitude?: number
          mention_count?: number
          novelty?: number
          p_big?: number | null
          p_big_at?: string | null
          region_mix?: Json
          relevance?: number
          score?: number
          score_breakdown?: Json
          second_source_at?: string | null
          severity?: string | null
          source_count?: number
          source_keys?: string[]
          status?: string
          summary?: string | null
          surprise?: number
          title?: string
          triage_angle?: string | null
          triage_category?: string | null
          triage_reason?: string | null
          triage_section?: string | null
          triaged_at?: string | null
          triaged_score?: number | null
          updated_at?: string
          urgency?: string | null
          verification?: Json | null
          write_attempts?: number
        }
        Relationships: [
          {
            foreignKeyName: "story_events_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
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
      trend_exclusions: {
        Row: {
          created_at: string
          id: string
          pattern: string
          reason: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          pattern: string
          reason?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          pattern?: string
          reason?: string | null
        }
        Relationships: []
      }
      trending_topics: {
        Row: {
          approx_traffic: string | null
          article_id: string | null
          authority_score: number
          cluster_key: string | null
          corroboration: number
          demand_score: number
          first_seen_at: string
          id: string
          last_seen_at: string
          news_items: Json
          previous_traffic_rank: number | null
          region: string
          signal_score: number
          status: string
          term: string
          traffic_rank: number | null
          triage_category: string | null
          triage_reason: string | null
          velocity: number | null
        }
        Insert: {
          approx_traffic?: string | null
          article_id?: string | null
          authority_score?: number
          cluster_key?: string | null
          corroboration?: number
          demand_score?: number
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          news_items?: Json
          previous_traffic_rank?: number | null
          region?: string
          signal_score?: number
          status?: string
          term: string
          traffic_rank?: number | null
          triage_category?: string | null
          triage_reason?: string | null
          velocity?: number | null
        }
        Update: {
          approx_traffic?: string | null
          article_id?: string | null
          authority_score?: number
          cluster_key?: string | null
          corroboration?: number
          demand_score?: number
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          news_items?: Json
          previous_traffic_rank?: number | null
          region?: string
          signal_score?: number
          status?: string
          term?: string
          traffic_rank?: number | null
          triage_category?: string | null
          triage_reason?: string | null
          velocity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "trending_topics_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
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
      wire_items: {
        Row: {
          ai_suggested_tags: string[] | null
          ai_summary: string | null
          author_name: string | null
          body: string | null
          content_hash: string
          external_id: string
          id: string
          ingested_at: string
          link: string | null
          promoted_article_id: string | null
          published_at: string | null
          raw_categories: string[]
          raw_payload: Json
          reviewed_at: string | null
          reviewed_by: string | null
          source_id: string
          status: string
          suggested_category_id: string | null
          summary: string | null
          title: string
        }
        Insert: {
          ai_suggested_tags?: string[] | null
          ai_summary?: string | null
          author_name?: string | null
          body?: string | null
          content_hash: string
          external_id: string
          id?: string
          ingested_at?: string
          link?: string | null
          promoted_article_id?: string | null
          published_at?: string | null
          raw_categories?: string[]
          raw_payload?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_id: string
          status?: string
          suggested_category_id?: string | null
          summary?: string | null
          title: string
        }
        Update: {
          ai_suggested_tags?: string[] | null
          ai_summary?: string | null
          author_name?: string | null
          body?: string | null
          content_hash?: string
          external_id?: string
          id?: string
          ingested_at?: string
          link?: string | null
          promoted_article_id?: string | null
          published_at?: string | null
          raw_categories?: string[]
          raw_payload?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_id?: string
          status?: string
          suggested_category_id?: string | null
          summary?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "wire_items_promoted_article_id_fkey"
            columns: ["promoted_article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wire_items_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wire_items_suggested_category_id_fkey"
            columns: ["suggested_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      ai_key_record: {
        Args: {
          p_cooldown_seconds?: number
          p_error?: string
          p_key_id: string
          p_label: string
          p_ok: boolean
          p_provider: string
        }
        Returns: undefined
      }
      dashboard_content_performance: {
        Args: {
          p_category_id?: string
          p_days?: number
          p_limit?: number
          p_order?: string
        }
        Returns: {
          article_id: string
          category_name: string
          completion_rate_pct: number
          completions: number
          headline: string
          median_drop_off_pct: number
          published_at: string
          sessions: number
        }[]
      }
      dashboard_follow_counts: {
        Args: { p_limit?: number; p_target_type?: string }
        Returns: {
          followers: number
          target_id: string
          target_name: string
          target_type: string
        }[]
      }
      dashboard_referral_sources: {
        Args: { p_days?: number; p_limit?: number }
        Returns: {
          actors: number
          events: number
          source: string
          utm_campaign: string
          utm_medium: string
        }[]
      }
      dashboard_retention: {
        Args: { p_days?: number }
        Returns: {
          cohort_day: string
          cohort_size: number
          returned_d1: number
          returned_d30: number
          returned_d7: number
        }[]
      }
      dashboard_search_gaps: {
        Args: { p_limit?: number }
        Returns: {
          last_searched_at: string
          query: string
          searchers: number
          searches: number
          zero_result_searches: number
        }[]
      }
      dashboard_trending: {
        Args: { p_limit?: number }
        Returns: {
          article_id: string
          category_name: string
          decayed_score: number
          headline: string
          published_at: string
          status: Database["public"]["Enums"]["article_status"]
          views_1h: number
          views_24h: number
        }[]
      }
      engine_article_performance: {
        Args: { p_article_ids: string[] }
        Returns: {
          article_id: string
          completion_rate_pct: number
          completions: number
          sessions: number
        }[]
      }
      engine_build_missed_sample: { Args: { p_date?: string }; Returns: number }
      engine_earliness_json: {
        Args: { p_from: string; p_to: string; p_with_label?: boolean }
        Returns: Json
      }
      engine_earliness_rows: {
        Args: { p_from: string; p_to: string; p_with_label?: boolean }
        Returns: {
          big: boolean
          created_at: string
          entity_count: number
          event_id: string
          first_authority: number
          first_kind: string
          home_share: number
          hour_ist: number
          n_men_30: number
          n_out_10: number
          n_out_30: number
          n_out_6h: number
          on_beat: boolean
          second_source_at: string
          via_top: boolean
        }[]
      }
      engine_entity_baselines: {
        Args: { p_entities: string[] }
        Returns: {
          entity: string
          hourly_mean: number
          hourly_var: number
          hours_observed: number
          source_kind: string
        }[]
      }
      engine_event_aggregates: {
        Args: { p_window_hours?: number }
        Returns: {
          bucket_0_30: number
          bucket_30_60: number
          bucket_60_90: number
          entities: string[]
          event_id: string
          first_seen_at: string
          last_seen_at: string
          magnitudes: Json
          mentions_1h: number
          mentions_24h: number
          mentions_total: number
          region_mix: Json
          sources: Json
          status: string
          title: string
        }[]
      }
      engine_feed_stats: {
        Args: { p_hours?: number }
        Returns: {
          events_started: number
          events_touched: number
          items: number
          source_id: string
          stories_written: number
        }[]
      }
      engine_harvest_outlet_outcomes: {
        Args: { p_hours: number }
        Returns: number
      }
      engine_label_drift: {
        Args: never
        Returns: {
          label_source: string
          mean_24h: number
          mean_7d: number
          n_24h: number
          n_7d: number
        }[]
      }
      engine_learning_ledger: {
        Args: { p_days?: number }
        Returns: {
          day: string
          importance_high_share: number
          late_share: number
          median_discovery_lag_min: number
          median_sighting_to_publish_min: number
          missed_sampled: number
          missed_should_have_share: number
          outlet_4h_mean: number
          reviewed: number
          triage_accepted: number
          triage_considered: number
          would_not_run_share: number
          written: number
        }[]
      }
      engine_missed_queue: {
        Args: { p_limit?: number }
        Returns: {
          event_id: string
          first_seen_at: string
          headlines: string[]
          outlets: string[]
          reason: string
          sample_date: string
          score: number
          source_count: number
          title: string
          triage_reason: string
        }[]
      }
      engine_release_lock: { Args: { p_name: string }; Returns: undefined }
      engine_review_queue: {
        Args: { p_limit?: number }
        Returns: {
          article_id: string
          category_name: string
          category_slug: string
          event_id: string
          headline: string
          needed: number
          published_at: string
          reviews: number
          slug: string
          standfirst: string
        }[]
      }
      engine_reviewer_stats: {
        Args: never
        Returns: {
          agreement_pairs: number
          agreement_share: number
          avg_importance: number
          avg_quality: number
          email: string
          leniency: number
          median_seconds: number
          missed_reviews: number
          reviewer_id: string
          reviews: number
          would_not_run_share: number
        }[]
      }
      engine_rollup_entity_hour: { Args: { p_hour?: string }; Returns: number }
      engine_snapshot: {
        Args: { p_event_id: string; p_trigger: string }
        Returns: undefined
      }
      engine_training_outcomes_json: {
        Args: { p_days?: number }
        Returns: Json
      }
      engine_try_lock: {
        Args: { p_name: string; p_ttl_seconds: number }
        Returns: boolean
      }
      engine_unread_wire_items: {
        Args: { p_limit?: number }
        Returns: {
          id: string
          ingested_at: string
          link: string
          published_at: string
          source_expanded: boolean
          source_homepage_url: string
          source_slug: string
          summary: string
          title: string
        }[]
      }
      engine_update_source_stats: {
        Args: { p_since?: string }
        Returns: number
      }
      match_story_events: {
        Args: {
          match_count?: number
          query_embedding: string
          window_hours?: number
        }
        Returns: {
          entities: string[]
          id: string
          mention_count: number
          similarity: number
          source_keys: string[]
          title: string
        }[]
      }
      record_topic_generation: {
        Args: { p_topic_id: string }
        Returns: undefined
      }
      related_articles: {
        Args: { p_article_id: string; p_limit?: number }
        Returns: {
          author_name: string
          author_slug: string
          category_name: string
          category_slug: string
          headline: string
          hero_image_alt: string
          hero_image_url: string
          id: string
          published_at: string
          score: number
          slug: string
          standfirst: string
        }[]
      }
      rescore_trends: { Args: never; Returns: number }
      subscribe_to_newsletter: {
        Args: { p_context?: string; p_email: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "editor" | "author" | "reviewer"
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
      app_role: ["admin", "editor", "author", "reviewer"],
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
