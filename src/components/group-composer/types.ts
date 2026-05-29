/**
 * GroupComposer shared types — all interfaces for the decomposed GroupComposer module.
 */

import type { AgeCategory, MatchType } from "@/lib/clientUtils";
import type { ClientAreaFields } from "@/lib/queryShapes";

// ─── Client shape used inside GroupComposer ─────────────────────────

/** The client row shape returned by the GroupComposer waitlist query.
 *  Intersected with Record<string, unknown> to satisfy ClientLike constraint. */
export type GroupComposerClient = ClientAreaFields & Record<string, unknown> & {
  gender?: string | null;
  class_group?: string | null;
  guardian_phone?: string | null;
  guardian_name?: string | null;
};

/** Client + computed match info */
export interface ClientWithMatch {
  client: GroupComposerClient;
  matchType: MatchType;
  sortOrder: number;
}

/** A group of clients in the same area + age bucket */
export interface GroupedClients {
  areaId: string;
  areaName: string;
  ageCategory: AgeCategory;
  clients: ClientWithMatch[];
  subGroupIndex: number;
  subGroupCount: number;
}

// ─── Availability suggestion ────────────────────────────────────────

/** Shape returned by getTopAvailabilityOverlaps / getAlternativeWindowsForDay */
export interface AvailabilitySuggestion {
  dayName: string;
  startTime: string;
  endTime: string;
  overlap: number;
  total: number;
  clientIds: string[];
  alternativesOnDay?: number;
}

// ─── Slot-fit analysis ──────────────────────────────────────────────

/** Why a client doesn't fit a specific slot */
export type ExclusionReason = "niet_beschikbaar";

/** A client excluded from a slot with the reason */
export interface ExcludedClient {
  clientId: string;
  reason: ExclusionReason;
}

/** Result of computing which clients fit a specific slot from a candidate pool */
export interface SlotFitResult {
  /** Clients that are available on this slot */
  eligibleClientIds: string[];
  /** Clients that are NOT available on this slot, with reasons */
  excludedClients: ExcludedClient[];
  /** The achievable group size for this slot */
  optimalGroupSize: number;
  /** Total candidate pool size */
  candidatePoolSize: number;
}

// ─── Simulation entry ───────────────────────────────────────────────

/** Value stored in the simulatedGroups Map */
export interface SimulationEntry {
  proposalIdx: number;
  suggestion: AvailabilitySuggestion | null;
}

// ─── Scenario save slot ─────────────────────────────────────────────

/** Slot payload sent to save_scenario RPC */
export interface SaveSlotPayload {
  area_id: string;
  age_category: string | null;
  label: string | null;
  mode: "manual" | "proposal";
  proposal_idx: number | null;
  day_name: string | null;
  start_time: string | null;
  end_time: string | null;
  confirmed: boolean;
  notes: string | null;
  linked_program_id: string | null;
  members: { client_id: string; has_override: boolean }[];
}

// ─── Convert result ─────────────────────────────────────────────────

/** Shape returned by convert_scenario_to_planning RPC */
export interface ConvertResult {
  status: "gelukt" | "mislukt";
  label?: string | null;
  program_id?: string | null;
  linked?: boolean;
  error?: string | null;
}

// ─── Trainer ref ────────────────────────────────────────────────────

/** Trainer row shape from staff query */
export interface TrainerRef {
  id: string;
  name: string | null;
  trainer_type: string | null;
}

// ─── Linkable program ───────────────────────────────────────────────

/** Program row shape from linkable programs query */
export interface LinkableProgram {
  id: string;
  name: string;
  area_id: string | null;
  age_category: string | null;
  status: string | null;
  training_number: string | null;
  areas: { name: string } | null;
}

// ─── Export column definition ───────────────────────────────────────

export interface ExportColumn {
  readonly key: string;
  readonly label: string;
  readonly group: string;
}

// ─── GroupComposer public handle (exposed via ref) ──────────────────

export interface GroupComposerHandle {
  triggerSave: () => Promise<boolean>;
  hasActiveSimulation: boolean;
  isDirty: boolean;
  hasUnsavedWork: boolean;
}

// ─── Props ──────────────────────────────────────────────────────────

export interface GroupComposerProps {
  activeScenarioId?: string | null;
  onSaveScenario?: (scenarioId: string) => void;
  onClearScenario?: () => void;
  onLoadScenario?: (scenarioId: string) => void;
  filterArea?: string;
  onFilterAreaChange?: (area: string) => void;
  filterAgeCategory?: AgeCategory;
  preLinkedProgramId?: string;
  /**
   * Called whenever `hasUnsavedWork` flips. Lets the parent react to
   * dirty-state changes without polling the imperative ref handle.
   */
  onDirtyChange?: (hasUnsavedWork: boolean) => void;
}

// ─── Constants ──────────────────────────────────────────────────────

export const MAX_GROUP_SIZE = 10;
export const SUB_GROUP_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export const PLANNING_EXPORT_COLUMNS: readonly ExportColumn[] = [
  { key: "gebied", label: "Gebied", group: "Groep" },
  { key: "leeftijd", label: "Leeftijdscategorie", group: "Groep" },
  { key: "dag", label: "Dag", group: "Groep" },
  { key: "tijdstip", label: "Tijdstip", group: "Groep" },
  { key: "overlap", label: "Beschikbare deelnemers", group: "Groep" },
  { key: "groepsgrootte", label: "Groepsgrootte", group: "Groep" },
  { key: "status_groep", label: "Groepsstatus", group: "Groep" },
  { key: "naam", label: "Naam deelnemer", group: "Deelnemer" },
  { key: "geboortedatum", label: "Geboortedatum", group: "Deelnemer" },
  { key: "leeftijd_jr", label: "Leeftijd", group: "Deelnemer" },
  { key: "geslacht", label: "Geslacht", group: "Deelnemer" },
  { key: "school", label: "School", group: "Deelnemer" },
  { key: "intake_status", label: "Status deelnemer", group: "Deelnemer" },
  { key: "match_type", label: "Match type", group: "Deelnemer" },
  { key: "oudertrainer", label: "Oudertrainer", group: "Trainers" },
  { key: "kindtrainer", label: "Kindtrainer", group: "Trainers" },
  { key: "startdatum", label: "Vermoedelijke startdatum", group: "Overig" },
  { key: "voorstel_nr", label: "Voorstel nummer", group: "Overig" },
] as const;
