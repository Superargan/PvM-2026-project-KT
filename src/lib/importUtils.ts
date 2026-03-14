/**
 * Shared import utilities — SSOT for column detection, entity matching,
 * and normalization across all import pipelines.
 */

// ── Key Normalization ───────────────────────────────────────────────

/**
 * Normalize a string for fuzzy matching: lowercase, remove accents,
 * strip non-alphanumeric characters.
 * Used for column detection AND entity name matching.
 */
export function normalizeKey(key: string): string {
  return key
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Normalize for column-header matching: preserves word boundaries
 * (spaces) for more accurate header matching. Accents removed, separators normalized.
 */
export function normalizeColumnHeader(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\-\s]+/g, " ")
    .trim();
}

// ── Row-level column value finder ───────────────────────────────────

/**
 * Find a value in a row by trying multiple column name candidates.
 * Three-tier matching: exact → starts-with → contains.
 * Returns the trimmed string value or undefined.
 */
export function findCol(row: Record<string, any>, ...candidates: string[]): string | undefined {
  const keys = Object.keys(row);
  const normalizedCandidates = candidates.map(normalizeKey);

  // Priority 1: exact normalized match
  for (const c of normalizedCandidates) {
    const found = keys.find((k) => normalizeKey(k) === c);
    if (found && row[found] !== undefined && row[found] !== "") return String(row[found]).trim();
  }

  // Priority 2: starts-with match
  for (const c of normalizedCandidates) {
    const found = keys.find((k) => normalizeKey(k).startsWith(c));
    if (found && row[found] !== undefined && row[found] !== "") return String(row[found]).trim();
  }

  // Priority 3: contains match (min 3 chars to avoid false positives)
  for (const c of normalizedCandidates) {
    if (c.length < 3) continue;
    const found = keys.find((k) => normalizeKey(k).includes(c));
    if (found && row[found] !== undefined && row[found] !== "") return String(row[found]).trim();
  }

  return undefined;
}

// ── Entity matching ─────────────────────────────────────────────────

/** Standard name normalization for entity deduplication */
export function normalizeEntityName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Known school type prefixes stripped for fuzzy matching */
const SCHOOL_PREFIXES = [
  "openbare basisschool", "christelijke basisschool", "prot chr basissch",
  "chr basissch", "protestants christelijke basisschool", "rooms katholieke basisschool",
  "rk basisschool", "r.k. basisschool", "basisschool", "daltonschool",
  "montessorischool", "jenaplanschool", "obs", "cbs", "kbs", "sbo", "wso",
  "rkbs", "pcbs", "school voor",
];

