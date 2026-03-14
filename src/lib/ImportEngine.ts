/**
 * ImportEngine — Shared import pipeline infrastructure.
 *
 * Composes existing importUtils.ts helpers (normalizeKey, findCol, parseExcelDate,
 * parseTime, entity matchers) with standardized orchestration for:
 * - Availability cell parsing (shared between ClientImport & PlanningImport)
 * - Overwrite policy
 * - Summary reporting
 * - Date generation for recurring availability
 *
 * Does NOT duplicate existing importUtils logic — extends it with pipeline
 * consistency that was previously spread across import components.
 */

export {
  normalizeKey,
  normalizeColumnHeader,
  findCol,
  normalizeEntityName,
  stripSchoolPrefix,
  findSchoolMatch,
  findAreaMatch,
  findReferrerMatch,
  parseCsv,
  readFileAsRows,
  parseTime,
  parseExcelDate,
  type EntityRef,
} from "@/lib/importUtils";

import { parseTime } from "@/lib/importUtils";
import {
  DEFAULT_AVAIL_START,
  DEFAULT_AVAIL_END,
  SCHOOL_TIME_AVAIL_START,
  SCHOOL_TIME_AVAIL_END,
  AVAILABILITY_GENERATION_DAYS,
} from "@/lib/DomainResolver";

// ── Availability cell parsing (SSOT) ────────────────────────────────

export interface ParsedAvailability {
  available: boolean;
  startTime: string;
  endTime: string;
  notes: string | null;
}

/**
 * Parse a cell value into availability data.
 *
 * Handles: "x", "ja", "ochtend", "middag", "voorkeur", "in overleg",
 * "onder schooltijd", "vanaf HH:MM", "na HH:MM", "tot HH:MM",
 * "HH:MM uur", time ranges "HH:MM-HH:MM", "HH:MM of HH:MM"
 *
 * This is the SINGLE implementation — both ClientImport and PlanningImport
 * must use this instead of their own duplicated versions.
 */
