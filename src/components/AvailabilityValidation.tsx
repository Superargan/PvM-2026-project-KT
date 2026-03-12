import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { buildAvailabilityByClient, hasAvailabilityCoverage, statusLabels } from "@/lib/clientUtils";
import { clientKeys, areaKeys } from "@/lib/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckCircle2, AlertTriangle, XCircle, Download, Loader2, CalendarDays, Info } from "lucide-react";
import { downloadExport } from "@/lib/csvExport";
import { addMonths, format, parseISO, isAfter } from "date-fns";

type ValidationResult = "voldoende" | "onvolledig" | "geen";

interface ClientValidation {
  client: any;
  areaName: string;
  totalRecords: number;
  usableRecords: number;
  futureDays: number;
  lastDate: string | null;
  result: ValidationResult;
  reason: string;
}

export default function AvailabilityValidation({ onNavigate }: { onNavigate: (id: string) => void }) {
  // Clients that require availability
  const { data: clients = [], isLoading: loadingClients } = useQuery({
    queryKey: ["availability-validation-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name, date_of_birth, intake_status, waitlist_area_id, school_id, schools(name), areas:waitlist_area_id(name)")
        .eq("archived", false)
        .in("intake_status", ["intake_afgerond", "wachtlijst"])
        .order("last_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const clientIds = clients.map((c: any) => c.id);

  // All availability records for these clients
  const { data: allAvail = [], isLoading: loadingAvail } = useQuery({
    queryKey: ["availability-validation-data", clientIds.length],
    enabled: clientIds.length > 0,
    queryFn: async () => {
      // Batch in chunks of 50 clients to avoid URI-too-long,
      // and paginate each chunk to overcome the 1000-row default limit
      const chunks: string[][] = [];
      for (let i = 0; i < clientIds.length; i += 50) {
        chunks.push(clientIds.slice(i, i + 50));
      }
      const results: any[] = [];
      for (const chunk of chunks) {
        let from = 0;
        const pageSize = 1000;
        while (true) {
          const { data, error } = await supabase
            .from("client_availability")
            .select("client_id, available_date, start_time, end_time")
            .in("client_id", chunk)
            .range(from, from + pageSize - 1);
          if (error) throw error;
          if (data) results.push(...data);
          if (!data || data.length < pageSize) break;
          from += pageSize;
        }
      }
      return results;
    },
  });

  const isLoading = loadingClients || loadingAvail;

  // Build validation results
  const now = new Date();
  const availByClient = buildAvailabilityByClient(allAvail);

  // Raw records grouped by client (including unusable)
  const rawByClient: Record<string, any[]> = {};
  allAvail.forEach((a: any) => {
    if (!rawByClient[a.client_id]) rawByClient[a.client_id] = [];
    rawByClient[a.client_id].push(a);
  });

  const threshold = addMonths(now, 4);

  const validations: ClientValidation[] = clients.map((c: any) => {
    const raw = rawByClient[c.id] ?? [];
    const usable = availByClient[c.id] ?? [];
    const futureUsable = usable.filter((a) => isAfter(parseISO(a.date), now));
    const allDates = usable.map((a) => a.date).sort();
    const lastDate = allDates.length > 0 ? allDates[allDates.length - 1] : null;
    const hasCoverage = hasAvailabilityCoverage(usable);

    let result: ValidationResult = "geen";
    let reason = "";

    if (raw.length === 0) {
      result = "geen";
      reason = "Er zijn geen beschikbaarheidsrecords vastgelegd.";
    } else if (hasCoverage) {
      result = "voldoende";
      reason = "Beschikbaarheid dekt minimaal 4 maanden vooruit.";
    } else {
      result = "onvolledig";
      // Determine specific reason
      const reasons: string[] = [];
      if (usable.length === 0 && raw.length > 0) {
        reasons.push("Alle records zijn onbruikbaar (start-/eindtijd ontbreekt of ongeldig).");
      } else {
        if (futureUsable.length === 0) {
          reasons.push("Geen toekomstige beschikbaarheid — alle records liggen in het verleden.");
        } else {
          const hasLongTerm = usable.some((a) => isAfter(parseISO(a.date), threshold));
          if (!hasLongTerm) {
            const lastUsable = lastDate ? format(parseISO(lastDate), "dd-MM-yyyy") : "—";
            const thresholdStr = format(threshold, "dd-MM-yyyy");
            reasons.push(`Dekking loopt t/m ${lastUsable}, maar moet doorlopen tot minimaal ${thresholdStr}.`);
          }
        }
      }
      reason = reasons.join(" ");
    }

    return {
      client: c,
      areaName: (c as any).areas?.name ?? "—",
      totalRecords: raw.length,
      usableRecords: usable.length,
      futureDays: futureUsable.length,
      lastDate,
      result,
      reason,
    };
  });

  const counts = {
    voldoende: validations.filter((v) => v.result === "voldoende").length,
    onvolledig: validations.filter((v) => v.result === "onvolledig").length,
    geen: validations.filter((v) => v.result === "geen").length,
  };

  const sorted = [...validations].sort((a, b) => {
    const order: Record<ValidationResult, number> = { geen: 0, onvolledig: 1, voldoende: 2 };
    return order[a.result] - order[b.result];
  });

  const handleExport = () => {
    const columns = [
      { key: "naam", label: "Naam" },
      { key: "status", label: "Status" },
      { key: "gebied", label: "Gebied" },
      { key: "totaal", label: "Records totaal" },
      { key: "bruikbaar", label: "Bruikbare records" },
      { key: "toekomst", label: "Toekomstige dagen" },
      { key: "laatsteDatum", label: "Laatste datum" },
      { key: "resultaat", label: "Resultaat" },
      { key: "toelichting", label: "Toelichting" },
    ];
    const resultLabels: Record<ValidationResult, string> = {
      voldoende: "Voldoende (4 mnd)",
      onvolledig: "Onvolledig",
      geen: "Geen beschikbaarheid",
    };
    const rows = sorted.map((v) => ({
      naam: `${v.client.first_name} ${v.client.last_name}`,
      status: statusLabels[v.client.intake_status] ?? v.client.intake_status,
      gebied: v.areaName,
      totaal: v.totalRecords,
      bruikbaar: v.usableRecords,
      toekomst: v.futureDays,
      laatsteDatum: v.lastDate ? format(parseISO(v.lastDate), "dd-MM-yyyy") : "",
      resultaat: resultLabels[v.result],
      toelichting: v.reason,
    }));
    downloadExport("beschikbaarheid-validatie.xlsx", columns, rows, "xlsx");
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (clients.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <CalendarDays className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Geen deelnemers met status 'Intake afgerond' of 'Wachtlijst' gevonden.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Beschikbaarheidscontrole voor <span className="font-semibold text-foreground">{clients.length}</span> planbare deelnemers
        </p>
        <Button size="sm" variant="outline" onClick={handleExport} className="gap-1.5">
          <Download className="h-3.5 w-3.5" /> Exporteer
        </Button>
      </div>

      {/* Stats badges */}
      <div className="flex flex-wrap gap-3">
        <Badge variant="outline" className="gap-1.5 text-sm px-3 py-1 border-emerald-400 text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span className="font-bold">{counts.voldoende}</span> voldoende dekking
        </Badge>
        <Badge variant="outline" className="gap-1.5 text-sm px-3 py-1 border-amber-400 text-amber-700">
          <AlertTriangle className="h-3.5 w-3.5" />
          <span className="font-bold">{counts.onvolledig}</span> onvolledig
        </Badge>
        <Badge variant="outline" className="gap-1.5 text-sm px-3 py-1 border-destructive text-destructive">
          <XCircle className="h-3.5 w-3.5" />
          <span className="font-bold">{counts.geen}</span> geen beschikbaarheid
        </Badge>
      </div>

      {/* Legend */}
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-xs text-muted-foreground space-y-1">
        <p><strong className="text-foreground">Voldoende:</strong> Er zijn bruikbare records met toekomstige data die minimaal 4 maanden vooruit lopen.</p>
        <p><strong className="text-foreground">Onvolledig:</strong> Er zijn records, maar de dekking loopt niet ver genoeg vooruit, of de records zijn onbruikbaar (start-/eindtijd ontbreekt).</p>
        <p><strong className="text-foreground">Geen:</strong> Er zijn helemaal geen beschikbaarheidsrecords vastgelegd voor deze deelnemer.</p>
      </div>

      {/* Table */}
      <TooltipProvider>
        <div className="rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Naam</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Gebied</TableHead>
                <TableHead className="text-right">Records</TableHead>
                <TableHead className="text-right">Bruikbaar</TableHead>
                <TableHead className="text-right">Toekomst</TableHead>
                <TableHead>Laatste datum</TableHead>
                <TableHead>Resultaat</TableHead>
                <TableHead>Toelichting</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((v) => (
                <TableRow key={v.client.id}>
                  <TableCell>
                    <span
                      className="text-sm font-medium text-primary hover:underline cursor-pointer"
                      onClick={() => onNavigate(v.client.id)}
                    >
                      {v.client.first_name} {v.client.last_name}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">
                      {statusLabels[v.client.intake_status] ?? v.client.intake_status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{v.areaName}</TableCell>
                  <TableCell className="text-right text-sm">{v.totalRecords}</TableCell>
                  <TableCell className="text-right text-sm">
                    {v.usableRecords}
                    {v.totalRecords > 0 && v.usableRecords < v.totalRecords && (
                      <span className="ml-1 text-amber-600 text-xs">({v.totalRecords - v.usableRecords} onbruikbaar)</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-sm">{v.futureDays}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {v.lastDate ? format(parseISO(v.lastDate), "dd-MM-yyyy") : "—"}
                  </TableCell>
                  <TableCell>
                    {v.result === "voldoende" && (
                      <Badge variant="outline" className="text-[10px] border-emerald-400 text-emerald-700 gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Voldoende
                      </Badge>
                    )}
                    {v.result === "onvolledig" && (
                      <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-700 gap-1">
                        <AlertTriangle className="h-3 w-3" /> Onvolledig
                      </Badge>
                    )}
                    {v.result === "geen" && (
                      <Badge variant="outline" className="text-[10px] border-destructive text-destructive gap-1">
                        <XCircle className="h-3 w-3" /> Geen
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[240px]">
                    {v.reason && v.result !== "voldoende" ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex items-center gap-1 cursor-help">
                            <Info className="h-3 w-3 shrink-0" />
                            <span className="truncate">{v.reason}</span>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-xs text-xs">
                          {v.reason}
                        </TooltipContent>
                      </Tooltip>
                    ) : v.result === "voldoende" ? (
                      <span className="text-emerald-600">✓ OK</span>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TooltipProvider>
    </div>
  );
}
