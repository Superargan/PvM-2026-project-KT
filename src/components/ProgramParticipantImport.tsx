import { useState, useRef } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { schoolKeys, clientKeys, programKeys } from "@/lib/queryKeys";
import {
  findCol,
  parseExcelDate,
  findSchoolMatch,
  splitName,
  detectDateFormat,
  createImportSummary,
  buildSummaryMessage,
  type EntityRef,
  type ImportSummary,
} from "@/lib/ImportEngine";
import type { ImportSchoolRef, TablesInsert } from "@/lib/queryShapes";

/** Raw parsed Excel row — keys are dynamic column headers */
interface ParsedRow {
  [key: string]: unknown;
}

interface RowResult {
  rowNum: number;
  name: string;
  status: "toegevoegd" | "gekoppeld" | "overgeslagen" | "fout";
  message?: string;
}

interface ProgramParticipantImportProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  programId: string;
  programName: string;
}

interface ExistingClientLite {
  id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
}

export default function ProgramParticipantImport({ open, onOpenChange, programId, programName }: ProgramParticipantImportProps) {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [rowResults, setRowResults] = useState<RowResult[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: schools = [] } = useQuery({
    queryKey: schoolKeys.all,
    queryFn: async () => {
      const { data } = await supabase.from("schools").select("id, name, neighborhood_id, neighborhoods(area_id)").order("name");
      return (data ?? []) as ImportSchoolRef[];
    },
    enabled: open,
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setSummary(null);
    setRowResults([]);

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

  const handleImport = async () => {
    setImporting(true);
    const sum = createImportSummary();
    const results: RowResult[] = [];

    try {
      // Fetch existing clients for matching
      const { data: existingClients } = await supabase
        .from("clients")
        .select("id, first_name, last_name, date_of_birth");

      const byNameDob = new Map<string, ExistingClientLite>();
      const byName = new Map<string, ExistingClientLite[]>();
      for (const c of (existingClients ?? []) as ExistingClientLite[]) {
        const nameKey = `${c.first_name?.toLowerCase().trim()}|${c.last_name?.toLowerCase().trim()}`;
        if (c.date_of_birth) byNameDob.set(`${nameKey}|${c.date_of_birth}`, c);
        const list = byName.get(nameKey) ?? [];
        list.push(c);
        byName.set(nameKey, list);
      }

      // Already enrolled in this program
      const { data: enrolled } = await supabase
        .from("program_clients")
        .select("client_id")
        .eq("program_id", programId);
      const enrolledIds = new Set((enrolled ?? []).map((e) => e.client_id));

      const dateFormat = detectDateFormat(rows);
      const batchKeys = new Set<string>();

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const rowNum = i + 2;

        // Name
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
          sum.skipped++;
          results.push({ rowNum, name: "(leeg)", status: "overgeslagen", message: "Geen naam gevonden" });
          continue;
        }

        const displayName = `${first_name} ${last_name}`.trim();

        // Date of birth
        const dobRaw = findCol(row, "Geboortedatum", "geboortedatum", "date_of_birth", "Geboorte datum");
        const date_of_birth = parseExcelDate(dobRaw, dateFormat);

        // Intra-batch dedupe
        const nameKey = `${first_name.toLowerCase().trim()}|${last_name.toLowerCase().trim()}`;
        const batchKey = date_of_birth ? `${nameKey}|${date_of_birth}` : nameKey;
        if (batchKeys.has(batchKey)) {
          sum.skipped++;
          results.push({ rowNum, name: displayName, status: "overgeslagen", message: "Dubbel in bestand" });
          continue;
        }
        batchKeys.add(batchKey);

        // School
        const schoolName = findCol(row, "School", "school", "Schoolnaam");
        const schoolMatch = schoolName ? findSchoolMatch(schoolName, schools as EntityRef[]) : null;
        const school_id = schoolMatch?.id ?? null;
        if (schoolName && !school_id) {
          sum.warnings.push(`Rij ${rowNum}: school "${schoolName}" niet herkend`);
        }

        // Guardian fields
        const guardian_name = findCol(row, "Naam ouder", "Naam verzorger", "Ouder", "Verzorger", "Naam ouder/verzorger", "guardian_name") ?? null;
        const guardian_phone = findCol(row, "Telefoonnummer", "telefoon", "Telefoon", "Tel", "phone", "Telefoonnummer ouder", "Tel ouder") ?? null;
        const guardian_email = findCol(row, "E-mail ouder", "Email ouder", "E-mail", "Email", "guardian_email", "Emailadres") ?? null;

        // Match existing client: exact on name+dob, or unique name match
        let clientId: string | null = null;
        const nameDobKey = date_of_birth ? `${nameKey}|${date_of_birth}` : null;
        if (nameDobKey && byNameDob.has(nameDobKey)) {
          clientId = byNameDob.get(nameDobKey)!.id;
        } else {
          const candidates = byName.get(nameKey) ?? [];
          if (candidates.length === 1) {
            clientId = candidates[0].id;
          } else if (candidates.length > 1) {
            sum.invalid++;
            results.push({ rowNum, name: displayName, status: "fout", message: "Meerdere deelnemers met deze naam — geboortedatum ontbreekt of wijkt af" });
            continue;
          }
        }

        // Create new client if not found
        if (!clientId) {
          const school = school_id ? schools.find((s) => s.id === school_id) : undefined;
          const insert: TablesInsert<"clients"> = {
            first_name,
            last_name,
            date_of_birth,
            school_id,
            neighborhood_id: school?.neighborhood_id ?? null,
            guardian_name,
            guardian_phone,
            guardian_email,
            intake_status: "intake_afgerond",
          };
          const { data: created, error } = await supabase
            .from("clients")
            .insert(insert)
            .select("id")
            .single();
          if (error || !created) {
            sum.invalid++;
            results.push({ rowNum, name: displayName, status: "fout", message: error?.message ?? "Aanmaken mislukt" });
            continue;
          }
          clientId = created.id;
          sum.added++;
        }

        // Enroll in program
        if (enrolledIds.has(clientId)) {
          sum.skipped++;
          results.push({ rowNum, name: displayName, status: "overgeslagen", message: "Al ingeschreven in dit programma" });
          continue;
        }

        const { error: enrollError } = await supabase
          .from("program_clients")
          .insert({ program_id: programId, client_id: clientId });
        if (enrollError) {
          sum.invalid++;
          results.push({ rowNum, name: displayName, status: "fout", message: enrollError.message });
          continue;
        }
        enrolledIds.add(clientId);
        sum.updated++;
        results.push({ rowNum, name: displayName, status: "gekoppeld" });
      }

      setSummary(sum);
      setRowResults(results);
      queryClient.invalidateQueries({ queryKey: programKeys.clients(programId) });
      queryClient.invalidateQueries({ queryKey: clientKeys.all });
      toast({ title: "Import afgerond", description: buildSummaryMessage(sum) });
    } catch (err) {
      toast({ title: "Import mislukt", description: err instanceof Error ? err.message : "Onbekende fout", variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const statusBadge = (status: RowResult["status"]) => {
    switch (status) {
      case "toegevoegd": return <Badge variant="default">Toegevoegd</Badge>;
      case "gekoppeld": return <Badge variant="default">Gekoppeld</Badge>;
      case "overgeslagen": return <Badge variant="secondary">Overgeslagen</Badge>;
      case "fout": return <Badge variant="destructive">Fout</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Deelnemerslijst inlezen — {programName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground space-y-1">
            <p className="flex items-center gap-2 font-medium text-foreground"><FileSpreadsheet className="h-4 w-4" /> Excel of CSV</p>
            <p>Kolommen: <strong>Naam kind</strong> (of Voornaam + Achternaam), Geboortedatum, School.</p>
            <p>Optioneel: Naam ouder, Telefoonnummer, E-mail ouder.</p>
            <p>Bestaande deelnemers worden herkend en direct gekoppeld; nieuwe kinderen worden automatisch aangemaakt. Niet-herkende scholen worden gerapporteerd.</p>
          </div>

          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
          <Button variant="outline" className="w-full" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4 mr-2" /> {fileName || "Bestand kiezen"}
          </Button>

          {rows.length > 0 && !summary && (
            <Button className="w-full" onClick={handleImport} disabled={importing}>
              {importing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {rows.length} rijen inlezen
            </Button>
          )}

          {summary && (
            <div className="space-y-3">
              <p className="text-sm font-medium">{buildSummaryMessage(summary)}</p>
              {summary.warnings.length > 0 && (
                <div className="text-xs text-muted-foreground space-y-0.5">
                  {summary.warnings.map((w, i) => <p key={i}>{w}</p>)}
                </div>
              )}
              <div className="max-h-64 overflow-y-auto space-y-1">
                {rowResults.map((r) => (
                  <div key={r.rowNum} className="flex items-center justify-between gap-2 text-sm border-b pb-1">
                    <span className="truncate">{r.name}{r.message ? <span className="text-xs text-muted-foreground"> — {r.message}</span> : null}</span>
                    {statusBadge(r.status)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
