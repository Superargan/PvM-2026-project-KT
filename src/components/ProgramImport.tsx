import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import {
  readFileAsRows,
  findCol,
  findAreaMatch,
  findSchoolMatch,
  normalizeEntityName,
  parseExcelDate,
  parseTime,
  type EntityRef,
} from "@/lib/importUtils";
import { createImportSummary, buildSummaryMessage, type ImportSummary } from "@/lib/ImportEngine";
import { programKeys } from "@/lib/queryKeys";

interface NeighborhoodRef extends EntityRef {
  area_id: string;
}

interface ProgramRow {
  id: string;
  training_number: string | null;
}

interface RowResult {
  trainingNumber: string;
  status: "added" | "updated" | "skipped" | "error";
  notes: string[];
}

/**
 * Programma-import (Excel/CSV).
 * Kolommen: Programmanummer (verplicht), Gebied, Wijk, Locatie/School,
 * optioneel: Naam, Startdatum, Starttijd, Max deelnemers.
 * - Bestaand programmanummer → bijwerken (lege waarden overschrijven nooit).
 * - Onbekend programmanummer → nieuw programma (status te_plannen).
 * - Niet-herkende scholen/gebieden worden gerapporteerd, nooit geraden.
 */
export default function ProgramImport() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<RowResult[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleFile = async (file: File) => {
    setBusy(true);
    setResults(null);
    const summary: ImportSummary = createImportSummary();
    const rowResults: RowResult[] = [];

    try {
      const rows = await readFileAsRows(file);
      if (rows.length === 0) {
        toast({ title: "Leeg bestand", description: "Geen rijen gevonden in het bestand.", variant: "destructive" });
        setBusy(false);
        return;
      }

      const [{ data: areas }, { data: neighborhoods }, { data: schools }, { data: existing }] = await Promise.all([
        supabase.from("areas").select("id, name"),
        supabase.from("neighborhoods").select("id, name, area_id"),
        supabase.from("schools").select("id, name, neighborhood_id"),
        supabase.from("programs").select("id, training_number"),
      ]);

      const areaRefs: EntityRef[] = areas ?? [];
      const neighborhoodRefs: NeighborhoodRef[] = neighborhoods ?? [];
      const schoolRefs: EntityRef[] = schools ?? [];
      const schoolNeighborhood = new Map((schools ?? []).map((s) => [s.id, s.neighborhood_id]));
      const byNumber = new Map<string, string>();
      for (const p of (existing ?? []) as ProgramRow[]) {
        if (p.training_number) byNumber.set(normalizeEntityName(p.training_number), p.id);
      }

      for (const row of rows) {
        const trainingNumber = findCol(row, "programmanummer", "trainingsnummer", "nummer", "programma nummer");
        if (!trainingNumber) {
          summary.skipped++;
          rowResults.push({ trainingNumber: "(leeg)", status: "skipped", notes: ["Geen programmanummer"] });
          continue;
        }

        const notes: string[] = [];
        const name = findCol(row, "naam", "programma", "programmanaam");
        const areaInput = findCol(row, "gebied", "area", "stadsdeel");
        const wijkInput = findCol(row, "wijk", "neighborhood", "buurt");
        const schoolInput = findCol(row, "locatie", "school", "locatie school", "trainingslocatie");
        const startDate = parseExcelDate(findCol(row, "startdatum", "vermoedelijke startdatum", "datum"));
        const startTime = parseTime(findCol(row, "starttijd", "tijd", "vermoedelijke starttijd"));
        const maxRaw = findCol(row, "max deelnemers", "max", "maximaal");
        const maxParticipants = maxRaw ? Number(maxRaw) : null;

        // Resolve school
        let schoolId: string | null = null;
        if (schoolInput) {
          const match = findSchoolMatch(schoolInput, schoolRefs);
          if (match) {
            schoolId = match.id;
          } else {
            notes.push(`School niet herkend: "${schoolInput}"`);
            summary.unresolved++;
          }
        }

        // Resolve neighborhood (scoped to area when known)
        let neighborhoodId: string | null = null;
        if (wijkInput) {
          const norm = normalizeEntityName(wijkInput);
          const match = neighborhoodRefs.find((n) => normalizeEntityName(n.name) === norm)
            ?? neighborhoodRefs.find((n) => {
              const nNorm = normalizeEntityName(n.name);
              return nNorm.includes(norm) || norm.includes(nNorm);
            });
          if (match) {
            neighborhoodId = match.id;
          } else {
            notes.push(`Wijk niet herkend: "${wijkInput}"`);
            summary.unresolved++;
          }
        }

        // Resolve area: explicit column, else via neighborhood, else via school
        let areaId: string | null = null;
        if (areaInput) {
          const match = findAreaMatch(areaInput, areaRefs);
          if (match) {
            areaId = match.id;
          } else {
            notes.push(`Gebied niet herkend: "${areaInput}"`);
            summary.unresolved++;
          }
        }
        if (!areaId && neighborhoodId) {
          areaId = neighborhoodRefs.find((n) => n.id === neighborhoodId)?.area_id ?? null;
        }
        if (!areaId && schoolId) {
          const nId = schoolNeighborhood.get(schoolId);
          if (nId) areaId = neighborhoodRefs.find((n) => n.id === nId)?.area_id ?? null;
        }

        const existingId = byNumber.get(normalizeEntityName(trainingNumber));

        if (existingId) {
          // Enrichment-only: blank values never overwrite
          const update: Record<string, unknown> = {};
          if (name) update.name = name;
          if (areaId) update.area_id = areaId;
          if (neighborhoodId) update.neighborhood_id = neighborhoodId;
          if (schoolId) update.school_id = schoolId;
          if (startDate) update.start_date = startDate;
          if (startTime) update.tentative_start_time = startTime;
          if (maxParticipants) update.max_participants = maxParticipants;

          if (Object.keys(update).length === 0) {
            summary.skipped++;
            rowResults.push({ trainingNumber, status: "skipped", notes: notes.length ? notes : ["Niets te bijwerken"] });
            continue;
          }
          const { error } = await supabase.from("programs").update(update).eq("id", existingId);
          if (error) {
            summary.invalid++;
            rowResults.push({ trainingNumber, status: "error", notes: [error.message] });
          } else {
            summary.updated++;
            rowResults.push({ trainingNumber, status: "updated", notes });
          }
        } else {
          const { error } = await supabase.from("programs").insert({
            name: name || `KT ${trainingNumber}`,
            training_number: trainingNumber,
            area_id: areaId,
            neighborhood_id: neighborhoodId,
            school_id: schoolId,
            start_date: startDate,
            tentative_start_time: startTime,
            max_participants: maxParticipants ?? 14,
            status: "te_plannen",
          });
          if (error) {
            summary.invalid++;
            rowResults.push({ trainingNumber, status: "error", notes: [error.message] });
          } else {
            summary.added++;
            rowResults.push({ trainingNumber, status: "added", notes });
          }
        }
      }

      setResults(rowResults);
      toast({ title: "Import afgerond", description: buildSummaryMessage(summary) });
      queryClient.invalidateQueries({ queryKey: programKeys.all });
    } catch (err) {
      toast({
        title: "Import mislukt",
        description: err instanceof Error ? err.message : "Onbekende fout",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const statusBadge = (status: RowResult["status"]) => {
    switch (status) {
      case "added": return <Badge className="bg-success/10 text-success border-success/20">Toegevoegd</Badge>;
      case "updated": return <Badge className="bg-info/10 text-info border-info/20">Bijgewerkt</Badge>;
      case "skipped": return <Badge variant="secondary">Overgeslagen</Badge>;
      case "error": return <Badge variant="destructive">Fout</Badge>;
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline"><Upload className="h-4 w-4" /> Lijst Inlezen</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Programmalijst inlezen</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground space-y-1">
            <p className="font-medium text-foreground flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" /> Excel of CSV
            </p>
            <p>Kolommen: <strong>Programmanummer</strong> (verplicht), Gebied, Wijk, Locatie/School.</p>
            <p>Optioneel: Naam, Startdatum, Starttijd, Max deelnemers.</p>
            <p>Bestaande programmanummers worden bijgewerkt; lege cellen overschrijven nooit bestaande gegevens. Niet-herkende scholen of gebieden worden gerapporteerd.</p>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <Button onClick={() => fileRef.current?.click()} disabled={busy} className="w-full">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {busy ? "Bezig met inlezen…" : "Bestand kiezen"}
          </Button>

          {results && (
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-success" /> Resultaat ({results.length} rijen)
              </p>
              <div className="rounded-md border divide-y max-h-72 overflow-y-auto">
                {results.map((r, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <span className="font-medium">{r.trainingNumber}</span>
                      {r.notes.length > 0 && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <AlertCircle className="h-3 w-3 shrink-0" /> {r.notes.join("; ")}
                        </p>
                      )}
                    </div>
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
