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

const IMPORT_TYPES: { value: ImportType; label: string; description: string; columns: string }[] = [
  {
    value: "trainer_beschikbaarheid",
    label: "Beschikbaarheid trainers",
    description: "Importeer beschikbaarheid van trainers",
    columns: "Naam, Datum, Starttijd, Eindtijd, Notities",
  },
  {
    value: "deelnemer_beschikbaarheid",
    label: "Beschikbaarheid deelnemers",
    description: "Importeer beschikbaarheid van deelnemers",
    columns: "Voornaam, Achternaam, Datum, Starttijd, Eindtijd, Notities",
  },
  {
    value: "sessies",
    label: "Sessies / planning",
    description: "Importeer trainingssessies",
    columns: "Programma (naam), Sessienummer, Datum, Locatie, Notities",
  },
];

// Normalize column names for flexible matching
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findCol(row: ParsedRow, ...candidates: string[]): string | undefined {
  const keys = Object.keys(row);
  for (const c of candidates) {
    const norm = normalizeKey(c);
    const found = keys.find((k) => normalizeKey(k) === norm);
    if (found && row[found] !== undefined && row[found] !== "") return String(row[found]).trim();
  }
  return undefined;
}

function parseExcelDate(val: any): string | null {
  if (!val) return null;
  if (typeof val === "number") {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(val);
    if (d) return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(val).trim();
  // Try dd-mm-yyyy or dd/mm/yyyy
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  // Try yyyy-mm-dd
  const ymd = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2].padStart(2, "0")}-${ymd[3].padStart(2, "0")}`;
  return null;
}

function parseTime(val: any): string | null {
  if (!val) return null;
  if (typeof val === "number") {
    // Excel time fraction
    const totalMinutes = Math.round(val * 24 * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  const s = String(val).trim();
  const match = s.match(/^(\d{1,2}):(\d{2})/);
  if (match) return `${match[1].padStart(2, "0")}:${match[2]}`;
  return null;
}

interface PlanningImportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function PlanningImport({ open, onOpenChange }: PlanningImportProps) {
  const [importType, setImportType] = useState<ImportType>("trainer_beschikbaarheid");
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ success: number; errors: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const reset = () => {
    setParsedData([]);
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
      const json: ParsedRow[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
      setParsedData(json);
    };
    reader.readAsArrayBuffer(file);
    // Reset file input
    e.target.value = "";
  };

  const doImport = async () => {
    if (parsedData.length === 0) return;
    setImporting(true);
    const errors: string[] = [];
    let success = 0;

    try {
      if (importType === "trainer_beschikbaarheid") {
        // Fetch trainers to match by name
        const { data: trainers } = await supabase.from("staff").select("id, name").eq("archived", false);
        const trainerMap = new Map<string, string>();
        trainers?.forEach((t) => {
          if (t.name) trainerMap.set(t.name.toLowerCase().trim(), t.id);
        });

        for (let i = 0; i < parsedData.length; i++) {
          const row = parsedData[i];
          const name = findCol(row, "naam", "name", "trainer", "medewerker");
          const date = parseExcelDate(findCol(row, "datum", "date", "dag") ?? row["Datum"] ?? row["datum"]);
          const start = parseTime(findCol(row, "starttijd", "van", "start", "starttime", "start_time") ?? row["Starttijd"]);
          const end = parseTime(findCol(row, "eindtijd", "tot", "end", "eindtime", "end_time", "eind") ?? row["Eindtijd"]);

          if (!name) { errors.push(`Rij ${i + 2}: geen naam gevonden`); continue; }
          if (!date) { errors.push(`Rij ${i + 2}: ongeldige datum`); continue; }

          const staffId = trainerMap.get(name.toLowerCase());
          if (!staffId) { errors.push(`Rij ${i + 2}: trainer "${name}" niet gevonden`); continue; }

          const { error } = await supabase.from("staff_availability").upsert({
            staff_id: staffId,
            available_date: date,
            start_time: start ?? "09:00",
            end_time: end ?? "17:00",
          } as any, { onConflict: "staff_id,available_date" });
          if (error) { errors.push(`Rij ${i + 2}: ${error.message}`); continue; }
          success++;
        }
      } else if (importType === "deelnemer_beschikbaarheid") {
        const { data: clients } = await supabase.from("clients").select("id, first_name, last_name").eq("archived", false);
        const clientMap = new Map<string, string>();
        clients?.forEach((c) => {
          clientMap.set(`${c.first_name} ${c.last_name}`.toLowerCase().trim(), c.id);
        });

        for (let i = 0; i < parsedData.length; i++) {
          const row = parsedData[i];
          const firstName = findCol(row, "voornaam", "firstname", "first_name", "naam");
          const lastName = findCol(row, "achternaam", "lastname", "last_name");
          const fullName = lastName ? `${firstName} ${lastName}` : firstName;
          const date = parseExcelDate(findCol(row, "datum", "date", "dag") ?? row["Datum"]);
          const start = parseTime(findCol(row, "starttijd", "van", "start") ?? row["Starttijd"]);
          const end = parseTime(findCol(row, "eindtijd", "tot", "end", "eind") ?? row["Eindtijd"]);

          if (!fullName) { errors.push(`Rij ${i + 2}: geen naam gevonden`); continue; }
          if (!date) { errors.push(`Rij ${i + 2}: ongeldige datum`); continue; }

          const clientId = clientMap.get(fullName.toLowerCase());
          if (!clientId) { errors.push(`Rij ${i + 2}: deelnemer "${fullName}" niet gevonden`); continue; }

          const { error } = await supabase.from("client_availability").upsert({
            client_id: clientId,
            available_date: date,
            start_time: start ?? "09:00",
            end_time: end ?? "17:00",
          } as any, { onConflict: "client_id,available_date" });
          if (error) { errors.push(`Rij ${i + 2}: ${error.message}`); continue; }
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
            <p className="text-muted-foreground">Verwachte kolommen: <span className="font-mono text-xs">{typeInfo.columns}</span></p>
            <p className="text-xs text-muted-foreground">Datumformaat: dd-mm-jjjj of jjjj-mm-dd. Tijden: uu:mm. Namen worden gematcht op bestaande records.</p>
          </div>

          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
          <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" />
            {fileName || "Kies Excel- of CSV-bestand"}
          </Button>

          {parsedData.length > 0 && !result && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-foreground font-medium">{parsedData.length} rij(en) gevonden</p>
                <Badge variant="outline" className="text-xs">
                  Kolommen: {Object.keys(parsedData[0]).join(", ")}
                </Badge>
              </div>

              {/* Preview */}
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

              <Button className="w-full" onClick={doImport} disabled={importing}>
                {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                {importing ? "Importeren..." : `Importeer ${parsedData.length} rij(en)`}
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
