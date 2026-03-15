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
  "gemeente naam",
  "woonplaats",
  "city",
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

// ── Traditional schedule resolution ─────────────────────────────────

/** Segment labels for traditional schedule display */
export const SCHEDULE_SEGMENT_LABELS = {
  morning: "Ochtend",
  break: "Pauze",
  afternoon: "Middag",
} as const;

/** A single time segment in a resolved schedule */
export interface ScheduleSegment {
  label: string;
  start: string;   // HH:mm
  end: string;      // HH:mm
  isBreak: boolean;
}

/** Resolved traditional schedule with morning / break / afternoon segments */
export interface ResolvedTraditionalSchedule {
  segments: ScheduleSegment[];
  isTraditional: true;
}

/** Resolved continuous schedule (single block, no break) */
export interface ResolvedContinuousSchedule {
  range: string;     // formatted "HH:mm – HH:mm" or "—"
  isTraditional: false;
}

export type ResolvedSchedule = ResolvedTraditionalSchedule | ResolvedContinuousSchedule;

/**
 * Input shape for schedule resolution — matches the school DB fields.
 */
export interface SchoolScheduleInput {
  schedule_type?: string | null;
  school_start_time?: string | null;
  school_end_time?: string | null;
  break_start_time?: string | null;
  break_end_time?: string | null;
}

/**
 * Resolve a school's schedule into a display-ready structure.
 *
 * For traditional schedules with break times:
 *   → returns { segments: [Ochtend, Pauze, Middag], isTraditional: true }
 *
 * For traditional schedules WITHOUT break times:
 *   → returns { segments: [Ochtend(full range)], isTraditional: true } with a note that
 *     pauze is unknown. Callers can detect segments.length < 3.
 *
 * For continuous/unknown schedules:
 *   → returns { range: "HH:mm – HH:mm", isTraditional: false }
 */
export function resolveSchedule(school: SchoolScheduleInput): ResolvedSchedule {
  const isTraditional = school.schedule_type === "traditioneel";

  if (!isTraditional) {
    return {
      range: formatSchoolTimeRange(school.school_start_time, school.school_end_time),
      isTraditional: false,
    };
  }

  const start = formatSchoolTime(school.school_start_time);
  const end = formatSchoolTime(school.school_end_time);
  const breakStart = formatSchoolTime(school.break_start_time);
  const breakEnd = formatSchoolTime(school.break_end_time);

  // Traditional with full break info → 3 segments
  if (start && end && breakStart && breakEnd) {
    return {
      isTraditional: true,
      segments: [
        { label: SCHEDULE_SEGMENT_LABELS.morning, start, end: breakStart, isBreak: false },
        { label: SCHEDULE_SEGMENT_LABELS.break, start: breakStart, end: breakEnd, isBreak: true },
        { label: SCHEDULE_SEGMENT_LABELS.afternoon, start: breakEnd, end, isBreak: false },
      ],
    };
  }

  // Traditional with only start/end but no break → single segment (incomplete)
  if (start && end) {
    return {
      isTraditional: true,
      segments: [
        { label: SCHEDULE_SEGMENT_LABELS.morning, start, end, isBreak: false },
      ],
    };
  }

  // Traditional but no times at all → empty segments
  return {
    isTraditional: true,
    segments: [],
  };
}

/**
 * Format a resolved schedule for display as a single string.
 *
 * Traditional with 3 segments:
 *   "Ochtend 08:30 – 11:45 | Pauze 11:45 – 12:30 | Middag 12:30 – 15:00"
 *
 * Continuous: "08:30 – 15:00"
 */
export function formatResolvedSchedule(resolved: ResolvedSchedule): string {
  if (!resolved.isTraditional) {
    return resolved.range;
  }
  if (resolved.segments.length === 0) return "—";
  return resolved.segments
    .map((s) => `${s.label} ${s.start} – ${s.end}`)
    .join(" | ");
}

/**
 * Format a resolved schedule for compact display (list views).
 * Traditional with 3 segments: "08:30–11:45 / 12:30–15:00"
 * Traditional without break: "08:30 – 15:00 (pauze onbekend)"
 * Continuous: "08:30 – 15:00"
 */
export function formatScheduleCompact(resolved: ResolvedSchedule): string {
  if (!resolved.isTraditional) {
    return resolved.range;
  }
  if (resolved.segments.length === 0) return "—";
  if (resolved.segments.length === 3) {
    const morning = resolved.segments[0];
    const afternoon = resolved.segments[2];
    return `${morning.start}–${morning.end} / ${afternoon.start}–${afternoon.end}`;
  }
  // Incomplete traditional (no break times)
  const seg = resolved.segments[0];
  return `${seg.start} – ${seg.end} (pauze onbekend)`;
}

// ── Import parsing ──────────────────────────────────────────────────

function normalizeImportColumnName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\-\s]+/g, " ")
    .trim();
}

function hasImportValue(value: any): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim() !== "";
  return true;
}

