import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

type ImportType = "trainer_beschikbaarheid" | "deelnemer_beschikbaarheid" | "sessies";

interface ParsedRow {
  [key: string]: any;
}

interface AvailabilityEntry {
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  notes?: string;
}

const IMPORT_TYPES: { value: ImportType; label: string; description: string; columns: string }[] = [
  {
    value: "trainer_beschikbaarheid",
    label: "Beschikbaarheid trainers",
    description: "Importeer beschikbaarheid van trainers",
    columns: "Naam + weekdagen (ma/di/wo…) OF Naam + datumkolommen OF Naam + Datum/Starttijd/Eindtijd",
  },
  {
    value: "deelnemer_beschikbaarheid",
    label: "Beschikbaarheid deelnemers",
    description: "Importeer beschikbaarheid van deelnemers",
    columns: "Naam + weekdagen (ma/di/wo…) OF Naam + datumkolommen OF Voornaam, Achternaam, Dag/Datum",
  },
  {
    value: "sessies",
    label: "Sessies / planning",
    description: "Importeer trainingssessies",
    columns: "Programma (naam), Sessienummer, Datum, Locatie, Notities",
  },
];

function normalizeKey(key: string): string {
  return key.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function findCol(row: ParsedRow, ...candidates: string[]): string | undefined {
  const keys = Object.keys(row);
  const norms = candidates.map(c => normalizeKey(c));

  // Priority 1: exact match
  for (const norm of norms) {
    const found = keys.find((k) => normalizeKey(k) === norm);
    if (found && row[found] !== undefined && row[found] !== "") return String(row[found]).trim();
  }
  // Priority 2: key contains candidate
  for (const norm of norms) {
    const found = keys.find((k) => normalizeKey(k).includes(norm));
    if (found && row[found] !== undefined && row[found] !== "") return String(row[found]).trim();
  }
  // Priority 3: candidate contains key
  for (const norm of norms) {
    const found = keys.find((k) => norm.includes(normalizeKey(k)) && normalizeKey(k).length >= 3);
    if (found && row[found] !== undefined && row[found] !== "") return String(row[found]).trim();
  }
  return undefined;
}

function parseExcelDate(val: any): string | null {
  if (!val) return null;

  // Excel serial number (as number)
  if (typeof val === "number" && val > 1 && val < 100000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + val * 86400000);
    if (!isNaN(date.getTime())) return date.toISOString().split("T")[0];
  }

  const s = String(val).trim();

  // Excel serial as string (e.g. "45678")
  if (/^\d{4,5}$/.test(s)) {
    const num = parseInt(s);
    if (num > 1 && num < 100000) {
      const excelEpoch = new Date(Date.UTC(1899, 11, 30));
      const date = new Date(excelEpoch.getTime() + num * 86400000);
      if (!isNaN(date.getTime())) return date.toISOString().split("T")[0];
    }
  }

  // DD-MM-YYYY or DD/MM/YYYY (Dutch primary format)
  const dmy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;

  // DD-MM-YY or DD/MM/YY (Dutch 2-digit year)
  const dmyy = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2})$/);
  if (dmyy) {
    const yr = parseInt(dmyy[3]);
    const fullYear = yr + (yr < 50 ? 2000 : 1900);
    return `${fullYear}-${dmyy[2].padStart(2, "0")}-${dmyy[1].padStart(2, "0")}`;
  }

  // YYYY-MM-DD (ISO)
  const ymd = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;

  return null;
}