/** Strip common school type prefixes and articles for fuzzy matching */
export function stripSchoolPrefix(name: string): string {
  let n = normalizeEntityName(name);
  for (const prefix of SCHOOL_PREFIXES) {
    if (n.startsWith(prefix + " ")) {
      n = n.slice(prefix.length).trim();
      break;
    }
  }
  // Also strip leading articles
  n = n.replace(/^(de|het|'t)\s+/i, "").trim();
  return n;
}

export interface EntityRef {
  id: string;
  name: string;
}

/**
 * Find a school match from a list using the standard matching hierarchy:
 * 1. user resolutions
 * 2. exact match
 * 3. contains match
 * 4. prefix-stripped match
 * 5. starts-with first word
 *
 * Returns { id, name } or null.
 */
export function findSchoolMatch(
  inputName: string,
  schools: EntityRef[],
  resolutions?: Record<string, string>,
): EntityRef | null {
  if (!inputName) return null;
  const norm = normalizeEntityName(inputName);

  // Check user resolutions first
  if (resolutions && resolutions[norm]) {
    const s = schools.find((s) => s.id === resolutions[norm]);
    return s ? { id: s.id, name: s.name } : null;
  }

  // Exact match
  const exact = schools.find((s) => normalizeEntityName(s.name) === norm);
  if (exact) return { id: exact.id, name: exact.name };

  // Contains: either direction
  const contains = schools.find((s) => {
    const sNorm = normalizeEntityName(s.name);
    return sNorm.includes(norm) || norm.includes(sNorm);
  });
  if (contains) return { id: contains.id, name: contains.name };

  // Prefix-stripped matching
  const strippedInput = stripSchoolPrefix(inputName);
  if (strippedInput.length >= 3) {
    const prefixMatch = schools.find((s) => {
      const strippedExisting = stripSchoolPrefix(s.name);
      return strippedExisting === strippedInput
        || strippedExisting.includes(strippedInput)
        || strippedInput.includes(strippedExisting);
    });
    if (prefixMatch) return { id: prefixMatch.id, name: prefixMatch.name };
  }

  // Starts-with match (first significant word)
  const firstWord = norm.split(/\s+/)[0];
  if (firstWord.length >= 3) {
    const startsWith = schools.find((s) => normalizeEntityName(s.name).startsWith(firstWord));
    if (startsWith) return { id: startsWith.id, name: startsWith.name };
  }

  return null;
}

/** Common area abbreviations / aliases */
const AREA_ALIASES: Record<string, string[]> = {
  "hillegersberg-schiebroek": ["his", "hillegersberg", "schiebroek"],
  "kralingen-crooswijk": ["kralingen", "crooswijk"],
  "prins alexander": ["prins alexander", "prinsalexander"],
  "ijsselmonde": ["ijsselmonde"],
  "hoek van holland": ["hvh", "hoek van holland"],
};

/**
 * Find an area match from a list using:
 * 1. exact match
 * 2. contains match
 * 3. alias match
 */
export function findAreaMatch(
  inputName: string,
  areas: EntityRef[],
): EntityRef | null {
  if (!inputName) return null;
  const norm = normalizeEntityName(inputName);
  if (!norm) return null;

  // Exact
  const exact = areas.find((a) => normalizeEntityName(a.name) === norm);
  if (exact) return exact;

  // Contains
  const contains = areas.find((a) => {
    const aNorm = normalizeEntityName(a.name);
    return aNorm.includes(norm) || norm.includes(aNorm);
  });
  if (contains) return contains;

  // Alias
  for (const area of areas) {
    const areaKey = normalizeEntityName(area.name);
    const aliases = AREA_ALIASES[areaKey];
    if (aliases && aliases.some(alias => norm === alias || norm.includes(alias) || alias.includes(norm))) {
      return area;
    }
  }

  return null;
}

/**
 * Find a referrer match using:
 * 1. exact match with same school
 * 2. exact match
 * 3. contains match
 */
export function findReferrerMatch(
  inputName: string,
  referrers: (EntityRef & { school_id?: string | null })[],
  schoolId?: string | null,
): EntityRef | null {
  if (!inputName) return null;
  const norm = normalizeEntityName(inputName);

  // Try match with same school first
  if (schoolId) {
    const sameSchool = referrers.find((r) => r.school_id === schoolId && normalizeEntityName(r.name) === norm);
    if (sameSchool) return { id: sameSchool.id, name: sameSchool.name };
  }

  const exact = referrers.find((r) => normalizeEntityName(r.name) === norm);
  if (exact) return { id: exact.id, name: exact.name };

  const contains = referrers.find((r) => {
    const rNorm = normalizeEntityName(r.name);
    return rNorm.includes(norm) || norm.includes(rNorm);
  });
  return contains ? { id: contains.id, name: contains.name } : null;
}

// ── Excel file reading ──────────────────────────────────────────────

import * as XLSX from "xlsx";

/** Parse a CSV string respecting quoted fields. Auto-detects ; or , delimiter. */
export function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const header = lines[0];
  const delimiter = header.split(";").length >= header.split(",").length ? ";" : ",";

  const splitRow = (row: string): string[] => {
    const result: string[] = [];
    let cur = "";
    let inQuote = false;
    for (const ch of row) {
      if (ch === '"') {
        inQuote = !inQuote;
      } else if (ch === delimiter && !inQuote) {
        result.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const headers = splitRow(lines[0]);
  return lines.slice(1).map((line) => {
    const vals = splitRow(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = vals[i] ?? "";
    });
    return obj;
  });
}

/** Read uploaded file as parsed rows (Excel or CSV). */
export async function readFileAsRows(file: File): Promise<Record<string, any>[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "csv") {
    let text: string;
    try {
      text = await file.text();
      if (/\ufffd/.test(text)) throw new Error("garbled");
    } catch {
      const buf = await file.arrayBuffer();
      const decoder = new TextDecoder("windows-1252");
      text = decoder.decode(buf);
    }
    return parseCsv(text);
  }
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { raw: true, defval: null });
}

/** Parse an Excel date value (serial number, various string formats) */
export function parseExcelDate(val: any, format: "mdy" | "dmy" = "dmy"): string | null {
  if (!val) return null;

  // Excel serial number
  if (typeof val === "number" && val > 1 && val < 100000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + val * 86400000);
    if (!isNaN(date.getTime())) return date.toISOString().split("T")[0];
  }

  const s = String(val).trim();

  // Excel serial as string
  if (/^\d{4,5}$/.test(s)) {
    const num = parseInt(s);
    if (num > 1 && num < 100000) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const date = new Date(excelEpoch.getTime() + num * 86400000);
      if (!isNaN(date.getTime())) return date.toISOString().split("T")[0];
    }
  }

  // X/X/XXXX (4-digit year)
  const full = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (full) {
    const [, p1, p2, yr] = full;
    if (format === "mdy") {
      return `${yr}-${p1.padStart(2, "0")}-${p2.padStart(2, "0")}`;
    } else {
      return `${yr}-${p2.padStart(2, "0")}-${p1.padStart(2, "0")}`;
    }
  }

  // X/X/XX (2-digit year)
  const short = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2})$/);
  if (short) {
    const [, p1, p2, yrShort] = short;
    const yr = parseInt(yrShort);
    const fullYear = yr + (yr < 50 ? 2000 : 1900);
    if (format === "mdy") {
      return `${fullYear}-${p1.padStart(2, "0")}-${p2.padStart(2, "0")}`;
    } else {
      return `${fullYear}-${p2.padStart(2, "0")}-${p1.padStart(2, "0")}`;
    }
  }

  // YYYY-MM-DD (ISO)
  const ymd = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;

  return null;
}
