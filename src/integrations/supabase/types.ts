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
      availability_override_logs: {
        Row: {
          active: boolean
          client_id: string
          created_at: string
          id: string
          overridden_by: string
          override_type: string
          reason: string
        }
        Insert: {
          active?: boolean
          client_id: string
          created_at?: string
          id?: string
          overridden_by: string
          override_type?: string
          reason: string
        }
        Update: {
          active?: boolean
          client_id?: string
          created_at?: string
          id?: string
          overridden_by?: string
          override_type?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_override_logs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_area_preferences: {
        Row: {
          area_id: string
          client_id: string
          created_at: string
          id: string
          preference_order: number
        }
        Insert: {
          area_id: string
          client_id: string
          created_at?: string
          id?: string
          preference_order?: number
        }
        Update: {
          area_id?: string
          client_id?: string
          created_at?: string
          id?: string
          preference_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_area_preferences_area_id_fkey"
            columns: ["area_id"]
            isOneToOne: false
            referencedRelation: "areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_area_preferences_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_assignments: {
        Row: {
          client_id: string
          created_at: string
          id: string
          staff_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          staff_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          staff_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_assignments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_assignments_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      client_availability: {
        Row: {
          available_date: string
          client_id: string
          created_at: string
          end_time: string | null
          id: string
          notes: string | null
          start_time: string | null
        }
        Insert: {
          available_date: string
          client_id: string
          created_at?: string
          end_time?: string | null
          id?: string
          notes?: string | null
          start_time?: string | null
        }
        Update: {
          available_date?: string
          client_id?: string
          created_at?: string
          end_time?: string | null
          id?: string
          notes?: string | null
          start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_availability_client_id_fkey"
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
          all_areas_flexible: boolean
          archived: boolean
          city: string | null
          class_group: string | null
          consent_data_processing: boolean | null
          created_at: string
          date_of_birth: string | null
          dob_estimated: boolean
          dropout_action: string | null
          dropout_reason: string | null
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
          neighborhood_id: string | null
          notes: string | null
          postal_code: string | null
          referral_reason: string | null
          referrer_id: string | null
          registration_date: string | null
          school_id: string | null
          updated_at: string
          waitlist_area_id: string | null
          waitlist_status: string | null
          whatsapp_consent: boolean | null
        }
        Insert: {
          address?: string | null
          all_areas_flexible?: boolean
          archived?: boolean
          city?: string | null
          class_group?: string | null
          consent_data_processing?: boolean | null
          created_at?: string
          date_of_birth?: string | null
          dob_estimated?: boolean
          dropout_action?: string | null
          dropout_reason?: string | null
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
          neighborhood_id?: string | null
          notes?: string | null
          postal_code?: string | null
          referral_reason?: string | null
          referrer_id?: string | null
          registration_date?: string | null
          school_id?: string | null
          updated_at?: string
          waitlist_area_id?: string | null
          waitlist_status?: string | null
          whatsapp_consent?: boolean | null
        }
        Update: {
          address?: string | null
          all_areas_flexible?: boolean
          archived?: boolean
          city?: string | null
          class_group?: string | null
          consent_data_processing?: boolean | null
          created_at?: string
          date_of_birth?: string | null
          dob_estimated?: boolean
          dropout_action?: string | null
          dropout_reason?: string | null
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
          neighborhood_id?: string | null
          notes?: string | null
          postal_code?: string | null
          referral_reason?: string | null
          referrer_id?: string | null
          registration_date?: string | null
          school_id?: string | null
          updated_at?: string
          waitlist_area_id?: string | null
          waitlist_status?: string | null
          whatsapp_consent?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_neighborhood_id_fkey"
            columns: ["neighborhood_id"]
            isOneToOne: false
            referencedRelation: "neighborhoods"
            referencedColumns: ["id"]
          },
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
          {
            foreignKeyName: "clients_waitlist_area_id_fkey"
            columns: ["waitlist_area_id"]
            isOneToOne: false
            referencedRelation: "areas"
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
          program_id: string | null
          school_id: string | null
          signed_at: string | null
          signed_file_name: string | null
          signed_file_path: string | null
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
          program_id?: string | null
          school_id?: string | null
          signed_at?: string | null
          signed_file_name?: string | null
          signed_file_path?: string | null
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
          program_id?: string | null
          school_id?: string | null
          signed_at?: string | null
          signed_file_name?: string | null
          signed_file_path?: string | null
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
            foreignKeyName: "generated_documents_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
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
      invoices: {
        Row: {
          amount: number | null
          created_at: string
          file_name: string
          file_path: string
          id: string
          notes: string | null
          program_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          staff_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          notes?: string | null
          program_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          notes?: string | null
          program_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          staff_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
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
          action_not_started: string | null
          client_id: string
          created_at: string
          dropout_action: string | null
          dropout_reason: string | null
          early_dropout: boolean | null
          enrolled_at: string | null
          evaluation_filled_parent: boolean | null
          follow_up_program: string | null
          id: string
          kanvas_child_post: number | null
          kanvas_child_pre: number | null
          kanvas_parent_post: number | null
          kanvas_parent_pre: number | null
          parent_participants: number | null
          program_id: string
          reason_not_started: string | null
          referred_to: string | null
          satisfaction_child: number | null
          satisfaction_parent: number | null
          sessions_attended: number | null
          started: boolean | null
          successfully_completed: boolean | null
        }
        Insert: {
          action_not_started?: string | null
          client_id: string
          created_at?: string
          dropout_action?: string | null
          dropout_reason?: string | null
          early_dropout?: boolean | null
          enrolled_at?: string | null
          evaluation_filled_parent?: boolean | null
          follow_up_program?: string | null
          id?: string
          kanvas_child_post?: number | null
          kanvas_child_pre?: number | null
          kanvas_parent_post?: number | null
          kanvas_parent_pre?: number | null
          parent_participants?: number | null
          program_id: string
          reason_not_started?: string | null
          referred_to?: string | null
          satisfaction_child?: number | null
          satisfaction_parent?: number | null
          sessions_attended?: number | null
          started?: boolean | null
          successfully_completed?: boolean | null
        }
        Update: {
          action_not_started?: string | null
          client_id?: string
          created_at?: string
          dropout_action?: string | null
          dropout_reason?: string | null
          early_dropout?: boolean | null
          enrolled_at?: string | null
          evaluation_filled_parent?: boolean | null
          follow_up_program?: string | null
          id?: string
          kanvas_child_post?: number | null
          kanvas_child_pre?: number | null
          kanvas_parent_post?: number | null
          kanvas_parent_pre?: number | null
          parent_participants?: number | null
          program_id?: string
          reason_not_started?: string | null
          referred_to?: string | null
          satisfaction_child?: number | null
          satisfaction_parent?: number | null
          sessions_attended?: number | null
          started?: boolean | null
          successfully_completed?: boolean | null
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
          end_time: string | null
          id: string
          location: string | null
          notes: string | null
          program_id: string
          session_date: string | null
          session_number: number
          start_time: string | null
          status: string
        }
        Insert: {
          created_at?: string
          end_time?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          program_id: string
          session_date?: string | null
          session_number: number
          start_time?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          end_time?: string | null
          id?: string
          location?: string | null
          notes?: string | null
          program_id?: string
          session_date?: string | null
          session_number?: number
          start_time?: string | null
          status?: string
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
          replaces_staff_id: string | null
          role: string | null
          session_id: string | null
          staff_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          program_id: string
          replaces_staff_id?: string | null
          role?: string | null
          session_id?: string | null
          staff_id: string
        }
        Update: {
          created_at?: string
          id?: string
          program_id?: string
          replaces_staff_id?: string | null
          role?: string | null
          session_id?: string | null
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
            foreignKeyName: "program_staff_replaces_staff_id_fkey"
            columns: ["replaces_staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_staff_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "program_sessions"
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
          age_category: string | null
          archived: boolean
          area_id: string | null
          created_at: string
          description: string | null
          end_date: string | null
          id: string
          location: string | null
          max_participants: number | null
          min_participants: number | null
          name: string
          neighborhood_id: string | null
          school_id: string | null
          start_date: string | null
          status: string | null
          training_number: string | null
          updated_at: string
        }
        Insert: {
          age_category?: string | null
          archived?: boolean
          area_id?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          location?: string | null
          max_participants?: number | null
          min_participants?: number | null
          name: string
          neighborhood_id?: string | null
          school_id?: string | null
          start_date?: string | null
          status?: string | null
          training_number?: string | null
          updated_at?: string
        }
        Update: {
          age_category?: string | null
          archived?: boolean
          area_id?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          id?: string
          location?: string | null
          max_participants?: number | null
          min_participants?: number | null
          name?: string
          neighborhood_id?: string | null
          school_id?: string | null
          start_date?: string | null
          status?: string | null
          training_number?: string | null
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
      session_documents: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          id: string
          session_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          session_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          session_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_documents_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "program_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      session_override_logs: {
        Row: {
          created_at: string
          id: string
          overridden_by: string
          override_type: string
          reason: string
          session_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          overridden_by: string
          override_type: string
          reason: string
          session_id: string
        }
        Update: {
          created_at?: string
          id?: string
          overridden_by?: string
          override_type?: string
          reason?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_override_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "program_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          address: string | null
          archived: boolean
          city: string | null
          created_at: string
          email: string | null
          id: string
          kvk_number: string | null
          kvk_uittreksel_path: string | null
          kvk_uittreksel_uploaded_at: string | null
          name: string | null
          phone: string | null
          postal_code: string | null
          school_id: string | null
          specialization: string | null
          trade_name: string | null
          trainer_type: string | null
          updated_at: string
          user_id: string | null
          vog_path: string | null
          vog_uploaded_at: string | null
        }
        Insert: {
          address?: string | null
          archived?: boolean
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          kvk_number?: string | null
          kvk_uittreksel_path?: string | null
          kvk_uittreksel_uploaded_at?: string | null
          name?: string | null
          phone?: string | null
          postal_code?: string | null
          school_id?: string | null
          specialization?: string | null
          trade_name?: string | null
          trainer_type?: string | null
          updated_at?: string
          user_id?: string | null
          vog_path?: string | null
          vog_uploaded_at?: string | null
        }
        Update: {
          address?: string | null
          archived?: boolean
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          kvk_number?: string | null
          kvk_uittreksel_path?: string | null
          kvk_uittreksel_uploaded_at?: string | null
          name?: string | null
          phone?: string | null
          postal_code?: string | null
          school_id?: string | null
          specialization?: string | null
          trade_name?: string | null
          trainer_type?: string | null
          updated_at?: string
          user_id?: string | null
          vog_path?: string | null
          vog_uploaded_at?: string | null
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
      staff_availability: {
        Row: {
          available_date: string
          created_at: string
          end_time: string | null
          id: string
          notes: string | null
          staff_id: string
          start_time: string | null
        }
        Insert: {
          available_date: string
          created_at?: string
          end_time?: string | null
          id?: string
          notes?: string | null
          staff_id: string
          start_time?: string | null
        }
        Update: {
          available_date?: string
          created_at?: string
          end_time?: string | null
          id?: string
          notes?: string | null
          staff_id?: string
          start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_availability_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
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
      is_admin: { Args: never; Returns: boolean }
      is_backoffice: { Args: never; Returns: boolean }
      is_trainer: { Args: never; Returns: boolean }
      is_trainer_for_client: { Args: { _client_id: string }; Returns: boolean }
      is_trainer_for_program: {
        Args: { _program_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "backoffice" | "trainer" | "admin"
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
      app_role: ["backoffice", "trainer", "admin"],
    },
  },
} as const