function parseTime(val: any): string | null {
  if (!val) return null;
  if (typeof val === "number") {
    const totalMinutes = Math.round(val * 24 * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  const s = String(val).trim();
  const match = s.match(/^(\d{1,2})[:\.](\d{2})/);
  if (match) return `${match[1].padStart(2, "0")}:${match[2]}`;
  // Just an hour number like "14" or "9"
  const hourOnly = s.match(/^(\d{1,2})$/);
  if (hourOnly) {
    const h = parseInt(hourOnly[1]);
    if (h >= 0 && h <= 23) return `${String(h).padStart(2, "0")}:00`;
  }
  return null;
}

const DUTCH_MONTHS: Record<string, string> = {
  jan: "01", januari: "01", feb: "02", februari: "02", mrt: "03", maart: "03",
  apr: "04", april: "04", mei: "05", jun: "06", juni: "06", jul: "07", juli: "07",
  aug: "08", augustus: "08", sep: "09", september: "09", okt: "10", oktober: "10",
  nov: "11", november: "11", dec: "12", december: "12",
};

/** Try to parse a column header as a date (e.g. "12-3", "ma 12/3", "2025-03-12", "12-mrt", Excel serial) */
function parseDateFromHeader(header: string, referenceYear?: number): string | null {
  if (!header) return null;
  const h = String(header).trim();

  // If it's a JS Date object (XLSX sometimes returns these)
  if (typeof header === "object" && header !== null) {
    try {
      const d = new Date(header as any);
      if (!isNaN(d.getTime())) return d.toISOString().split("T")[0];
    } catch { /* ignore */ }
  }

  // Excel serial number in header (4 or 5 digits)
  if (/^\d{4,5}$/.test(h)) {
    const num = parseInt(h);
    if (num > 1 && num < 100000) {
      const d = XLSX.SSF.parse_date_code(num);
      if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
    }
  }

  // Full date
  const full = parseExcelDate(h);
  if (full) return full;

  // Strip day name prefix: "ma 12-3", "di 12/3", "woensdag 12-3"
  const stripped = h.replace(/^(ma|di|wo|do|vr|za|zo|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)\s*/i, "");

  const year = referenceYear || new Date().getFullYear();

  // d-m or d/m format (without year)
  const dm = stripped.match(/^(\d{1,2})[\/\-\.](\d{1,2})$/);
  if (dm) {
    return `${year}-${dm[2].padStart(2, "0")}-${dm[1].padStart(2, "0")}`;
  }

  // d-m-yy
  const dmyy = stripped.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2})$/);
  if (dmyy) {
    const yr = parseInt(dmyy[3]) + 2000;
    return `${yr}-${dmyy[2].padStart(2, "0")}-${dmyy[1].padStart(2, "0")}`;
  }

  // Dutch month formats: "12-mrt", "12 mrt", "1-apr-26", "mrt-26", "12 maart 2026"
  const lc = stripped.toLowerCase();

  // d-month or d month (e.g., "12-mrt", "12 maart", "1 apr")
  const dMonth = lc.match(/^(\d{1,2})[\/\-\.\s]+(jan|feb|mrt|maart|apr|april|mei|jun|juni|jul|juli|aug|augustus|sep|september|okt|oktober|nov|november|dec|december)(?:[\/\-\.\s]+(\d{2,4}))?$/);
  if (dMonth) {
    const day = dMonth[1].padStart(2, "0");
    const month = DUTCH_MONTHS[dMonth[2]];
    let y = year;
    if (dMonth[3]) {
      y = parseInt(dMonth[3]);
      if (y < 100) y += 2000;
    }
    if (month) return `${y}-${month}-${day}`;
  }

  // month-d format: "mrt-12", "apr 1"
  const monthD = lc.match(/^(jan|feb|mrt|maart|apr|april|mei|jun|juni|jul|juli|aug|augustus|sep|september|okt|oktober|nov|november|dec|december)[\/\-\.\s]+(\d{1,2})(?:[\/\-\.\s]+(\d{2,4}))?$/);
  if (monthD) {
    const month = DUTCH_MONTHS[monthD[1]];
    const day = monthD[2].padStart(2, "0");
    let y = year;
    if (monthD[3]) {
      y = parseInt(monthD[3]);
      if (y < 100) y += 2000;
    }
    if (month) return `${y}-${month}-${day}`;
  }

  // month-yy only: "mrt-26" → first of month (less common, skip)

  return null;
}