export function parseAvailabilityCell(val: any): ParsedAvailability | null {
  if (val === undefined || val === null || val === "") return null;
  const s = String(val).trim();
  if (!s) return null;
  const lower = s.toLowerCase().replace(/\s+/g, " ");

  // Skip clearly non-availability values
  if (["nee", "no", "-", "n/a", "nvt", "n.v.t.", "n"].includes(lower)) return null;

  // Cross / check mark = whole day
  if (["x", "✓", "✔", "ja", "yes", "v", "√"].includes(lower)) {
    return { available: true, startTime: DEFAULT_AVAIL_START, endTime: DEFAULT_AVAIL_END, notes: null };
  }

  // "X (15.00 uur)" or "X (13.00 uur)" or "X (12:15)"
  const xWithTime = lower.match(/^x\s*\((\d{1,2}[:\.]?\d{0,2})\s*(?:uur|u)?\s*\)/);
  if (xWithTime) {
    const t = parseTime(xWithTime[1]);
    if (t) {
      const [h] = t.split(":").map(Number);
      return { available: true, startTime: t, endTime: `${String(Math.min(h + 4, 17)).padStart(2, "0")}:00`, notes: null };
    }
  }
  // "X (voorkeur)" or similar X with text
  if (/^x\s*\(/.test(lower)) {
    return { available: true, startTime: DEFAULT_AVAIL_START, endTime: DEFAULT_AVAIL_END, notes: null };
  }

  // "Ochtend" / "morgen"
  if (["ochtend", "morgen", "ochtends", "s ochtends", "'s ochtends", "voormiddag"].includes(lower)) {
    return { available: true, startTime: DEFAULT_AVAIL_START, endTime: "12:00", notes: null };
  }

  // "Middag"
  if (["middag", "s middags", "'s middags", "namiddag"].includes(lower)) {
    return { available: true, startTime: "12:00", endTime: DEFAULT_AVAIL_END, notes: null };
  }

  // "Voorkeur" = available (preference)
  if (lower === "voorkeur") {
    return { available: true, startTime: DEFAULT_AVAIL_START, endTime: DEFAULT_AVAIL_END, notes: "Voorkeur" };
  }

  // "io" or "in overleg" = available (to be discussed)
  if (lower === "io" || lower === "in overleg") {
    return { available: true, startTime: DEFAULT_AVAIL_START, endTime: DEFAULT_AVAIL_END, notes: "In overleg" };
  }

  // "Onder schooltijd"
  if (lower.includes("schooltijd") || lower.includes("school tijd")) {
    return { available: true, startTime: SCHOOL_TIME_AVAIL_START, endTime: SCHOOL_TIME_AVAIL_END, notes: s };
  }

  // "vanaf HH:MM" / "vanaf 15u" / "vanaf 15.00 uur"
  const vanafMatch = lower.match(/^vanaf\s+(\d{1,2})[:\.]?(\d{0,2})\s*(?:uur|u)?/);
  if (vanafMatch) {
    const h = parseInt(vanafMatch[1]);
    const m = vanafMatch[2] ? parseInt(vanafMatch[2]) : 0;
    return { available: true, startTime: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`, endTime: DEFAULT_AVAIL_END, notes: null };
  }

  // "na HH:MM"
  const naMatch = lower.match(/^na\s+(\d{1,2})[:\.]?(\d{0,2})/);
  if (naMatch) {
    const h = parseInt(naMatch[1]);
    const m = naMatch[2] ? parseInt(naMatch[2]) : 0;
    return { available: true, startTime: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`, endTime: DEFAULT_AVAIL_END, notes: null };
  }

  // "Tot HH:MM" / "Tot 1630"
  const totMatch = lower.match(/^tot\s+(\d{1,2})[:\.]?(\d{0,2})/);
  if (totMatch) {
    const h = parseInt(totMatch[1]);
    let m = totMatch[2] ? parseInt(totMatch[2]) : 0;
    // Handle "1630" as 16:30
    if (h > 23 && h < 2400) {
      const hh = Math.floor(h / 100);
      const mm = h % 100;
      return { available: true, startTime: DEFAULT_AVAIL_START, endTime: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`, notes: s.includes("ivm") || s.includes("i.v.m") ? s : null };
    }
    return { available: true, startTime: DEFAULT_AVAIL_START, endTime: `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`, notes: s.includes("ivm") || s.includes("i.v.m") ? s : null };
  }

  // "HH.MMuur" / "15.00 uur"
  const timeUur = lower.match(/^(\d{1,2})[:\.](\d{2})\s*(?:uur|u)?$/);
  if (timeUur) {
    const h = parseInt(timeUur[1]);
    const m = parseInt(timeUur[2]);
    const startTime = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
    return { available: true, startTime, endTime: `${String(Math.min(h + 4, 17)).padStart(2, "0")}:00`, notes: null };
  }

  // Time range "HH:MM-HH:MM", "8.30-15.00"
  const range = lower.match(/^(\d{1,2}[:\.]?\d{0,2})\s*[-–]\s*(\d{1,2}[:\.]?\d{0,2})$/);
  if (range) {
    const parseCompact = (v: string): string | null => {
      if (/^\d{3,4}$/.test(v)) {
        const n = parseInt(v);
        return `${String(Math.floor(n / 100)).padStart(2, "0")}:${String(n % 100).padStart(2, "0")}`;
      }
      return parseTime(v);
    };
    const start = parseCompact(range[1]) || parseTime(range[1]);
    const end = parseCompact(range[2]) || parseTime(range[2]);
    if (start && end) return { available: true, startTime: start, endTime: end, notes: null };
  }

  // "8.30 of 12.15" — multiple options, take first
  const ofMatch = lower.match(/^(\d{1,2}[:\.]?\d{0,2})\s+of\s+/);
  if (ofMatch) {
    const t = parseTime(ofMatch[1]);
    if (t) {
      const [h] = t.split(":").map(Number);
      return { available: true, startTime: t, endTime: `${String(Math.min(h + 4, 17)).padStart(2, "0")}:00`, notes: s };
    }
  }

  // Plain time value
  const time = parseTime(val);
  if (time) {
    const [h] = time.split(":").map(Number);
    return { available: true, startTime: time, endTime: `${String(Math.min(h + 4, 17)).padStart(2, "0")}:00`, notes: null };
  }

  // "x " prefix
  if (lower.startsWith("x ") || lower.startsWith("x,")) {
    return { available: true, startTime: DEFAULT_AVAIL_START, endTime: DEFAULT_AVAIL_END, notes: null };
  }

  // "vanaf" with only text (e.g., "vanaf april")
  if (lower.startsWith("vanaf ") && !lower.match(/\d/)) {
    return { available: true, startTime: DEFAULT_AVAIL_START, endTime: DEFAULT_AVAIL_END, notes: s };
  }

  // Any other non-empty value — default to available (conservative)
  return { available: true, startTime: DEFAULT_AVAIL_START, endTime: DEFAULT_AVAIL_END, notes: s };
}

// ── Date generation for recurring availability ──────────────────────

/**
 * Generate dates for a specific day of week over the next N days.
 * dayIndex: 0=Sunday, 1=Monday, ..., 6=Saturday
 */
export function generateDatesForDay(
  dayIndex: number,
  days: number = AVAILABILITY_GENERATION_DAYS,
): string[] {
  const dates: string[] = [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    if (d.getDay() === dayIndex) {
      dates.push(d.toISOString().split("T")[0]);
    }
  }
  return dates;
}

/**
 * Generate all dates for a given weekday in the next N months from today.
 */
export function expandWeekdayToDates(
  weekdayIndex: number,
  months: number = 4,
): string[] {
  const dates: string[] = [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setMonth(end.getMonth() + months);

  const current = new Date(start);
  while (current.getDay() !== weekdayIndex) {
    current.setDate(current.getDate() + 1);
  }
  while (current <= end) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, "0");
    const d = String(current.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
    current.setDate(current.getDate() + 7);
  }
  return dates;
}

// ── Overwrite policy ────────────────────────────────────────────────

/**
 * Apply enrichment-only overwrite policy:
 * - blank input never overwrites valid existing values
 * - invalid input never overwrites valid existing values
 * - returns only the fields that should be updated
 */
export function applyEnrichmentPolicy(
  existingRecord: Record<string, any>,
  importedData: Record<string, any>,
  options: {
    /** Fields that should always overwrite even if existing has a value */
    alwaysOverwrite?: string[];
    /** Fields to skip entirely */
    skipFields?: string[];
  } = {},
): Record<string, any> {
  const updateData: Record<string, any> = {};
  const { alwaysOverwrite = [], skipFields = [] } = options;

  for (const [key, value] of Object.entries(importedData)) {
    if (skipFields.includes(key)) continue;
    if (value === null || value === undefined || value === "") continue;

    if (alwaysOverwrite.includes(key)) {
      updateData[key] = value;
    } else if (!existingRecord[key] || existingRecord[key] === "") {
      // Only fill missing values
      updateData[key] = value;
    }
  }

  return updateData;
}

/**
 * Append text to an existing notes field without overwriting.
 * Returns the merged text, or null if both are empty.
 */
export function appendNotes(
  existing: string | null | undefined,
  incoming: string | null | undefined,
): string | null {
  const e = (existing ?? "").trim();
  const i = (incoming ?? "").trim();
  if (!i) return e || null;
  if (!e) return i;
  if (e.includes(i)) return e; // Already contains the incoming text
  return `${e}\n${i}`;
}

// ── Import summary ──────────────────────────────────────────────────

export interface ImportSummary {
  added: number;
  updated: number;
  skipped: number;
  invalid: number;
  errors: string[];
  warnings: string[];
}

export function createImportSummary(): ImportSummary {
  return { added: 0, updated: 0, skipped: 0, invalid: 0, errors: [], warnings: [] };
}

/**
 * Build a human-readable summary message from an ImportSummary.
 */
export function buildSummaryMessage(summary: ImportSummary): string {
  const parts: string[] = [];
  if (summary.added > 0) parts.push(`${summary.added} toegevoegd`);
  if (summary.updated > 0) parts.push(`${summary.updated} bijgewerkt`);
  if (summary.skipped > 0) parts.push(`${summary.skipped} overgeslagen`);
  if (summary.invalid > 0) parts.push(`${summary.invalid} ongeldig`);
  return parts.join(", ") || "Geen wijzigingen";
}

// ── Gender normalization ────────────────────────────────────────────

const GENDER_MAP: Record<string, string> = {
  jongen: "Jongen", j: "Jongen", m: "Jongen", man: "Jongen", male: "Jongen", boy: "Jongen",
  meisje: "Meisje", meid: "Meisje", v: "Meisje", vrouw: "Meisje", female: "Meisje", girl: "Meisje",
  anders: "Anders", x: "Anders", overig: "Anders", other: "Anders",
};

/**
 * Normalize a gender string to standardized values: "Jongen", "Meisje", "Anders".
 * Returns null for unknown values.
 */
export function normalizeGender(val: string | undefined | null): string | null {
  if (!val) return null;
  return GENDER_MAP[val.toLowerCase().trim()] ?? val;
}

// ── Name splitting ──────────────────────────────────────────────────

/**
 * Split a full name into first_name + last_name.
 */
export function splitName(fullName: string): { first_name: string; last_name: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { first_name: parts[0], last_name: "" };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}

// ── Non-person referral sources ─────────────────────────────────────

const NON_PERSON_REFERRAL_SOURCES = [
  "flyer", "folder", "internet", "website", "social media", "facebook", "instagram",
  "whatsapp", "mond-tot-mond", "mond tot mond", "via via", "buurthuis", "wijkteam",
  "huisarts", "ggd", "school", "leerkracht", "juf", "meester", "intern",
  "poster", "krant", "buurtwerk", "wijkcentrum", "speeltuin", "ouder",
  "buren", "kennissen", "familie", "vrienden", "tv", "radio", "kerk", "moskee",
  "sportvereniging", "club", "bibliotheek", "consultatiebureau", "jeugdzorg",
  "zelfstandig", "eigen initiatief", "onbekend", "anders", "overig",
];

/**
 * Check if a referral source is a non-person source (generic channel).
 */
export function isNonPersonReferralSource(source: string): boolean {
  const normalized = source.toLowerCase().trim();
  return NON_PERSON_REFERRAL_SOURCES.some(
    (src) => normalized === src || normalized.includes(src),
  );
}

// ── Date format detection ───────────────────────────────────────────

import { normalizeKey } from "@/lib/importUtils";

const DATE_COL_CANDIDATES = [
  "Datum inschrijving", "Inschrijfdatum", "datum inschrijving",
  "Datum Intake", "Intake datum", "datum intake", "intake_date",
  "Geboortedatum", "geboortedatum", "date_of_birth", "Geboorte datum",
];

/**
 * Auto-detect whether dates in the dataset are in MM/DD (US) or DD/MM (EU) format.
 * Default: DD/MM (Dutch).
 */
export function detectDateFormat(rows: Record<string, any>[]): "mdy" | "dmy" {
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      const nk = normalizeKey(key);
      const isDateCol = DATE_COL_CANDIDATES.some(c => normalizeKey(c) === nk || nk.includes(normalizeKey(c)));
      if (!isDateCol) continue;
      const s = String(row[key]).trim();
      const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
      if (!m) continue;
      const p1 = parseInt(m[1]);
      const p2 = parseInt(m[2]);
      if (p1 > 12) return "dmy";
      if (p2 > 12) return "mdy";
    }
  }
  return "dmy";
}