function padTime(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

function toMinutes(dbTime: string): number {
  const [h, m] = dbTime.split(":").map((v) => parseInt(v, 10));
  return h * 60 + m;
}

function minutesToDbTime(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return padTime(h, m);
}

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
    return padTime(h, m);
  }

  // Excel numeric time (0–1 range)
  if (typeof value === "number") {
    if (value < 0 || value >= 1) return null;
    const totalMinutes = Math.round(value * 24 * 60);
    if (totalMinutes >= 24 * 60) return null;
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return padTime(h, m);
  }

  const str = String(value).trim();
  if (!str) return null;

  // Try HH:mm:ss
  let match = str.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (match) {
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return padTime(h, m);
    }
    return null;
  }

  // Try HH:mm or H:mm
  match = str.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return padTime(h, m);
    }
    return null;
  }

  // Try HH.mm or H.mm
  match = str.match(/^(\d{1,2})\.(\d{2})$/);
  if (match) {
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return padTime(h, m);
    }
    return null;
  }

  // Try numeric string (Excel sometimes stringifies)
  const num = parseFloat(str);
  if (!isNaN(num) && num >= 0 && num < 1) {
    const totalMinutes = Math.round(num * 24 * 60);
    if (totalMinutes >= 24 * 60) return null;
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return padTime(h, m);
  }

  return null;
}

function extractDbTimesFromText(value: string): string[] {
  const matches = value.matchAll(/(?:^|[^\d])([01]?\d|2[0-3])[:.]([0-5]\d)(?=$|[^\d])/g);
  const times: string[] = [];
  for (const match of matches) {
    const h = parseInt(match[1], 10);
    const m = parseInt(match[2], 10);
    times.push(padTime(h, m));
  }
  return times;
}

/**
 * Parse textual range values like:
 * - "08:30–15:00"
 * - "08:30-11:45 / 12:45-14:45"
 * - "gr.1-2 08:30–12:00 / gr.3-8 08:30–14:45"
 */
export function parseImportedSchoolTimeRange(
  value: any,
): { start: string; end: string } | null {
  if (!hasImportValue(value)) return null;
  const str = String(value).trim();
  const times = extractDbTimesFromText(str);
  if (times.length < 2) return null;

  const minutes = times.map(toMinutes);
  const start = Math.min(...minutes);
  const end = Math.max(...minutes);
  if (end <= start) return null;

  return {
    start: minutesToDbTime(start),
    end: minutesToDbTime(end),
  };
}

/** Optional day-based column aliases for school-time imports */
const SCHOOL_DAY_TIME_COLUMNS = [
  ["maandag", "monday"],
  ["dinsdag", "tuesday"],
  ["woensdag", "wednesday"],
  ["donderdag", "thursday"],
  ["vrijdag", "friday"],
] as const;

interface TimePair {
  start: string;
  end: string;
}

function pickMostFrequentTimePair(pairs: TimePair[]): TimePair | null {
  if (pairs.length === 0) return null;

  const counts = new Map<string, { count: number; firstIndex: number; pair: TimePair }>();
  pairs.forEach((pair, index) => {
    const key = `${pair.start}|${pair.end}`;
    const prev = counts.get(key);
    if (prev) {
      prev.count += 1;
    } else {
      counts.set(key, { count: 1, firstIndex: index, pair });
    }
  });

  let best: { count: number; firstIndex: number; pair: TimePair } | null = null;
  for (const entry of counts.values()) {
    if (!best) {
      best = entry;
      continue;
    }
    if (entry.count > best.count) {
      best = entry;
      continue;
    }
    if (entry.count === best.count && entry.firstIndex < best.firstIndex) {
      best = entry;
    }
  }

  return best?.pair ?? null;
}

export interface ResolvedImportedSchoolTimePair {
  school_start_time: string | null;
  school_end_time: string | null;
  invalidValues: number;
}

/**
 * Resolve a valid school time pair from a row:
 * 1) explicit start/end columns
 * 2) range inside one explicit time cell
 * 3) fallback to day columns (Maandag–Vrijdag) with majority pair
 */