/** Check if a cell value represents availability: "x", "X", "✓", "ja", or a time */
function parseCellAvailability(val: any): { available: boolean; startTime: string; endTime: string } | null {
  if (val === undefined || val === null || val === "") return null;
  const s = String(val).trim().toLowerCase();
  if (!s) return null;

  // Cross / check mark = whole day
  if (["x", "✓", "✔", "ja", "yes", "v", "√"].includes(s)) {
    return { available: true, startTime: "09:00", endTime: "17:00" };
  }

  // Time value = start time (from that time, assume 4h block or until 17:00)
  const time = parseTime(val);
  if (time) {
    const [h] = time.split(":").map(Number);
    const endH = Math.min(h + 4, 17);
    return { available: true, startTime: time, endTime: `${String(endH).padStart(2, "0")}:00` };
  }

  // Time range "9:00-12:00" or "9-12"
  const range = s.match(/^(\d{1,2}[:\.]?\d{0,2})\s*[-–]\s*(\d{1,2}[:\.]?\d{0,2})$/);
  if (range) {
    const start = parseTime(range[1]);
    const end = parseTime(range[2]);
    if (start && end) return { available: true, startTime: start, endTime: end };
  }

  return null;
}

/** Name column candidates (normalized) */
const NAME_COL_ALIASES = ["naam", "name", "deelnemer", "kind", "leerling", "voornaam", "trainer", "medewerker", "participant", "achternaam", "fullname", "volledigenaam"];

/** Dutch weekday mapping to JS getDay() (0=Sunday) */
const DUTCH_WEEKDAYS: Record<string, number> = {
  maandag: 1, ma: 1, monday: 1, mon: 1,
  dinsdag: 2, di: 2, tuesday: 2, tue: 2,
  woensdag: 3, wo: 3, wednesday: 3, wed: 3,
  donderdag: 4, do: 4, thursday: 4, thu: 4,
  vrijdag: 5, vr: 5, friday: 5, fri: 5,
  zaterdag: 6, za: 6, saturday: 6, sat: 6,
  zondag: 0, zo: 0, sunday: 0, sun: 0,
};

/** Try to parse a column header as a weekday */
function parseWeekdayFromHeader(header: string): number | null {
  if (!header) return null;
  const h = String(header).trim().toLowerCase().replace(/[^a-z]/g, "");
  return DUTCH_WEEKDAYS[h] ?? null;
}

