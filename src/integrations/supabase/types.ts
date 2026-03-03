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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      areas: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      attendance: {
        Row: {
          client_id: string
          created_at: string
          id: string
          present: boolean
          session_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          present?: boolean
          session_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          present?: boolean
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "program_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          client_id: string | null
          created_at: string
          details: string | null
          id: string
          viewed_by: string
        }
        Insert: {
          action?: string
          client_id?: string | null
          created_at?: string
          details?: string | null
          id?: string
          viewed_by: string
        }
        Update: {
          action?: string
          client_id?: string | null
          created_at?: string
          details?: string | null
          id?: string
          viewed_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          city: string | null
          class_group: string | null
          consent_data_processing: boolean | null
          created_at: string
          date_of_birth: string | null
          first_name: string
          gender: string | null
          goals: string | null
          guardian_email: string | null
          guardian_name: string | null
          guardian_phone: string | null
          guardian_phone_alt: string | null
          id: string
          intake_date: string | null
          intake_notes: string | null
          intake_status: string | null
          last_name: string
          notes: string | null
          postal_code: string | null
          referral_reason: string | null
          referrer_id: string | null
          school_id: string | null
          updated_at: string
          whatsapp_consent: boolean | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          class_group?: string | null
          consent_data_processing?: boolean | null
          created_at?: string
          date_of_birth?: string | null
          first_name: string
          gender?: string | null
          goals?: string | null
          guardian_email?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          guardian_phone_alt?: string | null
          id?: string
          intake_date?: string | null
          intake_notes?: string | null
          intake_status?: string | null
          last_name: string
          notes?: string | null
          postal_code?: string | null
          referral_reason?: string | null
          referrer_id?: string | null
          school_id?: string | null
          updated_at?: string
          whatsapp_consent?: boolean | null
        }
        Update: {
          address?: string | null
          city?: string | null
          class_group?: string | null
          consent_data_processing?: boolean | null
          created_at?: string
          date_of_birth?: string | null
          first_name?: string
          gender?: string | null
          goals?: string | null
          guardian_email?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          guardian_phone_alt?: string | null
          id?: string
          intake_date?: string | null
          intake_notes?: string | null
          intake_status?: string | null
          last_name?: string
          notes?: string | null
          postal_code?: string | null
          referral_reason?: string | null
          referrer_id?: string | null
          school_id?: string | null
          updated_at?: string
          whatsapp_consent?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_referrer_id_fkey"
            columns: ["referrer_id"]
            isOneToOne: false
            referencedRelation: "referrers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      document_templates: {
        Row: {
          category: string
          created_at: string
          file_path: string
          id: string
          name: string
          placeholder_fields: string[] | null
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          file_path: string
          id?: string
          name: string
          placeholder_fields?: string[] | null
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          file_path?: string
          id?: string
          name?: string
          placeholder_fields?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      generated_documents: {
        Row: {
          client_id: string | null
          created_at: string
          file_name: string
          file_path: string
          generated_by: string
          id: string
          school_id: string | null
          staff_id: string | null
          template_id: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string
          file_name: string
          file_path: string
          generated_by: string
          id?: string
          school_id?: string | null
          staff_id?: string | null
          template_id?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string
          file_name?: string
          file_path?: string
          generated_by?: string
          id?: string
          school_id?: string | null
          staff_id?: string | null
          template_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "generated_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_documents_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_documents_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_documents_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "document_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      neighborhoods: {
        Row: {
          area_id: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          area_id: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          area_id?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "neighborhoods_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      program_clients: {
        Row: {
          client_id: string
          created_at: string
          enrolled_at: string | null
          id: string
          program_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          enrolled_at?: string | null
          id?: string
          program_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          enrolled_at?: string | null
          id?: string
          program_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_clients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_clients_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_sessions: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          program_id: string
          session_date: string | null
          session_number: number
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          program_id: string
          session_date?: string | null
          session_number: number
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          program_id?: string
          session_date?: string | null
          session_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "program_sessions_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
        ]
      }
      program_staff: {
        Row: {
          created_at: string
          id: string
          program_id: string
          role: string | null
          staff_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          program_id: string
          role?: string | null
          staff_id: string
        }
        Update: {
          created_at?: string
          id?: string
          program_id?: string
          role?: string | null
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "program_staff_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_staff_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      programs: {
        Row: {
          area_id: string | null
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          max_participants: number | null
          name: string
          neighborhood_id: string | null
          school_id: string | null
          start_date: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          area_id?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          max_participants?: number | null
          name: string
          neighborhood_id?: string | null
          school_id?: string | null
          start_date?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          area_id?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          max_participants?: number | null
          name?: string
          neighborhood_id?: string | null
          school_id?: string | null
          start_date?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programs_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programs_neighborhood_id_fkey"
            columns: ["neighborhood_id"]
            isOneToOne: false
            referencedRelation: "neighborhoods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      referrers: {
        Row: {
          created_at: string
          email: string | null
          function_title: string | null
          id: string
          name: string
          phone: string | null
          school_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          function_title?: string | null
          id?: string
          name: string
          phone?: string | null
          school_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          function_title?: string | null
          id?: string
          name?: string
          phone?: string | null
          school_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "referrers_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_documents: {
        Row: {
          category: string
          created_at: string
          file_name: string
          file_path: string
          id: string
          school_id: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          category?: string
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          school_id: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          category?: string
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          school_id?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_documents_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          address: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          id: string
          name: string
          neighborhood_id: string | null
          student_count: number | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          name: string
          neighborhood_id?: string | null
          student_count?: number | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          name?: string
          neighborhood_id?: string | null
          student_count?: number | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "schools_neighborhood_id_fkey"
            columns: ["neighborhood_id"]
            isOneToOne: false
            referencedRelation: "neighborhoods"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          email: string | null
          id: string
          kvk_number: string | null
          name: string | null
          phone: string | null
          postal_code: string | null
          school_id: string | null
          specialization: string | null
          trade_name: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          kvk_number?: string | null
          name?: string | null
          phone?: string | null
          postal_code?: string | null
          school_id?: string | null
          specialization?: string | null
          trade_name?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          kvk_number?: string | null
          name?: string | null
          phone?: string | null
          postal_code?: string | null
          school_id?: string | null
          specialization?: string | null
          trade_name?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_backoffice: { Args: never; Returns: boolean }
      is_trainer: { Args: never; Returns: boolean }
      is_trainer_for_client: { Args: { _client_id: string }; Returns: boolean }
      is_trainer_for_program: {
        Args: { _program_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "backoffice" | "trainer"
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
      app_role: ["backoffice", "trainer"],
    },
  },
} as const
