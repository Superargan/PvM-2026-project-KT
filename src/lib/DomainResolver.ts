/**
 * DomainResolver — Single Source of Truth for all derived business values.
 *
 * This is the canonical import point for resolving inherited, fallback,
 * and display-safe values across the entire application.
 *
 * It composes existing SSOT utilities — it does NOT duplicate them.
 * All domain logic lives here or is re-exported from here.
 */

// ── Re-exports from existing SSOT modules ──────────────────────────
// Import consumers should use DomainResolver as the single entry point.

export {
  DEFAULT_MUNICIPALITY,
  getEffectiveMunicipality,
  formatSchoolTime,
  formatSchoolTimeRange,
  validateSchoolTimePair,
  dbTimeToInput,
  inputTimeToDb,
} from "@/lib/schoolTimes";

export {
  resolveAreaId,
  getResolvedAreaName,
  calculateAge,
  getAgeCategoryPlanning,
  getAgeGroup,
  getAgeCategoryReport,
  getAgeCategoryReportLabel,
  getMatchType,
  matchSortOrder,
  matchColors,
  statusBadgeStyles,
  statusStyles,
  getPlannabilityStatus,
  getClientDataCompleteness,
  hasAvailabilityCoverage,
  buildPrefsByClientMap,
  buildAvailabilityByClient,
  getAvailabilityOverlap,
  getTopAvailabilityOverlaps,
  getAlternativeWindowsForDay,
  validateScenario,
  validateScenarioSlot,
  getMissingFields,
  statusLabels,
  allStatuses,
  filterClients,
  findPotentialDuplicates,
  CLIENT_AREA_SELECT,
  type AgeCategory,
  type MatchType,
  type PlannabilityStatus,
  type ClientDataCompleteness,
  type DuplicateMatch,
  type ClientLike,
} from "@/lib/clientUtils";

export {
  normalizeSchoolName,
} from "@/lib/schoolTimes";

export {
  resolveLocationForProgram,
  resolveLocationForSlot,
  getResolvedLocationName,
  getLocationSourceLabel,
  buildLocationOptions,
  type LocationSource,
  type ResolvedLocation,
  type LocationOption,
} from "@/lib/locationUtils";

export {
  extractPostcode,
  getAreaFromPostcode,
  getAreaFromAddress,
} from "@/lib/postcodeMapping";

// ── Shared constants ────────────────────────────────────────────────

/** Default city for new training locations */
export const DEFAULT_CITY = "Rotterdam";

/** Minimum availability coverage threshold (months) */
export const AVAILABILITY_COVERAGE_MONTHS = 3;

/** Availability generation window (days) — used by import pipelines */
export const AVAILABILITY_GENERATION_DAYS = 122;

/** Availability generation window (months) — used by planning import */
export const AVAILABILITY_GENERATION_MONTHS = 4;

/** Default full-day availability window */
export const DEFAULT_AVAIL_START = "09:00";
export const DEFAULT_AVAIL_END = "17:00";

/** Default "under school time" availability window */
export const SCHOOL_TIME_AVAIL_START = "08:30";
export const SCHOOL_TIME_AVAIL_END = "15:00";

// ── Derived value resolvers ─────────────────────────────────────────

import { DEFAULT_MUNICIPALITY, getEffectiveMunicipality } from "@/lib/schoolTimes";
import { resolveAreaId, getResolvedAreaName, calculateAge } from "@/lib/clientUtils";

/**
 * Get effective municipality for a client, derived from their linked school.
 * SSOT chain: client → school → school.municipality → DEFAULT_MUNICIPALITY
 */
export function getEffectiveClientMunicipality(
  client: { schools?: { municipality?: string | null } | null },
): string {
  return getEffectiveMunicipality(client.schools?.municipality ?? null);
}

/**
 * Get effective school time range for a client, derived from their linked school.
 * Returns { start, end } or null if no school or no times set.
 */
export function getEffectiveClientSchoolTimeRange(
  client: { schools?: { school_start_time?: string | null; school_end_time?: string | null } | null },
): { start: string; end: string } | null {
  const start = client.schools?.school_start_time;
  const end = client.schools?.school_end_time;
  if (!start || !end) return null;
  return { start, end };
}