/** Generate all dates for a given weekday (0-6) in the next N months from today */
function expandWeekdayToDates(weekdayIndex: number, months: number): string[] {
  const dates: string[] = [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setMonth(end.getMonth() + months);

  const current = new Date(start);
  // Advance to the first occurrence of this weekday
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

/**
 * Detect if the sheet is in grid/matrix format:
 * First column = names, other columns = dates OR weekdays, cells = x or times
 */
function detectGridFormat(rows: ParsedRow[]): {
  isGrid: boolean;
  isWeekdayGrid: boolean;
  nameKey: string;
  dateColumns: { key: string; date: string }[];
  weekdayColumns: { key: string; weekday: number; label: string }[];
} {
  if (rows.length === 0) return { isGrid: false, isWeekdayGrid: false, nameKey: "", dateColumns: [], weekdayColumns: [] };
  const keys = Object.keys(rows[0]);
  if (keys.length < 2) return { isGrid: false, isWeekdayGrid: false, nameKey: "", dateColumns: [], weekdayColumns: [] };

  // Find the name column - try alias match first, then fall back to first column
  let nameKey = "";
  for (const k of keys) {
    const norm = normalizeKey(k);
    if (NAME_COL_ALIASES.some(alias => norm.includes(alias) || alias.includes(norm))) {
      nameKey = k;
      break;
    }
  }
  // If no alias matched, use the first column that has string-like (non-numeric, non-date) values
  if (!nameKey) {
    for (const k of keys) {
      const sample = rows.slice(0, 5).map(r => String(r[k] ?? "").trim()).filter(Boolean);
      const looksLikeName = sample.length > 0 && sample.every(v => {
        // Not a number, not a date, not empty
        return isNaN(Number(v)) && !parseExcelDate(v) && parseWeekdayFromHeader(v) === null;
      });
      if (looksLikeName) { nameKey = k; break; }
    }
  }
  if (!nameKey) nameKey = keys[0];

  // Check remaining columns for date-like or weekday-like headers
  const dateColumns: { key: string; date: string }[] = [];
  const weekdayColumns: { key: string; weekday: number; label: string }[] = [];
  for (const k of keys) {
    if (k === nameKey) continue;
    const date = parseDateFromHeader(k);
    if (date) { dateColumns.push({ key: k, date }); continue; }
    const wd = parseWeekdayFromHeader(k);
    if (wd !== null) { weekdayColumns.push({ key: k, weekday: wd, label: k }); }
  }

  // Weekday grid takes priority if we found weekday columns
  if (weekdayColumns.length >= 1) {
    return { isGrid: true, isWeekdayGrid: true, nameKey, dateColumns: [], weekdayColumns };
  }
  // Date grid
  if (dateColumns.length >= 2) {
    return { isGrid: true, isWeekdayGrid: false, nameKey, dateColumns, weekdayColumns: [] };
  }
  return { isGrid: false, isWeekdayGrid: false, nameKey, dateColumns: [], weekdayColumns: [] };
}

/** Convert grid format (date columns) to flat availability entries */
function gridToEntries(rows: ParsedRow[], nameKey: string, dateColumns: { key: string; date: string }[]): AvailabilityEntry[] {
  const entries: AvailabilityEntry[] = [];
  for (const row of rows) {
    const name = String(row[nameKey] ?? "").trim();
    if (!name) continue;
    for (const dc of dateColumns) {
      const cell = row[dc.key];
      const parsed = parseCellAvailability(cell);
      if (parsed?.available) {
        entries.push({ name, date: dc.date, startTime: parsed.startTime, endTime: parsed.endTime });
      }
    }
  }
  return entries;
}

/** Convert weekday grid format to flat availability entries (expanded to next N months) */
function weekdayGridToEntries(
  rows: ParsedRow[],
  nameKey: string,
  weekdayColumns: { key: string; weekday: number; label: string }[],
  months: number = 3
): AvailabilityEntry[] {
  const entries: AvailabilityEntry[] = [];
  // Pre-compute all dates per weekday
  const datesByWeekday = new Map<number, string[]>();
  for (const wc of weekdayColumns) {
    if (!datesByWeekday.has(wc.weekday)) {
      datesByWeekday.set(wc.weekday, expandWeekdayToDates(wc.weekday, months));
    }
  }

  for (const row of rows) {
    const name = String(row[nameKey] ?? "").trim();
    if (!name) continue;
    for (const wc of weekdayColumns) {
      const cell = row[wc.key];
      const parsed = parseCellAvailability(cell);
      if (parsed?.available) {
        const dates = datesByWeekday.get(wc.weekday) ?? [];
        for (const date of dates) {
          entries.push({ name, date, startTime: parsed.startTime, endTime: parsed.endTime });
        }
      }
    }
  }
  return entries;
}

/** Convert standard row format to flat availability entries (supports weekday column too) */
function rowsToEntries(rows: ParsedRow[], isTrainer: boolean): AvailabilityEntry[] {
  const entries: AvailabilityEntry[] = [];
  for (const row of rows) {
    let name: string | undefined;
    if (isTrainer) {
      name = findCol(row, "naam", "name", "trainer", "medewerker");
    } else {
      const firstName = findCol(row, "voornaam", "firstname", "first_name");
      const lastName = findCol(row, "achternaam", "lastname", "last_name", "familienaam");
      const combinedName = findCol(row, "naam", "name", "deelnemer", "kind", "leerling", "participant");
      if (firstName && lastName) {
        name = `${firstName} ${lastName}`;
      } else if (firstName) {
        name = firstName;
      } else if (combinedName) {
        name = combinedName;
      }
    }

    // Try hard date first
    const dateRaw = findCol(row, "datum", "date", "startdatum", "beschikbaar_datum", "beschikbare_datum")
      ?? findCol(row, "beschikbaar", "available", "available_date");
    const date = parseExcelDate(dateRaw);

    if (name && date) {
      const start = parseTime(findCol(row, "starttijd", "van", "start", "starttime", "start_time", "begintijd", "begin") ?? row["Starttijd"]);
      const end = parseTime(findCol(row, "eindtijd", "tot", "end", "eindtime", "end_time", "eind", "stoptijd") ?? row["Eindtijd"]);
      entries.push({ name, date, startTime: start ?? "09:00", endTime: end ?? "17:00" });
      continue;
    }

    // Try weekday column (e.g., "dag" = "maandag")
    if (name) {
      const dagRaw = findCol(row, "dag", "weekdag", "day", "weekday");
      if (dagRaw) {
        const wdIndex = parseWeekdayFromHeader(dagRaw);
        if (wdIndex !== null) {
          const start = parseTime(findCol(row, "starttijd", "van", "start", "starttime", "start_time", "begintijd", "begin") ?? row["Starttijd"]);
          const end = parseTime(findCol(row, "eindtijd", "tot", "end", "eindtime", "end_time", "eind", "stoptijd") ?? row["Eindtijd"]);
          const dates = expandWeekdayToDates(wdIndex, 3);
          for (const d of dates) {
            entries.push({ name, date: d, startTime: start ?? "09:00", endTime: end ?? "17:00" });
          }
        }
      }
    }
  }
  return entries;
}

interface PlanningImportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function PlanningImport({ open, onOpenChange }: PlanningImportProps) {
  const [importType, setImportType] = useState<ImportType>("trainer_beschikbaarheid");
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [parsedEntries, setParsedEntries] = useState<AvailabilityEntry[]>([]);
  const [detectedFormat, setDetectedFormat] = useState<string>("");
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: number; errors: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const reset = () => {
    setParsedData([]);
    setParsedEntries([]);
    setDetectedFormat("");
    setFileName("");
    setResult(null);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setResult(null);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array", cellDates: false });
      const ws = wb.Sheets[wb.SheetNames[0]];

      // Try default parsing
      let json: ParsedRow[] = XLSX.utils.sheet_to_json(ws, { defval: "" });

      // If first row appears empty or has no useful data, try with header on row 2
      if (json.length > 0) {
        const firstRowValues = Object.values(json[0]).filter((v) => v !== "" && v !== undefined && v !== null);
        const keys = Object.keys(json[0]);
        // If all keys look like generic "EMPTY" or "__EMPTY_1" etc., or first row has no values
        const hasGenericKeys = keys.every((k) => /^(__EMPTY|__EMPTY_\d+|Column\d+)$/i.test(k) || /^\d+$/.test(k));
        if (firstRowValues.length === 0 || hasGenericKeys) {
          // Re-parse with range starting from row 2
          const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
          range.s.r = 1; // Skip first row
          json = XLSX.utils.sheet_to_json(ws, { defval: "", range });

          // If still generic, try row 3
          if (json.length > 0) {
            const keys2 = Object.keys(json[0]);
            const stillGeneric = keys2.every((k) => /^(__EMPTY|__EMPTY_\d+|Column\d+)$/i.test(k) || /^\d+$/.test(k));
            if (stillGeneric) {
              range.s.r = 2;
              json = XLSX.utils.sheet_to_json(ws, { defval: "", range });
            }
          }
        }
      }

      // Filter out completely empty rows
      json = json.filter((row) => {
        const vals = Object.values(row).filter((v) => v !== "" && v !== undefined && v !== null);
        return vals.length > 0;
      });

      setParsedData(json);

      // For availability types, detect format and pre-process
      if (importType !== "sessies" && json.length > 0) {
        const grid = detectGridFormat(json);
        if (grid.isGrid && grid.isWeekdayGrid) {
          const entries = weekdayGridToEntries(json, grid.nameKey, grid.weekdayColumns, 3);
          const weekdayNames = grid.weekdayColumns.map(wc => wc.label).join(", ");
          setParsedEntries(entries);
          setDetectedFormat(`Weekdag-formaat: ${grid.weekdayColumns.length} dagen (${weekdayNames}) → ${entries.length} beschikbaarheden (komende 3 maanden)`);
        } else if (grid.isGrid) {
          const entries = gridToEntries(json, grid.nameKey, grid.dateColumns);
          setParsedEntries(entries);
          setDetectedFormat(`Grid-formaat: ${grid.dateColumns.length} dagkolommen, ${entries.length} beschikbaarheden`);
        } else {
          const isTrainer = importType === "trainer_beschikbaarheid";
          const entries = rowsToEntries(json, isTrainer);
          setParsedEntries(entries);
          if (entries.length > 0 && entries.length > json.length) {
            setDetectedFormat(`Weekdag-rij-formaat: ${entries.length} beschikbaarheden (komende 3 maanden)`);
          } else {
            setDetectedFormat(`Rij-formaat: ${entries.length} beschikbaarheden gevonden`);
          }
        }
      } else {
        setParsedEntries([]);
        setDetectedFormat("");
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const doImport = async () => {
    setImporting(true);
    const errors: string[] = [];
    let success = 0;

    try {
      if (importType === "trainer_beschikbaarheid") {
        const { data: trainers } = await supabase.from("staff").select("id, name, trade_name").eq("archived", false);
        const trainerMap = new Map<string, string>();
        trainers?.forEach((t) => {
          if (t.name) trainerMap.set(t.name.toLowerCase().trim(), t.id);
          if (t.trade_name) trainerMap.set(t.trade_name.toLowerCase().trim(), t.id);
        });

        // Fuzzy match helper
        const findTrainer = (name: string): string | undefined => {
          const lower = name.toLowerCase().trim();
          if (trainerMap.has(lower)) return trainerMap.get(lower);
          // Partial match
          for (const [key, id] of trainerMap) {
            if (key.includes(lower) || lower.includes(key)) return id;
          }
          // Last name match
          const parts = lower.split(/\s+/);
          const lastName = parts[parts.length - 1];
          for (const [key, id] of trainerMap) {
            if (key.split(/\s+/).pop() === lastName) return id;
          }
          return undefined;
        };

        for (const entry of parsedEntries) {
          const staffId = findTrainer(entry.name);
          if (!staffId) { errors.push(`Trainer "${entry.name}" niet gevonden`); continue; }

          const { error } = await supabase.from("staff_availability").upsert({
            staff_id: staffId,
            available_date: entry.date,
            start_time: entry.startTime,
            end_time: entry.endTime,
          } as any, { onConflict: "staff_id,available_date" });
          if (error) { errors.push(`${entry.name} ${entry.date}: ${error.message}`); continue; }
          success++;
        }
      } else if (importType === "deelnemer_beschikbaarheid") {
        const { data: clients } = await supabase.from("clients").select("id, first_name, last_name").eq("archived", false);
        const clientMap = new Map<string, string>();
        const clientFirstNames = new Map<string, { id: string; count: number }>();
        clients?.forEach((c) => {
          const fullName = `${c.first_name} ${c.last_name}`.toLowerCase().trim();
          clientMap.set(fullName, c.id);
          if (c.last_name) clientMap.set(c.last_name.toLowerCase().trim(), c.id);
          // Track first names (only use if unique)
          const fn = c.first_name.toLowerCase().trim();
          const existing = clientFirstNames.get(fn);
          if (existing) {
            existing.count++;
          } else {
            clientFirstNames.set(fn, { id: c.id, count: 1 });
          }
        });

        const normalizeName = (n: string) => n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

        const findClient = (name: string): string | undefined => {
          const norm = normalizeName(name);
          if (!norm) return undefined;

          // Exact full name
          for (const [key, id] of clientMap) {
            if (normalizeName(key) === norm) return id;
          }
          // Contains match (either direction)
          for (const [key, id] of clientMap) {
            const nk = normalizeName(key);
            if (nk.includes(norm) || norm.includes(nk)) return id;
          }
          // First name only match (if unique)
          const firstNameMatch = clientFirstNames.get(norm);
          if (firstNameMatch && firstNameMatch.count === 1) return firstNameMatch.id;
          // Try first word of input as first name
          const parts = norm.split(" ");
          if (parts.length > 0) {
            const fwMatch = clientFirstNames.get(parts[0]);
            if (fwMatch && fwMatch.count === 1) return fwMatch.id;
          }
          // Last name match
          const lastName = parts[parts.length - 1];
          for (const [key, id] of clientMap) {
            const keyParts = normalizeName(key).split(" ");
            if (keyParts[keyParts.length - 1] === lastName) return id;
          }
          return undefined;
        };

        for (const entry of parsedEntries) {
          const clientId = findClient(entry.name);
          if (!clientId) { errors.push(`Deelnemer "${entry.name}" niet gevonden`); continue; }

          const { error } = await supabase.from("client_availability").upsert({
            client_id: clientId,
            available_date: entry.date,
            start_time: entry.startTime,
            end_time: entry.endTime,
          } as any, { onConflict: "client_id,available_date" });
          if (error) { errors.push(`${entry.name} ${entry.date}: ${error.message}`); continue; }
          success++;
        }
      } else if (importType === "sessies") {
        const { data: programs } = await supabase.from("programs").select("id, name").eq("archived", false);
        const progMap = new Map<string, string>();
        programs?.forEach((p) => {
          progMap.set(p.name.toLowerCase().trim(), p.id);
        });

        for (let i = 0; i < parsedData.length; i++) {
          const row = parsedData[i];
          const progName = findCol(row, "programma", "program", "training", "naam");
          const sessNum = parseInt(findCol(row, "sessienummer", "sessie", "session", "nummer", "nr") ?? "0");
          const date = parseExcelDate(findCol(row, "datum", "date", "dag") ?? row["Datum"]);
          const location = findCol(row, "locatie", "location", "plaats");
          const notes = findCol(row, "notities", "notes", "opmerkingen");

          if (!progName) { errors.push(`Rij ${i + 2}: geen programma gevonden`); continue; }
          if (!sessNum) { errors.push(`Rij ${i + 2}: geen sessienummer`); continue; }

          const programId = progMap.get(progName.toLowerCase());
          if (!programId) { errors.push(`Rij ${i + 2}: programma "${progName}" niet gevonden`); continue; }

          const { error } = await supabase.from("program_sessions").insert({
            program_id: programId,
            session_number: sessNum,
            session_date: date,
            location: location ?? null,
            notes: notes ?? null,
          });
          if (error) { errors.push(`Rij ${i + 2}: ${error.message}`); continue; }
          success++;
        }
      }
    } catch (err: any) {
      errors.push(`Onverwachte fout: ${err.message}`);
    }

    setResult({ success, errors });
    setImporting(false);
    if (success > 0) {
      queryClient.invalidateQueries();
      toast({ title: `${success} rij(en) geïmporteerd`, description: errors.length > 0 ? `${errors.length} fout(en)` : undefined });
    }
  };

  const typeInfo = IMPORT_TYPES.find((t) => t.value === importType)!;
  const importCount = importType === "sessies" ? parsedData.length : parsedEntries.length;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" /> Excel importeren
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Wat wil je importeren?</Label>
            <Select value={importType} onValueChange={(v) => { setImportType(v as ImportType); reset(); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="bg-popover">
                {IMPORT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm space-y-1">
            <p className="font-medium text-foreground">{typeInfo.description}</p>
            <p className="text-muted-foreground text-xs">{typeInfo.columns}</p>
            <p className="text-xs text-muted-foreground">Weekdagen (ma/di/wo…) → uitgebreid naar komende 3 maanden</p>
            <p className="text-xs text-muted-foreground">Kruisje (x) = hele dag • Tijd = vanaf-tijd • Lege cel = niet beschikbaar</p>
          </div>

          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
          <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" />
            {fileName || "Kies Excel- of CSV-bestand"}
          </Button>

          {parsedData.length > 0 && !result && (
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-foreground font-medium">{parsedData.length} rij(en) ingelezen</p>
                  {detectedFormat && <Badge variant="secondary" className="text-[10px]">{detectedFormat}</Badge>}
                </div>
                {importCount > 0 && importType !== "sessies" && (
                  <p className="text-xs text-muted-foreground">→ {importCount} beschikbaarheden herkend</p>
                )}
              </div>

              {/* Preview for availability entries */}
              {importType !== "sessies" && parsedEntries.length > 0 && (
                <div className="max-h-48 overflow-auto rounded border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="px-2 py-1 text-left font-semibold text-muted-foreground">Naam</th>
                        <th className="px-2 py-1 text-left font-semibold text-muted-foreground">Datum</th>
                        <th className="px-2 py-1 text-left font-semibold text-muted-foreground">Van</th>
                        <th className="px-2 py-1 text-left font-semibold text-muted-foreground">Tot</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {parsedEntries.slice(0, 15).map((entry, i) => (
                        <tr key={i}>
                          <td className="px-2 py-1 whitespace-nowrap text-foreground">{entry.name}</td>
                          <td className="px-2 py-1 whitespace-nowrap text-foreground">{entry.date}</td>
                          <td className="px-2 py-1 text-foreground">{entry.startTime}</td>
                          <td className="px-2 py-1 text-foreground">{entry.endTime}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parsedEntries.length > 15 && (
                    <p className="text-xs text-muted-foreground text-center py-1">... en {parsedEntries.length - 15} meer</p>
                  )}
                </div>
              )}

              {/* Debug: show raw data when 0 entries detected */}
              {importType !== "sessies" && parsedEntries.length === 0 && parsedData.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-destructive font-medium">Geen beschikbaarheden herkend. Gevonden kolommen:</p>
                  <div className="flex flex-wrap gap-1">
                    {Object.keys(parsedData[0]).map((k) => (
                      <Badge key={k} variant="outline" className="text-[10px]">{k}</Badge>
                    ))}
                  </div>
                  <div className="max-h-48 overflow-auto rounded border border-border">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          {Object.keys(parsedData[0]).map((k) => (
                            <th key={k} className="px-2 py-1 text-left font-semibold text-muted-foreground whitespace-nowrap">{k}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {parsedData.slice(0, 5).map((row, i) => (
                          <tr key={i}>
                            {Object.keys(parsedData[0]).map((k) => (
                              <td key={k} className="px-2 py-1 whitespace-nowrap text-foreground">{String(row[k] ?? "")}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="text-xs text-muted-foreground">Verwacht: kolom met naam + datumkolommen (grid) óf kolommen Naam/Datum/Starttijd (rij-formaat)</p>
                </div>
              )}

              {/* Preview for sessies (raw rows) */}
              {importType === "sessies" && (
                <div className="max-h-48 overflow-auto rounded border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        {Object.keys(parsedData[0]).map((k) => (
                          <th key={k} className="px-2 py-1 text-left font-semibold text-muted-foreground whitespace-nowrap">{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {parsedData.slice(0, 10).map((row, i) => (
                        <tr key={i}>
                          {Object.keys(parsedData[0]).map((k) => (
                            <td key={k} className="px-2 py-1 whitespace-nowrap text-foreground">{String(row[k] ?? "")}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {parsedData.length > 10 && (
                    <p className="text-xs text-muted-foreground text-center py-1">... en {parsedData.length - 10} meer</p>
                  )}
                </div>
              )}

              <Button className="w-full" onClick={doImport} disabled={importing || importCount === 0}>
                {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                {importing ? "Importeren..." : `Importeer ${importCount} ${importType === "sessies" ? "sessie(s)" : "beschikbaar(heden)"}`}
              </Button>
            </div>
          )}

          {result && (
            <div className="space-y-2">
              {result.success > 0 && (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-sm text-emerald-800">
                  <CheckCircle2 className="h-4 w-4" /> {result.success} rij(en) succesvol geïmporteerd
                </div>
              )}
              {result.errors.length > 0 && (
                <div className="rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2 space-y-1">
                  <p className="text-sm font-medium text-destructive flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" /> {result.errors.length} fout(en)
                  </p>
                  <ul className="text-xs text-destructive/80 max-h-32 overflow-y-auto space-y-0.5">
                    {result.errors.map((err, i) => <li key={i}>• {err}</li>)}
                  </ul>
                </div>
              )}
              <Button variant="outline" className="w-full" onClick={reset}>Nog een bestand importeren</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
