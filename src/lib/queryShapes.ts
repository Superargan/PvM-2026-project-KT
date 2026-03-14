/**
 * Shared TypeScript interfaces for common Supabase join query return shapes.
 *
 * These match the exact shapes returned by .select() queries used across the app.
 * Using these instead of `as any` gives type safety without changing runtime behavior.
 *
 * NAMING CONVENTION:
 *   <Entity>Row       — flat row without joins
 *   <Entity>With<Join> — entity + specific joined relations
 */

import type { TablesInsert, TablesUpdate } from "@/integrations/supabase/types";

// ─── Re-export SDK payload types for convenience ────────────────────

export type { TablesInsert, TablesUpdate };

// ─── Typed payload builders ─────────────────────────────────────────

/** Typed insert payload for program_sessions */
export type SessionInsert = TablesInsert<"program_sessions">;

/** Typed update payload for program_sessions */
export type SessionUpdate = TablesUpdate<"program_sessions">;

/** Typed insert payload for session_override_logs */
export type SessionOverrideLogInsert = TablesInsert<"session_override_logs">;

/** Typed insert payload for session_documents */
export type SessionDocumentInsert = TablesInsert<"session_documents">;

/** Typed insert payload for attendance */
export type AttendanceInsert = TablesInsert<"attendance">;

/** Typed update payload for attendance */
export type AttendanceUpdate = TablesUpdate<"attendance">;

/** Typed insert payload for program_staff */
export type ProgramStaffInsert = TablesInsert<"program_staff">;

/** Typed insert payload for client_assignments */
export type ClientAssignmentInsert = TablesInsert<"client_assignments">;

/** Typed insert payload for staff_availability */
export type StaffAvailabilityInsert = TablesInsert<"staff_availability">;

/** Typed insert payload for client_availability */
export type ClientAvailabilityInsert = TablesInsert<"client_availability">;

/** Typed update payload for generated_documents */
export type GeneratedDocumentUpdate = TablesUpdate<"generated_documents">;

/** Typed update payload for clients */
export type ClientUpdate = TablesUpdate<"clients">;

// ─── Primitives: nested join fragments ───────────────────────────────

/** areas(id, name) — minimal area lookup */
export interface AreaRef {
  id: string;
  name: string;
}

/** neighborhoods:neighborhood_id(id, area_id, areas(id, name)) */
export interface NeighborhoodWithArea {
  id: string;
  area_id: string;
  areas: AreaRef;
}

/** schools(id, name, neighborhood_id, neighborhoods(id, area_id, areas(id, name))) */
export interface SchoolWithNeighborhood {
  id: string;
  name: string;
  neighborhood_id: string | null;
  neighborhoods: NeighborhoodWithArea | null;
}

/** areas with full neighborhoods sub-array: areas(id, name, neighborhoods(*)) */
export interface AreaWithNeighborhoods {
  id: string;
  name: string;
  neighborhoods: { id: string; name: string; area_id: string }[];
}

// ─── Client shapes ──────────────────────────────────────────────────

/** Core client fields used in area resolution (CLIENT_AREA_SELECT) */
export interface ClientAreaFields {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  waitlist_area_id: string | null;
  neighborhood_id: string | null;
  all_areas_flexible: boolean;
  intake_status: string | null;
  school_id: string | null;
  dob_estimated?: boolean;
  neighborhoods: NeighborhoodWithArea | null;
  schools: SchoolWithNeighborhood | null;
}

/** Waitlist client — includes extra waitlist-specific fields */
export interface WaitlistClientRow extends ClientAreaFields {
  waitlist_status: string | null;
  dropout_reason: string | null;
  dropout_action: string | null;
  intake_date: string | null;
  registration_date: string | null;
  guardian_phone: string | null;
  guardian_name: string | null;
  created_at: string;
}

/** Client list row — includes program_clients join */
export interface ClientListRow extends ClientAreaFields {
  program_clients: ProgramClientRef[] | null;
  gender?: string | null;
  class_group?: string | null;
  guardian_name?: string | null;
  guardian_phone?: string | null;
  guardian_email?: string | null;
  postal_code?: string | null;
  address?: string | null;
  city?: string | null;
  created_at?: string;
  /** Direct area join sometimes present via waitlist_area_id */
  areas?: AreaRef | null;
}

