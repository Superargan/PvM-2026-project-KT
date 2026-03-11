import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ParsedRow {
  [key: string]: any;
}

function normalizeKey(key: string): string {
  return key
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function findCol(row: ParsedRow, ...candidates: string[]): string | undefined {
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

  // Priority 3: contains match
  for (const c of normalizedCandidates) {
    if (c.length < 3) continue; // avoid too short matches
    const found = keys.find((k) => normalizeKey(k).includes(c));
    if (found && row[found] !== undefined && row[found] !== "") return String(row[found]).trim();
  }

  return undefined;
}

/**
 * Detect whether dates in the dataset are in MM/DD (US) or DD/MM (EU) format.
 * Scans all string-like date values: if any first-part > 12, it must be DD/MM;
 * if any second-part > 12, it must be MM/DD. Default: DD/MM (Dutch).
 */
function detectDateFormat(rows: ParsedRow[]): "mdy" | "dmy" {
  const dateColCandidates = ["Datum inschrijving", "Inschrijfdatum", "datum inschrijving",
    "Datum Intake", "Intake datum", "datum intake", "intake_date",
    "Geboortedatum", "geboortedatum", "date_of_birth", "Geboorte datum"];

  for (const row of rows) {
    for (const key of Object.keys(row)) {
      const nk = normalizeKey(key);
      const isDateCol = dateColCandidates.some(c => normalizeKey(c) === nk || nk.includes(normalizeKey(c)));
      if (!isDateCol) continue;
      const s = String(row[key]).trim();
      const m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
      if (!m) continue;
      const p1 = parseInt(m[1]);
      const p2 = parseInt(m[2]);
      // If first part > 12, it can't be a month → must be day-first (DD/MM)
      if (p1 > 12) return "dmy";
      // If second part > 12, it can't be a month → must be month-first (MM/DD)
      if (p2 > 12) return "mdy";
    }
  }
  return "dmy"; // Default Dutch
}

function parseExcelDate(val: any, format: "mdy" | "dmy" = "dmy"): string | null {
  if (!val) return null;

  // Excel serial number (as number)
  if (typeof val === "number" && val > 1 && val < 100000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + val * 86400000);
    if (!isNaN(date.getTime())) {
      return date.toISOString().split("T")[0];
    }
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

function splitName(fullName: string): { first_name: string; last_name: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { first_name: parts[0], last_name: "" };
  const first_name = parts[0];
  const last_name = parts.slice(1).join(" ");
  return { first_name, last_name };
}

function mapGender(val: string | undefined): string | null {
  if (!val) return null;
  const lower = val.toLowerCase().trim();
  if (["jongen", "j", "m", "man", "male", "boy"].includes(lower)) return "Jongen";
  if (["meisje", "meid", "v", "vrouw", "female", "girl"].includes(lower)) return "Meisje";
  if (["anders", "x", "overig", "other"].includes(lower)) return "Anders";
  return val;
}

/** Known non-person referral sources — stored as referral_reason, not as referrer_id */
const NON_PERSON_REFERRAL_SOURCES = [
  "flyer", "folder", "internet", "website", "social media", "facebook", "instagram",
  "whatsapp", "mond-tot-mond", "mond tot mond", "via via", "buurthuis", "wijkteam",
  "huisarts", "ggd", "school", "leerkracht", "juf", "meester", "intern",
  "poster", "krant", "buurtwerk", "wijkcentrum", "speeltuin", "ouder",
  "buren", "kennissen", "familie", "vrienden", "tv", "radio", "kerk", "moskee",
  "sportvereniging", "club", "bibliotheek", "consultatiebureau", "jeugdzorg",
  "zelfstandig", "eigen initiatief", "onbekend", "anders", "overig",
];

type ImportMode = "default" | "waitlist" | "intake_afgerond";

interface ClientImportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
  /** Fixed mode, or "choose" to let user pick between waitlist / intake_afgerond */
  mode?: ImportMode | "choose";
}

const MODE_OPTIONS: { value: ImportMode; label: string; description: string }[] = [
  { value: "waitlist", label: "Wachtlijst", description: "Deelnemers worden op de wachtlijst geplaatst (status: wachtlijst)" },
  { value: "intake_afgerond", label: "Afgeronde intakes", description: "Deelnemers met afgeronde intake (status: intake_afgerond)" },
  { value: "default", label: "Nieuwe aanmeldingen", description: "Nieuwe deelnemers (status wordt automatisch bepaald)" },
];

export default function ClientImport({ open, onOpenChange, onComplete, mode: modeProp = "default" }: ClientImportProps) {
  const [selectedMode, setSelectedMode] = useState<ImportMode>(modeProp === "choose" ? "waitlist" : modeProp);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ added: number; skipped: number; updated: number; errors: string[] } | null>(null);
  const [unmatchedSchools, setUnmatchedSchools] = useState<string[]>([]);
  const [schoolResolutions, setSchoolResolutions] = useState<Record<string, string>>({});
  const [showResolution, setShowResolution] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: schools = [] } = useQuery({
    queryKey: ["schools-import"],
    queryFn: async () => {
      const { data } = await supabase.from("schools").select("id, name, neighborhood_id, neighborhoods(area_id)").order("name");
      return data ?? [];
    },
    enabled: open,
  });

  const { data: areas = [] } = useQuery({
    queryKey: ["areas-import"],
    queryFn: async () => {
      const { data } = await supabase.from("areas").select("id, name").order("name");
      return data ?? [];
    },
    enabled: open,
  });

  const { data: referrers = [] } = useQuery({
    queryKey: ["referrers-import"],
    queryFn: async () => {
      const { data } = await supabase.from("referrers").select("id, name, school_id").order("name");
      return data ?? [];
    },
    enabled: open,
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = ev.target?.result;
      const wb = XLSX.read(data, { type: "binary", cellDates: false });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const json: ParsedRow[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      setRows(json);
    };
    reader.readAsBinaryString(file);
  };

  /** Fuzzy school name matching: exact → contains → best partial → user resolutions */
  const findSchoolId = (name: string | undefined, resolutions?: Record<string, string>): string | null => {
    if (!name) return null;
    const norm = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

    // Check user resolutions first
    if (resolutions && resolutions[norm]) return resolutions[norm];

    // Exact match
    const exact = schools.find((s) => s.name.toLowerCase().trim() === norm);
    if (exact) return exact.id;

    // Contains: school name contains search or search contains school name
    const contains = schools.find((s) => {
      const sNorm = s.name.toLowerCase().trim();
      return sNorm.includes(norm) || norm.includes(sNorm);
    });
    if (contains) return contains.id;

    // Starts-with match (first significant word)
    const firstWord = norm.split(/\s+/)[0];
    if (firstWord.length >= 3) {
      const startsWith = schools.find((s) => s.name.toLowerCase().trim().startsWith(firstWord));
      if (startsWith) return startsWith.id;
    }

    return null;
  };

  /** Scan rows for school names that don't match any known school */
  const detectUnmatchedSchools = () => {
    const unmatched = new Set<string>();
    for (const row of rows) {
      const schoolName = findCol(row, "School", "school", "Schoolnaam");
      if (schoolName) {
        const id = findSchoolId(schoolName);
        if (!id) {
          const norm = schoolName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
          unmatched.add(norm);
        }
      }
    }
    return Array.from(unmatched);
  };

  /** Called when file is parsed — check for unmatched schools before allowing import */
  const checkSchoolsBeforeImport = () => {
    const unmatched = detectUnmatchedSchools();
    if (unmatched.length > 0) {
      setUnmatchedSchools(unmatched);
      setShowResolution(true);
    } else {
      setShowResolution(false);
      setUnmatchedSchools([]);
    }
  };

  /** Common area abbreviations / aliases */
  const AREA_ALIASES: Record<string, string[]> = {
    "hillegersberg-schiebroek": ["his", "hillegersberg", "schiebroek"],
    "kralingen-crooswijk": ["kralingen", "crooswijk"],
    "prins alexander": ["prins alexander", "prinsalexander"],
    "ijsselmonde": ["ijsselmonde"],
    "hoek van holland": ["hvh", "hoek van holland"],
  };

  const findAreaId = (name: string | undefined): string | null => {
    if (!name) return null;
    const norm = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    if (!norm) return null;
    
    // Exact match
    const exact = areas.find((a) => a.name.toLowerCase().trim() === norm);
    if (exact) return exact.id;
    
    // Contains match
    const contains = areas.find((a) => {
      const aNorm = a.name.toLowerCase().trim();
      return aNorm.includes(norm) || norm.includes(aNorm);
    });
    if (contains) return contains.id;
    
    // Alias match
    for (const area of areas) {
      const areaKey = area.name.toLowerCase().trim();
      const aliases = AREA_ALIASES[areaKey];
      if (aliases && aliases.some(alias => norm === alias || norm.includes(alias) || alias.includes(norm))) {
        return area.id;
      }
    }
    
    return null;
  };

  const findReferrerId = (name: string | undefined, schoolId: string | null): string | null => {
    if (!name) return null;
    const norm = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    // Try match with same school first
    if (schoolId) {
      const sameSchool = referrers.find((r) => r.school_id === schoolId && r.name.toLowerCase().trim() === norm);
      if (sameSchool) return sameSchool.id;
    }
    const exact = referrers.find((r) => r.name.toLowerCase().trim() === norm);
    if (exact) return exact.id;
    const contains = referrers.find((r) => {
      const rNorm = r.name.toLowerCase().trim();
      return rNorm.includes(norm) || norm.includes(rNorm);
    });
    return contains?.id ?? null;
  };

  const handleImport = async () => {
    setImporting(true);
    const errors: string[] = [];
    let added = 0;
    let skipped = 0;
    let updated = 0;

    // Fetch existing clients to deduplicate
    const { data: existingClients } = await supabase
      .from("clients")
      .select("id, first_name, last_name, date_of_birth, school_id, gender, class_group, guardian_phone, postal_code");

    // Build lookup maps: name-only key and name+dob key
    const existingByName = new Map<string, any>();
    const existingByNameDob = new Map<string, any>();
    for (const c of existingClients ?? []) {
      const nameKey = `${c.first_name?.toLowerCase().trim()}|${c.last_name?.toLowerCase().trim()}`;
      existingByName.set(nameKey, c);
      if (c.date_of_birth) {
        existingByNameDob.set(`${nameKey}|${c.date_of_birth}`, c);
      }
    }

    // Track keys within this import batch to avoid intra-batch duplicates
    const batchKeys = new Set<string>();

    // Auto-detect date format from the dataset
    const dateFormat = detectDateFormat(rows);
    console.log(`Import: detected date format = ${dateFormat}`);

    const inserts: any[] = [];
    const updates: { id: string; data: any; reserves?: { area_id: string; order: number }[] }[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // Excel row (header = 1)

      // Parse name
      const naamKind = findCol(row, "Naam kind", "Naam", "naam kind", "Kind", "Deelnemer", "Voornaam Achternaam");
      const voornaam = findCol(row, "Voornaam", "voornaam", "first_name");
      const achternaam = findCol(row, "Achternaam", "achternaam", "last_name");

      let first_name = "";
      let last_name = "";

      if (voornaam) {
        first_name = voornaam;
        last_name = achternaam ?? "";
      } else if (naamKind) {
        const split = splitName(naamKind);
        first_name = split.first_name;
        last_name = split.last_name;
      }

      if (!first_name) {
        skipped++;
        continue;
      }

      // Date of birth
      const dobRaw = findCol(row, "Geboortedatum", "geboortedatum", "date_of_birth", "Geboorte datum");
      let date_of_birth: string | null = parseExcelDate(dobRaw, dateFormat);
      let dobEstimated = false;

      // Read age from dedicated "Leeftijd" column (NOT "Leeftijdsgroep")
      const ageKeys = Object.keys(row);
      const ageColKey = ageKeys.find(k => {
        const nk = normalizeKey(k);
        return (nk === "leeftijd" || nk === "age") && !nk.includes("groep");
      });
      const ageStr = ageColKey ? String(row[ageColKey]).trim() : undefined;
      const parsedAge = ageStr ? parseInt(ageStr, 10) : NaN;

      if (date_of_birth && !isNaN(parsedAge) && parsedAge > 0 && parsedAge < 100) {
        // Cross-check: verify age matches DOB
        const birth = new Date(date_of_birth);
        const today = new Date();
        let calcAge = today.getFullYear() - birth.getFullYear();
        if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) calcAge--;
        if (Math.abs(calcAge - parsedAge) > 1) {
          // Age and DOB don't match — trust DOB but log discrepancy
          console.warn(`Import: leeftijd (${parsedAge}) komt niet overeen met geboortedatum (${date_of_birth}, berekend ${calcAge}) voor ${first_name} ${last_name}`);
        }
      } else if (!date_of_birth && !isNaN(parsedAge) && parsedAge > 0 && parsedAge < 100) {
        // No DOB, estimate from age
        const now = new Date();
        date_of_birth = `${now.getFullYear() - parsedAge}-06-15`;
        dobEstimated = true;
      }

      // Deduplicate: check name+dob first, then name-only
      const nameKey = `${first_name.toLowerCase().trim()}|${last_name.toLowerCase().trim()}`;
      const nameDobKey = date_of_birth ? `${nameKey}|${date_of_birth}` : null;

      // Check intra-batch duplicates
      const batchKey = nameDobKey ?? nameKey;
      if (batchKeys.has(batchKey)) {
        skipped++;
        continue;
      }
      batchKeys.add(batchKey);

      // School
      const schoolName = findCol(row, "School", "school", "Schoolnaam");
      const school_id = findSchoolId(schoolName, schoolResolutions);

      // Area
      const areaName = findCol(row, "Gebied", "gebied", "Area", "Primair gebied");
      let waitlist_area_id = findAreaId(areaName);
      
      // Auto-derive area from school if not explicitly provided
      if (!waitlist_area_id && school_id) {
        const school = allSchools.find((s: any) => s.id === school_id);
        const derivedAreaId = (school as any)?.neighborhoods?.area_id;
        if (derivedAreaId) waitlist_area_id = derivedAreaId;
      }

      // Reserve areas — look for columns like "Reserve gebied 1", "Reservegebied", etc.
      const reserveAreaIds: { area_id: string; order: number }[] = [];
      
      // First try numbered columns (Reserve gebied 1, 2, 3)
      let foundNumberedReserve = false;
      for (let ri = 1; ri <= 3; ri++) {
        const reserveName = findCol(
          row,
          `Reserve gebied ${ri}`, `Reservegebied ${ri}`, `Reserve ${ri}`,
          `reserve gebied ${ri}`, `reservegebied ${ri}`, `reserve ${ri}`,
        );
        if (reserveName) {
          foundNumberedReserve = true;
          const areaId = findAreaId(reserveName);
          if (areaId) reserveAreaIds.push({ area_id: areaId, order: ri });
        }
      }

      // If no numbered columns found, try single "Reservegebied" column with comma/en-separated values
      if (!foundNumberedReserve) {
        const singleReserve = findCol(row, "Reservegebied", "Reserve gebied", "reservegebied", "reserve gebied");
        if (singleReserve) {
          // Split on comma, " en ", " of ", semicolon — but NOT on " - " (that's area-neighborhood)
          const parts = singleReserve
            .split(/[,;]|\sen\s/)
            .map((p: string) => p.trim())
            .filter(Boolean);
          let order = 1;
          for (const part of parts) {
            // Extract area name: strip neighborhood suffix after " - "
            const areaNamePart = part.split(/\s*-\s*/)[0].trim();
            const areaId = findAreaId(areaNamePart);
            if (areaId && !reserveAreaIds.some(r => r.area_id === areaId)) {
              reserveAreaIds.push({ area_id: areaId, order: order++ });
            }
          }
        }
      }

      // all_areas_flexible
      const flexRaw = findCol(row, "Flexibel", "flexibel", "Alle gebieden", "alle gebieden", "all_areas_flexible");
      const all_areas_flexible = flexRaw ? ["ja", "yes", "1", "true", "x"].includes(flexRaw.toLowerCase()) : false;

      // Postal code
      const pcCijfers = findCol(row, "Postcode cijfers", "Postcode", "postcode");
      const pcLetters = findCol(row, "Postcode letters");
      const postal_code = pcCijfers ? `${pcCijfers}${pcLetters ? " " + pcLetters : ""}`.trim() : null;

      // Gender
      const gender = mapGender(findCol(row, "Geslacht", "geslacht", "Gender"));

      // Class/group — avoid matching "leeftijdsgroep" which is age category
      const classGroupRaw = findCol(row, "Klas", "klas", "Class");
      // Only use "Groep"/"groep" if the actual matching key does NOT contain "leeftijd"
      let class_group: string | null = classGroupRaw ?? null;
      if (!class_group) {
        const keys = Object.keys(row);
        const groepKey = keys.find(k => {
          const nk = normalizeKey(k);
          return (nk === "groep" || nk.startsWith("groep")) && !nk.includes("leeftijd");
        });
        if (groepKey && row[groepKey] !== undefined && row[groepKey] !== "") {
          class_group = String(row[groepKey]).trim();
        }
      }

      // Guardian fields
      const guardian_name = findCol(row, "Naam ouder", "Naam verzorger", "Ouder", "Verzorger", "Naam ouder/verzorger", "guardian_name") ?? null;
      const guardian_phone = findCol(row, "Telefoonnummer", "telefoon", "Telefoon", "Tel", "phone", "Telefoonnummer ouder", "Tel ouder") ?? null;
      const guardian_phone_alt = findCol(row, "Telefoon alt", "Telefoonnummer 2", "Tel 2", "guardian_phone_alt", "Tweede telefoonnummer") ?? null;
      const guardian_email = findCol(row, "E-mail ouder", "Email ouder", "E-mail", "Email", "guardian_email", "Emailadres") ?? null;

      // Intake date
      const intakeDateRaw = findCol(row, "Datum Intake", "Intake datum", "datum intake", "intake_date");
      const intake_date = parseExcelDate(intakeDateRaw, dateFormat);

      // Enrollment date
      const enrollDateRaw = findCol(row, "Datum inschrijving", "Inschrijfdatum", "datum inschrijving");
      const enrollDate = parseExcelDate(enrollDateRaw, dateFormat);

      // Referral source (how they found the program) — check multiple column names
      const referralRaw = findCol(row, "Hoe aan de KT gekomen", "Verwezen door", "Verwijzing", "Verwijzer", "Hoe bij KT gekomen", "referral", "Bron") ?? null;

      // Determine if this is a person-referrer or a generic source
      let referral_reason = referralRaw;
      let referrer_id: string | null = null;

      if (referralRaw) {
        const normalizedRef = referralRaw.toLowerCase().trim();
        const isNonPerson = NON_PERSON_REFERRAL_SOURCES.some(
          (src) => normalizedRef === src || normalizedRef.includes(src)
        );

        if (isNonPerson) {
          // It's a generic source like "flyer", "internet" — store as reason only
          referral_reason = referralRaw;
        } else {
          // Could be a person's name — try to match to a referrer record
          referrer_id = findReferrerId(referralRaw, school_id);
          if (!referrer_id) {
            // Couldn't match to a known referrer, keep as referral_reason text
            referral_reason = referralRaw;
          }
        }
      }

      // Also check dedicated referrer-name column (separate from source)
      const referrerNameCol = findCol(row, "Verwijzer naam", "Naam verwijzer", "Verwijzende leerkracht") ?? null;
      if (referrerNameCol && !referrer_id) {
        referrer_id = findReferrerId(referrerNameCol, school_id);
      }

      // Intake status
      const intakeFormulier = findCol(row, "Intakeformulier", "Intake formulier");
      let intake_status = "nieuw";
      if (intake_date) {
        const parsedIntake = new Date(intake_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (parsedIntake < today) {
          intake_status = "intake_afgerond";
        } else {
          intake_status = "intake_gepland";
        }
      }
      if (intakeFormulier && intakeFormulier.toLowerCase() === "ja") intake_status = "intake";

      const recordData: any = {
        first_name,
        last_name,
        date_of_birth,
        gender,
        class_group,
        school_id,
        waitlist_area_id,
        guardian_name,
        guardian_phone_alt,
        guardian_email,
        postal_code,
        guardian_phone,
        intake_date,
        intake_status: selectedMode === "waitlist" ? "wachtlijst" : selectedMode === "intake_afgerond" ? "intake_afgerond" : intake_status,
        referral_reason: referral_reason,
        referrer_id,
        ...(selectedMode === "waitlist" ? { waitlist_status: "waiting" } : {}),
        registration_date: enrollDate || null,
        dob_estimated: dobEstimated,
        all_areas_flexible,
      };

      // Stash reserve area preferences for post-insert
      (recordData as any).__reserveAreas = reserveAreaIds;

      // Check if record already exists
      const existingRecord = (nameDobKey && existingByNameDob.get(nameDobKey)) || existingByName.get(nameKey);

      if (existingRecord) {
        // Update existing record with non-null imported values
        const updateData: any = {};
        for (const [key, value] of Object.entries(recordData)) {
          if (key === "created_at" || key === "__reserveAreas") continue;
          if (value !== null && value !== undefined && value !== "") {
            // Only update if existing value is empty/null
            if (!existingRecord[key] || existingRecord[key] === "") {
              updateData[key] = value;
            }
          }
        }
        // Always update these if provided (even if existing has value)
        if (gender) updateData.gender = gender;
        if (school_id) updateData.school_id = school_id;
        if (class_group) updateData.class_group = class_group;
        // Always overwrite DOB when imported value is a real (non-estimated) date,
        // or when existing was estimated and import provides a value
        if (date_of_birth && !dobEstimated) {
          updateData.date_of_birth = date_of_birth;
          updateData.dob_estimated = false;
        }

        // Remove __reserveAreas from updateData
        delete updateData.__reserveAreas;
        if (Object.keys(updateData).length > 0 || reserveAreaIds.length > 0) {
          updates.push({ id: existingRecord.id, data: updateData, reserves: reserveAreaIds });
        } else {
          skipped++;
        }
      } else {
        inserts.push(recordData);
      }
    }

    // Batch insert new records (chunks of 50)
    for (let i = 0; i < inserts.length; i += 50) {
      const chunk = inserts.slice(i, i + 50);
      // Extract and remove __reserveAreas before inserting
      const reserveMap = chunk.map((r: any) => {
        const reserves = r.__reserveAreas ?? [];
        delete r.__reserveAreas;
        return reserves;
      });
      const { data: insertedRows, error } = await supabase.from("clients").insert(chunk).select("id");
      if (error) {
        errors.push(`Nieuwe rijen ${i + 2}: ${error.message}`);
      } else {
        added += (insertedRows ?? chunk).length;
        // Insert reserve area preferences for newly inserted clients
        const prefInserts: { client_id: string; area_id: string; preference_order: number }[] = [];
        (insertedRows ?? []).forEach((row: any, idx: number) => {
          const reserves = reserveMap[idx] ?? [];
          for (const r of reserves) {
            prefInserts.push({ client_id: row.id, area_id: r.area_id, preference_order: r.order });
          }
        });
        if (prefInserts.length > 0) {
          await supabase.from("client_area_preferences").insert(prefInserts);
        }
      }
    }

    // Update existing records one by one
    for (const upd of updates) {
      if (Object.keys(upd.data).length > 0) {
        const { error } = await supabase.from("clients").update(upd.data).eq("id", upd.id);
        if (error) {
          errors.push(`Update ${upd.id}: ${error.message}`);
          continue;
        }
      }
      // Upsert reserve area preferences
      if (upd.reserves && upd.reserves.length > 0) {
        // Delete existing prefs, then insert new ones
        await supabase.from("client_area_preferences").delete().eq("client_id", upd.id);
        const prefInserts = upd.reserves.map((r) => ({
          client_id: upd.id, area_id: r.area_id, preference_order: r.order,
        }));
        await supabase.from("client_area_preferences").insert(prefInserts);
      }
      updated++;
    }

    setResult({ added, skipped, updated, errors });
    setImporting(false);

    if (added > 0 || updated > 0) {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      const parts = [];
      if (added > 0) parts.push(`${added} toegevoegd`);
      if (updated > 0) parts.push(`${updated} bijgewerkt`);
      toast({ title: `${parts.join(", ")}${selectedMode === "waitlist" ? " (wachtlijst)" : selectedMode === "intake_afgerond" ? " (intakes afgerond)" : ""}` });
      onComplete?.();
    }
  };

  const reset = () => {
    setRows([]);
    setFileName("");
    setResult(null);
    setUnmatchedSchools([]);
    setSchoolResolutions({});
    setShowResolution(false);
    if (fileRef.current) fileRef.current.value = "";
    if (modeProp === "choose") setSelectedMode("waitlist");
  };

  const mode = selectedMode; // alias for convenience

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "waitlist" ? "Wachtlijst importeren uit Excel" : mode === "intake_afgerond" ? "Afgeronde intakes importeren uit Excel" : "Deelnemers importeren uit Excel"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Mode selector — only when mode="choose" */}
          {modeProp === "choose" && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Type import</Label>
              <div className="grid grid-cols-1 gap-2">
                {MODE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setSelectedMode(opt.value)}
                    className={`rounded-lg border p-3 text-left transition-colors ${
                      selectedMode === opt.value
                        ? "border-primary bg-primary/5 ring-1 ring-primary"
                        : "border-border hover:border-primary/50"
                    }`}
                  >
                    <p className="text-sm font-medium">{opt.label}</p>
                    <p className="text-xs text-muted-foreground">{opt.description}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* File selection */}
          <div className="rounded-lg border-2 border-dashed border-border p-6 text-center">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFile}
              className="hidden"
              id="client-import-file"
            />
            <FileSpreadsheet className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              {fileName || "Kies een Excel- of CSV-bestand"}
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" /> Bestand kiezen
            </Button>
          </div>

          {/* Preview */}
          {rows.length > 0 && !result && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">
                  <Badge variant="secondary">{rows.length}</Badge> rij(en) gevonden
                </p>
                <Button variant="outline" size="sm" onClick={reset}>Annuleren</Button>
              </div>

              {/* Column preview */}
              <div className="rounded-md border border-border bg-muted/30 p-3 text-xs">
                <p className="mb-1 font-medium text-muted-foreground">Herkende kolommen:</p>
                <div className="flex flex-wrap gap-1">
                  {Object.keys(rows[0]).map((k) => (
                    <Badge key={k} variant="outline" className="text-xs">{k}</Badge>
                  ))}
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Verwachte kolommen: <strong>Naam kind</strong> (of Voornaam + Achternaam), Geboortedatum/Leeftijd, School, Groep, Geslacht, Telefoonnummer, Postcode, Gebied, Datum Intake, Datum inschrijving
              </p>

              {/* School resolution step */}
              {showResolution && unmatchedSchools.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                  <p className="text-sm font-medium text-amber-900 flex items-center gap-1.5">
                    <AlertCircle className="h-4 w-4" />
                    {unmatchedSchools.length} schoolna{unmatchedSchools.length === 1 ? "am" : "men"} niet automatisch herkend
                  </p>
                  <p className="text-xs text-amber-700">Koppel hieronder de juiste school, of laat leeg om zonder school te importeren.</p>
                  {unmatchedSchools.map((name) => (
                    <div key={name} className="flex items-center gap-2">
                      <span className="text-xs font-medium text-amber-900 min-w-[120px] truncate" title={name}>"{name}"</span>
                      <select
                        className="flex-1 rounded border border-amber-300 bg-white px-2 py-1 text-xs"
                        value={schoolResolutions[name] ?? ""}
                        onChange={(e) => setSchoolResolutions((prev) => ({ ...prev, [name]: e.target.value }))}
                      >
                        <option value="">— Overslaan —</option>
                        {schools.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}

              {!showResolution ? (
                <Button onClick={() => { checkSchoolsBeforeImport(); if (detectUnmatchedSchools().length === 0) handleImport(); }} disabled={importing} className="w-full">
                  {importing ? <><Loader2 className="h-4 w-4 animate-spin" /> Importeren...</> : <><Upload className="h-4 w-4" /> {rows.length} deelnemer(s) importeren</>}
                </Button>
              ) : (
                <Button onClick={handleImport} disabled={importing} className="w-full">
                  {importing ? <><Loader2 className="h-4 w-4 animate-spin" /> Importeren...</> : <><Upload className="h-4 w-4" /> Importeren met bovenstaande keuzes</>}
                </Button>
              )}
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span><strong>{result.added}</strong> toegevoegd</span>
                {result.updated > 0 && (
                  <span className="text-muted-foreground">• {result.updated} bijgewerkt</span>
                )}
                {result.skipped > 0 && (
                  <span className="text-muted-foreground">• {result.skipped} overgeslagen</span>
                )}
              </div>
              {result.errors.length > 0 && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                  <div className="flex items-center gap-1 font-medium"><AlertCircle className="h-4 w-4" /> Fouten:</div>
                  {result.errors.map((e, i) => <p key={i}>{e}</p>)}
                </div>
              )}
              <Button variant="outline" onClick={reset} className="w-full">Nog een bestand importeren</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
