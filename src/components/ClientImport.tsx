import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
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

function parseExcelDate(val: any): string | null {
  if (!val) return null;
  if (typeof val === "number") {
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(val).trim();
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
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
  if (lower === "jongen" || lower === "m" || lower === "man") return "Jongen";
  if (lower === "meisje" || lower === "v" || lower === "vrouw") return "Meisje";
  return val;
}

interface ClientImportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
  /** When "waitlist", imported clients get waitlist_status='waiting' and intake_status='wachtlijst' */
  mode?: "default" | "waitlist";
}

export default function ClientImport({ open, onOpenChange, onComplete, mode = "default" }: ClientImportProps) {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ added: number; skipped: number; errors: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: schools = [] } = useQuery({
    queryKey: ["schools-import"],
    queryFn: async () => {
      const { data } = await supabase.from("schools").select("id, name").order("name");
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

  /** Fuzzy school name matching: exact → contains → best partial */
  const findSchoolId = (name: string | undefined): string | null => {
    if (!name) return null;
    const norm = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

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

  const findAreaId = (name: string | undefined): string | null => {
    if (!name) return null;
    const norm = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const exact = areas.find((a) => a.name.toLowerCase().trim() === norm);
    if (exact) return exact.id;
    const contains = areas.find((a) => {
      const aNorm = a.name.toLowerCase().trim();
      return aNorm.includes(norm) || norm.includes(aNorm);
    });
    return contains?.id ?? null;
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

    const inserts: any[] = [];

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
      let date_of_birth: string | null = parseExcelDate(dobRaw);

      // If no DOB but we have age, estimate
      if (!date_of_birth) {
        const ageStr = findCol(row, "Leeftijd", "leeftijd", "age");
        if (ageStr) {
          const age = parseInt(ageStr, 10);
          if (!isNaN(age)) {
            const now = new Date();
            date_of_birth = `${now.getFullYear() - age}-06-15`;
          }
        }
      }

      // Deduplicate
      const key = `${first_name.toLowerCase().trim()}|${last_name.toLowerCase().trim()}|${date_of_birth ?? ""}`;
      if (existingSet.has(key)) {
        skipped++;
        continue;
      }
      existingSet.add(key);

      // School
      const schoolName = findCol(row, "School", "school", "Schoolnaam");
      const school_id = findSchoolId(schoolName);

      // Area
      const areaName = findCol(row, "Gebied", "gebied", "Area");
      const waitlist_area_id = findAreaId(areaName);

      // Postal code
      const pcCijfers = findCol(row, "Postcode cijfers", "Postcode", "postcode");
      const pcLetters = findCol(row, "Postcode letters");
      const postal_code = pcCijfers ? `${pcCijfers}${pcLetters ? " " + pcLetters : ""}`.trim() : null;

      // Gender
      const gender = mapGender(findCol(row, "Geslacht", "geslacht", "Gender"));

      // Class/group
      const class_group = findCol(row, "Groep", "groep", "Klas", "klas", "Class") ?? null;

      // Phone
      const guardian_phone = findCol(row, "Telefoonnummer", "telefoon", "Telefoon", "Tel", "phone") ?? null;

      // Intake date
      const intakeDateRaw = findCol(row, "Datum Intake", "Intake datum", "datum intake", "intake_date");
      const intake_date = parseExcelDate(intakeDateRaw);

      // Enrollment date
      const enrollDateRaw = findCol(row, "Datum inschrijving", "Inschrijfdatum", "datum inschrijving");
      const enrollDate = parseExcelDate(enrollDateRaw);

      // Referral source (how they found the program)
      const referral = findCol(row, "Hoe aan de KT gekomen", "Verwezen door", "Verwijzing", "referral") ?? null;

      // Referrer (person who referred) - avoid matching "Verwijzer geïnformeerd"
      const referrerName = findCol(row, "Verwijzer naam", "Naam verwijzer", "Verwijzende leerkracht") ?? null;
      const referrer_id = findReferrerId(referrerName, school_id);

      // Intake status
      const intakeFormulier = findCol(row, "Intakeformulier", "Intake formulier");
      let intake_status = "nieuw";
      if (intake_date) intake_status = "intake_gepland";
      if (intakeFormulier && intakeFormulier.toLowerCase() === "ja") intake_status = "intake";

      inserts.push({
        first_name,
        last_name,
        date_of_birth,
        gender,
        class_group,
        school_id,
        waitlist_area_id,
        postal_code,
        guardian_phone,
        intake_date,
        intake_status: mode === "waitlist" ? "wachtlijst" : intake_status,
        referral_reason: referral,
        referrer_id,
        ...(mode === "waitlist" ? { waitlist_status: "waiting" } : {}),
        ...(enrollDate ? { created_at: `${enrollDate}T00:00:00Z` } : {}),
      });
    }

    // Batch insert (chunks of 50)
    for (let i = 0; i < inserts.length; i += 50) {
      const chunk = inserts.slice(i, i + 50);
      const { error } = await supabase.from("clients").insert(chunk);
      if (error) {
        errors.push(`Rij ${i + 2}-${i + chunk.length + 1}: ${error.message}`);
      } else {
        added += chunk.length;
      }
    }

    setResult({ added, skipped, errors });
    setImporting(false);

    if (added > 0) {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["aanmeldingen"] });
      queryClient.invalidateQueries({ queryKey: ["waitlist-clients"] });
      toast({ title: `${added} deelnemer(s) geïmporteerd${mode === "waitlist" ? " op wachtlijst" : ""}` });
      onComplete?.();
    }
  };

  const reset = () => {
    setRows([]);
    setFileName("");
    setResult(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{mode === "waitlist" ? "Wachtlijst importeren uit Excel" : "Deelnemers importeren uit Excel"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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

              <Button onClick={handleImport} disabled={importing} className="w-full">
                {importing ? <><Loader2 className="h-4 w-4 animate-spin" /> Importeren...</> : <><Upload className="h-4 w-4" /> {rows.length} deelnemer(s) importeren</>}
              </Button>
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <span><strong>{result.added}</strong> toegevoegd</span>
                {result.skipped > 0 && (
                  <span className="text-muted-foreground">• {result.skipped} overgeslagen (duplicaat of geen naam)</span>
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
