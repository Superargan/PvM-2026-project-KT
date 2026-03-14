/**
 * Shared utility for school time formatting, parsing, and validation.
 * SSOT: school times exist only on schools.school_start_time / school_end_time.
 * SSOT: municipality exists only on schools.municipality (null = Rotterdam).
 */

// ── Municipality (Gemeente) ─────────────────────────────────────────

/** Default municipality when none is explicitly set. */
export const DEFAULT_MUNICIPALITY = "Rotterdam";

/**
 * Get effective municipality for display.
 * SSOT: school.municipality is authoritative; null/empty → Rotterdam.
 * For clients: derive from linked school.
 */
export function getEffectiveMunicipality(municipality: string | null | undefined): string {
  const trimmed = (municipality ?? "").trim();
  return trimmed || DEFAULT_MUNICIPALITY;
}

/** Import column candidates for municipality */
export const MUNICIPALITY_COLUMNS = [
  "gemeente",
  "municipality",
  "gemeentenaam",
  "GEMEENTENAAM",
  "gemeente naam",
];

// ── Formatting ──────────────────────────────────────────────────────

/** Convert DB time value (e.g. "08:30:00") to display "HH:mm" or "" */
export function formatSchoolTime(value: string | null | undefined): string {
  if (!value) return "";
  // Take first 5 chars: "HH:mm"
  const match = value.match(/^(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : "";
}

/** Format a start–end pair as "08:30 – 15:00" or "—" */
export function formatSchoolTimeRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  const s = formatSchoolTime(start);
  const e = formatSchoolTime(end);
  if (s && e) return `${s} – ${e}`;
  return "—";
}

// ── Import parsing ──────────────────────────────────────────────────

/**
 * Parse an imported school time value.
 * Supports: HH:mm, H:mm, HH.mm, HH:mm:ss, Excel numeric (0.354166 → 08:30).
 * Returns normalized "HH:mm:ss" or null for invalid/empty.
 */
export function parseImportedSchoolTime(value: any): string | null {
  if (value === null || value === undefined) return null;

  // Handle Date objects (XLSX can return these for time cells)
  if (value instanceof Date) {
    const h = value.getHours();
    const m = value.getMinutes();
    if (h === 0 && m === 0 && value.getSeconds() === 0) return null; // midnight = likely empty
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
  }

  // Excel numeric time (0–1 range)
  if (typeof value === "number") {
    if (value < 0 || value >= 1) return null;
    const totalMinutes = Math.round(value * 24 * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
  }

  const str = String(value).trim();
  if (!str) return null;

  // Try HH:mm:ss
  let match = str.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (match) {
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
    }
    return null;
  }

  // Try HH:mm or H:mm
  match = str.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
    }
    return null;
  }

  // Try HH.mm or H.mm
  match = str.match(/^(\d{1,2})\.(\d{2})$/);
  if (match) {
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
    }
    return null;
  }

  // Try numeric string (Excel sometimes stringifies)
  const num = parseFloat(str);
  if (!isNaN(num) && num >= 0 && num < 1) {
    const totalMinutes = Math.round(num * 24 * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
  }

  return null;
}

// ── Validation ──────────────────────────────────────────────────────

export interface SchoolTimeValidation {
  valid: boolean;
  error?: string;
}

/**
 * Validate a start/end time pair.
 * Both null → valid. Both filled and start < end → valid. Otherwise invalid.
 * Inputs can be HH:mm or HH:mm:ss format strings, or null/undefined/empty.
 */
export function validateSchoolTimePair(
  start: string | null | undefined,
  end: string | null | undefined,
): SchoolTimeValidation {
  const s = (start ?? "").trim();
  const e = (end ?? "").trim();

  if (!s && !e) return { valid: true };

  if ((!s && e) || (s && !e)) {
    return { valid: false, error: "Begin- en eindtijd moeten beide ingevuld zijn." };
  }

  // Compare as strings (works for HH:mm and HH:mm:ss since they're zero-padded)
  if (s >= e) {
    return { valid: false, error: "Eindtijd moet later zijn dan begintijd." };
  }

  return { valid: true };
}

// ── Import column matching ──────────────────────────────────────────

export const SCHOOL_START_TIME_COLUMNS = [
  "schooltijd begin",
  "school_start_time",
  "start tijd",
  "begintijd",
  "aanvangstijd",
  "starttime",
  "school start",
  "aanvang",
];

export const SCHOOL_END_TIME_COLUMNS = [
  "schooltijd eind",
  "school_end_time",
  "eind tijd",
  "eindtijd",
  "endtime",
  "school eind",
  "einde",
];

export const SCHEDULE_TYPE_COLUMNS = [
  "rooster",
  "roostertype",
  "type rooster",
  "schedule_type",
  "rooster type",
  "schooltype",
  "type",
];

export const SOURCE_COLUMNS = [
  "bron",
  "source",
  "herkomst",
  "databron",
];

/**
 * Find the first header that matches any of the candidate names (case-insensitive, trimmed).
 * Returns the original header string or null.
 */
export function findMatchingColumn(
  headers: string[],
  candidates: string[],
): string | null {
  const normalizedCandidates = candidates.map((c) => c.toLowerCase().trim());
  for (const header of headers) {
    if (normalizedCandidates.includes(header.toLowerCase().trim())) {
      return header;
    }
  }
  return null;
}

// ── School name normalization ───────────────────────────────────────

/** Normalize school name for deduplication: trim, lowercase, collapse spaces */
export function normalizeSchoolName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// ── Form helpers ────────────────────────────────────────────────────

/** Convert DB time "HH:mm:ss" to input-safe "HH:mm" */
export function dbTimeToInput(value: string | null | undefined): string {
  return formatSchoolTime(value);
}

/** Convert input "HH:mm" to DB-safe "HH:mm:ss" or null */
export function inputTimeToDb(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Already HH:mm:ss
  if (/^\d{2}:\d{2}:\d{2}$/.test(trimmed)) return trimmed;
  // HH:mm → HH:mm:00
  if (/^\d{2}:\d{2}$/.test(trimmed)) return `${trimmed}:00`;
  return null;
}