/**
 * Check if a value is an explicit override (not null/undefined/empty).
 * Used to distinguish "user set this" from "inherited/default".
 */
export function hasExplicitOverride(value: string | null | undefined): boolean {
  return value !== null && value !== undefined && value.trim() !== "";
}

/**
 * Get a display-safe value with fallback.
 * Returns the value if truthy, otherwise the fallback (default "—").
 */
export function getDisplayValueOrDefault(
  value: string | null | undefined,
  fallback: string = "—",
): string {
  const trimmed = (value ?? "").trim();
  return trimmed || fallback;
}

/**
 * Resolve an inherited value through a chain of potential sources.
 * Returns the first truthy value, or null.
 */
export function resolveInheritedValue<T>(
  ...sources: (T | null | undefined)[]
): T | null {
  for (const source of sources) {
    if (source !== null && source !== undefined) {
      if (typeof source === "string" && source.trim() === "") continue;
      return source;
    }
  }
  return null;
}

/**
 * Badge-ready municipality value: returns the municipality only
 * if it differs from the default (for display in badges/chips).
 */
export function getMunicipalityBadgeValue(
  municipality: string | null | undefined,
): string | null {
  const effective = getEffectiveMunicipality(municipality);
  return effective !== DEFAULT_MUNICIPALITY ? effective : null;
}

/**
 * Get resolved area name for a client with a display-safe fallback.
 * Wrapper around getResolvedAreaName that always returns a usable string.
 */
export function getClientAreaDisplay(
  client: any,
  areas?: { id: string; name: string }[],
): string {
  return getResolvedAreaName(client, areas);
}

/**
 * Get age-appropriate display string for a client.
 * Returns "X jaar" or "—" if DOB is missing.
 */
export function getClientAgeDisplay(dob: string | null): string {
  const age = calculateAge(dob);
  return age !== null ? `${age} jaar` : "—";
}

// ── Match type color tokens (semantic) ──────────────────────────────

export const matchColorTokens: Record<string, string> = {
  "Primair": "bg-success-muted text-success-foreground border-success-border",
  "Reserve 1": "bg-info-muted text-info-foreground border-info-border",
  "Reserve 2": "bg-role-muted text-role-foreground border-role-border",
  "Reserve 3": "bg-pink-100 text-pink-800 border-pink-300",
  "Flexibel": "bg-warning-muted text-warning-foreground border-warning-border",
};

/** Status badge styles using semantic tokens */
export const statusBadgeTokens: Record<string, { label: string; className: string }> = {
  intake_afgerond: { label: "Intake afgerond", className: "bg-info-muted text-info-foreground border-info-border" },
  wachtlijst: { label: "Wachtlijst", className: "bg-warning-muted text-warning-foreground border-warning-border" },
};

/** Session status config using semantic tokens */
export const sessionStatusTokens: Record<string, { label: string; className: string; icon: string }> = {
  beschikbaar: {
    label: "Beschikbaar",
    className: "bg-success-muted text-success-foreground border-success-border",
    icon: "check",
  },
  max_aantal_deelnemers_bereikt: {
    label: "Max aantal deelnemers bereikt",
    className: "bg-warning-muted text-warning-foreground border-warning-border",
    icon: "users",
  },
  minimum_aantal_deelnemers_niet_bereikt: {
    label: "Minimum aantal deelnemers niet bereikt",
    className: "bg-warning-muted text-warning-foreground border-warning-border",
    icon: "alert",
  },
  geblokkeerd: {
    label: "Geblokkeerd",
    className: "bg-destructive/10 text-destructive border-destructive/30",
    icon: "block",
  },
  feestdag: {
    label: "Feestdag",
    className: "bg-destructive/10 text-destructive border-destructive/30",
    icon: "calendar",
  },
  schoolvakantie: {
    label: "Schoolvakantie",
    className: "bg-muted text-muted-foreground border-border",
    icon: "calendar",
  },
  handmatig_vrijgegeven: {
    label: "Handmatig vrijgegeven",
    className: "bg-info-muted text-info-foreground border-info-border",
    icon: "unlock",
  },
};