/** Minimal program reference inside program_clients join */
export interface ProgramRef {
  id: string;
  name: string;
  training_number?: string | null;
  status: string | null;
  archived: boolean;
}

/** program_clients(program_id, programs(...)) join on client */
export interface ProgramClientRef {
  program_id: string;
  programs: ProgramRef | null;
}

// ─── Program shapes ─────────────────────────────────────────────────

/** Program detail with all relation joins */
export interface ProgramDetailRow {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  max_participants: number | null;
  min_participants: number | null;
  area_id: string | null;
  neighborhood_id: string | null;
  school_id: string | null;
  training_location_id: string | null;
  training_number: string | null;
  location: string | null;
  age_category: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
  schools: { name: string } | null;
  training_locations: { name: string } | null;
  areas: { name: string } | null;
  neighborhoods: { name: string } | null;
}

/** Enrolled client row from program_clients with client joins */
export interface EnrolledClientRow {
  id: string;
  client_id: string;
  enrolled_at: string | null;
  early_dropout: boolean | null;
  dropout_reason: string | null;
  dropout_action: string | null;
  clients: {
    id: string;
    first_name: string;
    last_name: string;
    date_of_birth: string | null;
    gender: string | null;
    schools: { name: string } | null;
  } | null;
}

// ─── Session shapes ─────────────────────────────────────────────────

/** Program session with nested program info (planning calendar) */
export interface SessionWithProgram {
  id: string;
  session_number: number;
  session_date: string | null;
  location: string | null;
  program_id: string;
  start_time?: string | null;
  end_time?: string | null;
  programs: {
    id: string;
    name: string;
    age_category: string | null;
    status: string | null;
    area_id: string | null;
    areas: { name: string } | null;
    schools: { name: string } | null;
    training_locations: { name: string } | null;
  } | null;
}

// ─── Staff shapes ───────────────────────────────────────────────────

/** Program staff with nested staff info */
export interface ProgramStaffRow {
  program_id: string;
  session_id: string | null;
  role: string | null;
  staff_id: string;
  replaces_staff_id: string | null;
  staff: {
    name: string | null;
    trainer_type: string | null;
  } | null;
}

/** Program staff with trade_name (rapportages) */
export interface RapportageStaffRow {
  program_id: string;
  staff_id: string;
  role: string | null;
  staff: {
    name: string | null;
    trade_name: string | null;
  } | null;
}

/** Staff trainer row (staff list) */
export interface StaffTrainerRef {
  id: string;
  name: string | null;
  trainer_type: string | null;
}

/** Client assignment with staff name */
export interface ClientAssignmentRow {
  client_id: string;
  staff: { name: string | null } | null;
}

// ─── Availability shapes ────────────────────────────────────────────

/** client_availability row (flat) */
export interface ClientAvailabilityRow {
  client_id: string;
  available_date: string;
  start_time: string | null;
  end_time: string | null;
}

/** client_availability with id + notes (detail view) */
export interface ClientAvailabilityDetailRow extends ClientAvailabilityRow {
  id: string;
  notes: string | null;
}

/** staff_availability row */
export interface StaffAvailabilityRow {
  id: string;
  staff_id: string;
  available_date: string;
  start_time: string | null;
  end_time: string | null;
  notes: string | null;
}

// ─── Rapportages shapes ─────────────────────────────────────────────

/** Program row as used in rapportages queries */
export interface RapportageProgramRow {
  id: string;
  name: string;
  area_id: string | null;
  school_id: string | null;
  training_location_id: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  age_category: string | null;
  max_participants: number | null;
  training_number?: string | null;
  areas: { name: string } | null;
  schools: { name: string; address: string | null } | null;
  training_locations: { name: string; address: string | null } | null;
}

/** Generated document with template category join (rapportages) */
export interface RapportageDocRow {
  id: string;
  staff_id: string | null;
  program_id: string | null;
  template_id: string | null;
  file_name: string;
  created_at: string;
  signed_file_path: string | null;
  document_templates: { category: string } | null;
}

// ─── Document shapes ────────────────────────────────────────────────