export function resolveImportedSchoolTimePair(
  row: Record<string, any>,
  headers: string[],
  startTimeCol: string | null,
  endTimeCol: string | null,
): ResolvedImportedSchoolTimePair {
  let invalidValues = 0;

  const rawStart = startTimeCol ? row[startTimeCol] : null;
  const rawEnd = endTimeCol ? row[endTimeCol] : null;

  const hasRawStart = hasImportValue(rawStart);
  const hasRawEnd = hasImportValue(rawEnd);

  const parsedStart = hasRawStart ? parseImportedSchoolTime(rawStart) : null;
  const parsedEnd = hasRawEnd ? parseImportedSchoolTime(rawEnd) : null;

  const startRange = hasRawStart ? parseImportedSchoolTimeRange(rawStart) : null;
  const endRange = hasRawEnd ? parseImportedSchoolTimeRange(rawEnd) : null;

  if (hasRawStart && !parsedStart && !startRange) invalidValues += 1;
  if (hasRawEnd && !parsedEnd && !endRange) invalidValues += 1;

  const explicitValidation = validateSchoolTimePair(parsedStart, parsedEnd);
  if (explicitValidation.valid && parsedStart && parsedEnd) {
    return {
      school_start_time: parsedStart,
      school_end_time: parsedEnd,
      invalidValues,
    };
  }

  if (startRange) {
    return {
      school_start_time: startRange.start,
      school_end_time: startRange.end,
      invalidValues,
    };
  }

  if (endRange) {
    return {
      school_start_time: endRange.start,
      school_end_time: endRange.end,
      invalidValues,
    };
  }

  if (parsedStart || parsedEnd) {
    invalidValues += 1;
  }

  const dayPairs: TimePair[] = [];
  for (const aliases of SCHOOL_DAY_TIME_COLUMNS) {
    const dayCol = findMatchingColumn(headers, [...aliases]);
    if (!dayCol) continue;

    const rawDayValue = row[dayCol];
    if (!hasImportValue(rawDayValue)) continue;

    const parsedDayRange = parseImportedSchoolTimeRange(rawDayValue);
    if (parsedDayRange) {
      dayPairs.push(parsedDayRange);
    } else {
      invalidValues += 1;
    }
  }

  const bestDayPair = pickMostFrequentTimePair(dayPairs);
  if (bestDayPair) {
    return {
      school_start_time: bestDayPair.start,
      school_end_time: bestDayPair.end,
      invalidValues,
    };
  }

  return {
    school_start_time: null,
    school_end_time: null,
    invalidValues,
  };
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

/**
 * Validate break time pair for traditional schedules.
 * Returns valid if:
 * - Both null (break not set)
 * - Both filled and break_start < break_end
 * - Break falls within school_start..school_end when those are provided
 */
export function validateBreakTimePair(
  breakStart: string | null | undefined,
  breakEnd: string | null | undefined,
  schoolStart?: string | null,
  schoolEnd?: string | null,
): SchoolTimeValidation {
  const bs = (breakStart ?? "").trim();
  const be = (breakEnd ?? "").trim();

  if (!bs && !be) return { valid: true };

  if ((!bs && be) || (bs && !be)) {
    return { valid: false, error: "Pauze begin- en eindtijd moeten beide ingevuld zijn." };
  }

  if (bs >= be) {
    return { valid: false, error: "Pauze eindtijd moet later zijn dan pauze begintijd." };
  }

  const ss = (schoolStart ?? "").trim();
  const se = (schoolEnd ?? "").trim();

  if (ss && bs <= ss) {
    return { valid: false, error: "Pauze begintijd moet na schooltijd begin liggen." };
  }

  if (se && be >= se) {
    return { valid: false, error: "Pauze eindtijd moet voor schooltijd einde liggen." };
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
  "ochtend begin",
  "ochtend start",
];

export const SCHOOL_END_TIME_COLUMNS = [
  "schooltijd eind",
  "school_end_time",
  "eind tijd",
  "eindtijd",
  "endtime",
  "school eind",
  "einde",
  "middag eind",
  "middag einde",
];

export const BREAK_START_TIME_COLUMNS = [
  "pauze begin",
  "pauze start",
  "break_start_time",
  "pauze begintijd",
  "ochtend eind",
  "ochtend einde",
];

export const BREAK_END_TIME_COLUMNS = [
  "pauze eind",
  "pauze einde",
  "break_end_time",
  "pauze eindtijd",
  "middag begin",
  "middag start",
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
 * Find the first header that matches any candidate.
 * Matching strategy: exact → starts-with (unique) → contains (unique).
 * Matching is case-insensitive and accent/whitespace/underscore tolerant.
 * Returns the original header string or null.
 */
export function findMatchingColumn(
  headers: string[],
  candidates: string[],
): string | null {
  const normalizedHeaders = headers.map((header) => ({
    raw: header,
    normalized: normalizeImportColumnName(header),
  }));
  const normalizedCandidates = candidates.map(normalizeImportColumnName);

  // Priority 1: exact
  for (const candidate of normalizedCandidates) {
    const exact = normalizedHeaders.find((header) => header.normalized === candidate);
    if (exact) return exact.raw;
  }

  // Priority 2: starts-with (only if unique)
  for (const candidate of normalizedCandidates) {
    const startsWithMatches = normalizedHeaders.filter((header) =>
      header.normalized.startsWith(candidate),
    );
    if (startsWithMatches.length === 1) return startsWithMatches[0].raw;
  }

  // Priority 3: contains (only if unique + avoid too-short candidate)
  for (const candidate of normalizedCandidates) {
    if (candidate.length < 4) continue;
    const containsMatches = normalizedHeaders.filter((header) =>
      header.normalized.includes(candidate),
    );
    if (containsMatches.length === 1) return containsMatches[0].raw;
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
