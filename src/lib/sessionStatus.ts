/**
 * Centralized session status logic — Single Source of Truth
 * 
 * Status determination hierarchy:
 * 1. Blokkade statuses (feestdag, schoolvakantie, geblokkeerd) have priority
 * 2. handmatig_vrijgegeven overrides blokkade
 * 3. Capacity statuses derived from enrollment vs min/max_participants
 * 4. Default: beschikbaar
 */

import { isSpecialDay } from "@/lib/holidays";

export type SessionStatus =
  | "beschikbaar"
  | "max_aantal_deelnemers_bereikt"
  | "minimum_aantal_deelnemers_niet_bereikt"
  | "geblokkeerd"
  | "feestdag"
  | "schoolvakantie"
  | "handmatig_vrijgegeven";

export type OverrideType =
  | "feestdag"
  | "schoolvakantie"
  | "max_aantal_deelnemers"
  | "minimum_aantal_deelnemers"
  | "handmatige_blokkade";

export const SESSION_STATUS_CONFIG: Record<SessionStatus, { label: string; className: string; icon: "check" | "alert" | "block" | "calendar" | "users" | "unlock" }> = {
  beschikbaar: {
    label: "Beschikbaar",
    className: "bg-emerald-100 text-emerald-800 border-emerald-300",
    icon: "check",
  },
  max_aantal_deelnemers_bereikt: {
    label: "Max aantal deelnemers bereikt",
    className: "bg-orange-100 text-orange-800 border-orange-300",
    icon: "users",
  },
  minimum_aantal_deelnemers_niet_bereikt: {
    label: "Minimum aantal deelnemers niet bereikt",
    className: "bg-amber-100 text-amber-800 border-amber-300",
    icon: "alert",
  },
  geblokkeerd: {
    label: "Geblokkeerd",
    className: "bg-red-100 text-red-800 border-red-300",
    icon: "block",
  },
  feestdag: {
    label: "Feestdag",
    className: "bg-red-100 text-red-800 border-red-300",
    icon: "calendar",
  },
  schoolvakantie: {
    label: "Schoolvakantie",
    className: "bg-gray-100 text-gray-800 border-gray-300",
    icon: "calendar",
  },
  handmatig_vrijgegeven: {
    label: "Handmatig vrijgegeven",
    className: "bg-blue-100 text-blue-800 border-blue-300",
    icon: "unlock",
  },
};

export const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "alle", label: "Alle" },
  { value: "beschikbaar", label: "Beschikbaar" },
  { value: "max_aantal_deelnemers_bereikt", label: "Max aantal deelnemers bereikt" },
  { value: "minimum_aantal_deelnemers_niet_bereikt", label: "Minimum aantal deelnemers niet bereikt" },
  { value: "geblokkeerd", label: "Geblokkeerd" },
  { value: "feestdag", label: "Feestdag" },
  { value: "schoolvakantie", label: "Schoolvakantie" },
  { value: "handmatig_vrijgegeven", label: "Handmatig vrijgegeven" },
];

/**
 * Determine the status for a session date based on holidays/vacations.
 * Used during generation — does NOT consider capacity.
 */
export function getStatusForDate(dateStr: string): SessionStatus {
  const special = isSpecialDay(dateStr);
  if (special.holidays.length > 0) return "feestdag";
  if (special.vacation) return "schoolvakantie";
  return "beschikbaar";
}

/**
 * Determine effective capacity status based on enrollments vs program limits.
 * Only applies when the persisted status is 'beschikbaar'.
 */
export function getCapacityStatus(
  persistedStatus: SessionStatus,
  enrolledCount: number,
  minParticipants: number | null,
  maxParticipants: number | null
): SessionStatus {
  // Blokkade and override statuses always take priority
  if (persistedStatus !== "beschikbaar") return persistedStatus;

  if (maxParticipants && enrolledCount >= maxParticipants) {
    return "max_aantal_deelnemers_bereikt";
  }
  if (minParticipants && enrolledCount < minParticipants) {
    return "minimum_aantal_deelnemers_niet_bereikt";
  }
  return "beschikbaar";
}

/**
 * Check if a session is blocked (not bookable by participants)
 */
export function isSessionBlocked(status: SessionStatus): boolean {
  return ["geblokkeerd", "feestdag", "schoolvakantie"].includes(status);
}

/**
 * Check if a session is at capacity
 */
export function isAtCapacity(status: SessionStatus): boolean {
  return status === "max_aantal_deelnemers_bereikt";
}

/**
 * Get the override confirmation message for a given override type
 */
export function getOverrideConfirmMessage(overrideType: OverrideType): string {
  switch (overrideType) {
    case "feestdag":
    case "schoolvakantie":
      return "Weet je het zeker? Dit moment valt op een feestdag of in een schoolvakantie.";
    case "max_aantal_deelnemers":
      return "Weet je het zeker? Het maximum aantal deelnemers is bereikt.";
    case "minimum_aantal_deelnemers":
      return "Weet je het zeker? Het minimum aantal deelnemers is niet bereikt.";
    case "handmatige_blokkade":
      return "Weet je het zeker? Deze sessie is handmatig geblokkeerd.";
  }
}

/**
 * Get the override type for a given session status
 */
export function getOverrideTypeForStatus(status: SessionStatus): OverrideType | null {
  switch (status) {
    case "feestdag": return "feestdag";
    case "schoolvakantie": return "schoolvakantie";
    case "max_aantal_deelnemers_bereikt": return "max_aantal_deelnemers";
    case "minimum_aantal_deelnemers_niet_bereikt": return "minimum_aantal_deelnemers";
    case "geblokkeerd": return "handmatige_blokkade";
    default: return null;
  }
}