/** Generated document row with entity joins */
export interface GeneratedDocumentRow {
  id: string;
  file_path: string;
  file_name: string;
  signed_file_path: string | null;
  signed_file_name: string | null;
  signed_at: string | null;
  created_at: string;
  generated_by: string;
  client_id: string | null;
  staff_id: string | null;
  school_id: string | null;
  program_id: string | null;
  template_id: string | null;
  clients?: { first_name: string; last_name: string } | null;
  staff?: { name: string | null } | null;
  schools?: { name: string } | null;
  programs?: { name: string } | null;
  document_templates?: { name: string } | null;
}

// ─── Area preference shapes ────────────────────────────────────────

/** client_area_preferences row */
export interface AreaPreferenceRow {
  client_id: string;
  area_id: string;
  preference_order: number;
}

// ─── Override log shapes ────────────────────────────────────────────

export interface OverrideLogRow {
  id: string;
  client_id: string;
  overridden_by: string;
  override_type: string;
  reason: string;
  active: boolean;
  created_at: string;
}

// ─── Scenario / Validation shapes ───────────────────────────────────

/** Validation result stored in simulation_scenarios.validation_details (JSON) */
export interface ValidationDetails {
  status: "geldig" | "aandacht_vereist" | "ongeldig";
  slotResults?: Array<{
    slotId: string;
    label?: string;
    status: string;
    warnings: string[];
    errors: string[];
  }>;
  [key: string]: unknown;
}

/** Scenario slot with nested members (from .select() join) */
export interface ScenarioSlotWithMembers {
  id: string;
  area_id: string;
  age_category: string | null;
  label: string | null;
  mode: string | null;
  proposal_idx: number | null;
  day_name: string | null;
  start_time: string | null;
  end_time: string | null;
  confirmed: boolean;
  notes: string | null;
  linked_program_id: string | null;
  school_id?: string | null;
  training_location_id?: string | null;
  conversion_status?: string;
  converted_program_id?: string | null;
  conversion_error?: string | null;
  simulation_scenario_members?: Array<{
    client_id: string;
    has_override: boolean;
  }>;
}

/** Scenario list row (ScenarioOverview) */
export interface ScenarioListRow {
  id: string;
  name: string;
  description: string | null;
  status: string;
  proforma_number: string | null;
  validation_status: string;
  validation_details: ValidationDetails | null;
  last_validated_at: string | null;
  created_at: string;
  updated_at: string;
  simulation_scenario_slots: Array<{
    id: string;
    conversion_status: string;
    converted_program_id: string | null;
    conversion_error: string | null;
    label: string | null;
    confirmed: boolean;
  }>;
}

// ─── Common callback helper types ───────────────────────────────────

/** Minimal ID+name reference used in lookups */
export interface IdNameRef {
  id: string;
  name: string;
}

/** School dropdown row with neighborhood area join */
export interface SchoolDropdownRow {
  id: string;
  name: string;
  neighborhood_id: string | null;
  neighborhoods: { area_id: string } | null;
  school_start_time?: string | null;
  school_end_time?: string | null;
  municipality?: string | null;
}

/** Scenario member count query row */
export interface ScenarioMemberCountRow {
  scenario_slot_id: string;
  simulation_scenario_slots: { scenario_id: string } | null;
}

/** Low-attendance result row (RapportagesPage) */
export interface LowAttendanceRow {
  naam: string;
  programma: string;
  aanwezig: number;
  totaal: number;
  percentage: number;
  bk: string;
}

/** Staff dropdown row (for assignments) */
export interface StaffDropdownRow {
  id: string;
  name: string | null;
  user_id: string | null;
}

/** Client assignment row with staff join */
export interface AssignmentWithStaff {
  id: string;
  staff_id: string;
  staff: { name: string | null } | null;
}

/** Available program dropdown row */
export interface AvailableProgramRow {
  id: string;
  name: string;
  status: string | null;
  start_date: string | null;
  age_category: string | null;
  schools: { name: string } | null;
}

/** Training location with joins */
export interface TrainingLocationRow {
  id: string;
  name: string;
  address: string | null;
  postal_code: string | null;
  city: string | null;
  area_id: string | null;
  neighborhood_id: string | null;
  notes: string | null;
  active: boolean;
  neighborhoods: { name: string; area_id: string; areas: { name: string } | null } | null;
  areas: { name: string } | null;
}

/** Training location form state */
export interface TrainingLocationForm {
  name: string;
  address: string;
  postal_code: string;
  city: string;
  notes: string;
  active: boolean;
}
