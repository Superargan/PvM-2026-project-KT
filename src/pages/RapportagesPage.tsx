import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Loader2, BarChart3, Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadExport, ExportColumn } from "@/lib/csvExport";
import {
  startOfWeek, startOfMonth, startOfYear, format, getISOWeek, differenceInYears, parseISO,
} from "date-fns";
import { nl } from "date-fns/locale";
import InvoiceManager from "@/components/InvoiceManager";
import * as XLSX from "xlsx";

type Granularity = "week" | "maand" | "jaar";
type Breakdown = "totaal" | "school" | "gebied" | "leeftijd" | "geslacht";

const granularityLabel: Record<Granularity, string> = { week: "Week", maand: "Maand", jaar: "Jaar" };
const breakdownLabel: Record<Breakdown, string> = {
  totaal: "Totaal", school: "Per school", gebied: "Per gebied",
  leeftijd: "Per leeftijd", geslacht: "Per geslacht",
};

function periodKey(date: Date, gran: Granularity): string {
  if (gran === "week") return `${date.getFullYear()}-W${String(getISOWeek(date)).padStart(2, "0")}`;
  if (gran === "maand") return format(date, "yyyy-MM");
  return String(date.getFullYear());
}

function ageCategory(dob: string | null): string {
  if (!dob) return "Onbekend";
  const age = differenceInYears(new Date(), parseISO(dob));
  if (age < 6) return "0-5";
  if (age < 10) return "6-9";
  if (age < 13) return "10-12";
  if (age < 16) return "13-15";
  return "16+";
}

function ageCategoryLabel(dob: string | null): string {
  if (!dob) return "Onbekend";
  const age = differenceInYears(new Date(), parseISO(dob));
  if (age <= 7) return "5 - 7 jaar";
  return "8 - 12 jaar";
}

function genderLabel(g: string | null): string {
  if (!g) return "Onbekend";
  if (g === "M" || g.toLowerCase() === "man" || g.toLowerCase() === "jongen") return "Jongen";
  if (g === "V" || g.toLowerCase() === "vrouw" || g.toLowerCase() === "meisje") return "Meisje";
  return g;
}

export default function RapportagesPage() {
  const [gran, setGran] = useState<Granularity>("maand");
  const [breakdown, setBreakdown] = useState<Breakdown>("totaal");

  // Fetch all required data
  const { data: clients = [], isLoading: cl } = useQuery({
    queryKey: ["rpt_clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, first_name, last_name, created_at, date_of_birth, gender, school_id, postal_code, address, city, guardian_name, guardian_phone, guardian_email");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: programClients = [], isLoading: pcl } = useQuery({
    queryKey: ["rpt_program_clients"],
    queryFn: async () => {
      const { data, error } = await supabase.from("program_clients").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: programs = [], isLoading: prl } = useQuery({
    queryKey: ["rpt_programs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("programs").select("id, name, area_id, school_id, start_date, end_date, status, age_category, max_participants, areas(name), schools(name, address)");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: sessions = [], isLoading: sl } = useQuery({
    queryKey: ["rpt_sessions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("program_sessions").select("id, program_id, session_number");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: attendance = [], isLoading: al } = useQuery({
    queryKey: ["rpt_attendance"],
    queryFn: async () => {
      const { data, error } = await supabase.from("attendance").select("session_id, client_id, present");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: schools = [] } = useQuery({
    queryKey: ["rpt_schools"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("id, name, address");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: areas = [] } = useQuery({
    queryKey: ["rpt_areas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("areas").select("id, name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: programStaff = [] } = useQuery({
    queryKey: ["rpt_program_staff"],
    queryFn: async () => {
      const { data, error } = await supabase.from("program_staff").select("program_id, staff_id, role, staff:staff!program_staff_staff_id_fkey(name)");
      if (error) throw error;
      return data ?? [];
    },
  });

  const loading = cl || pcl || prl || sl || al;

  // Lookup maps
  const schoolMap = useMemo(() => new Map(schools.map((s: any) => [s.id, s])), [schools]);
  const areaMap = useMemo(() => new Map(areas.map((a: any) => [a.id, a.name])), [areas]);
  const clientMap = useMemo(() => new Map(clients.map((c: any) => [c.id, c])), [clients]);
  const programMap = useMemo(() => new Map(programs.map((p: any) => [p.id, p])), [programs]);
  const sessionProgramMap = useMemo(() => new Map(sessions.map((s: any) => [s.id, s.program_id])), [sessions]);

  // Breakdown key for a client
  function breakdownKey(clientId: string): string {
    const c = clientMap.get(clientId);
    if (!c) return "Onbekend";
    if (breakdown === "totaal") return "Totaal";
    if (breakdown === "school") return schoolMap.get(c.school_id)?.name ?? "Geen school";
    if (breakdown === "leeftijd") return ageCategory(c.date_of_birth);
    if (breakdown === "geslacht") return genderLabel(c.gender);
    return "Onbekend";
  }

  function breakdownKeyForProgram(programId: string): string {
    if (breakdown === "totaal") return "Totaal";
    const p = programMap.get(programId);
    if (breakdown === "gebied") return areaMap.get(p?.area_id) ?? "Geen gebied";
    if (breakdown === "school") return schoolMap.get(p?.school_id)?.name ?? "Geen school";
    return "Totaal";
  }

  // === 1. Aanmeldingen per periode ===
  const aanmeldData = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    clients.forEach((c: any) => {
      const pk = periodKey(new Date(c.created_at), gran);
      const bk = breakdownKey(c.id);
      if (!map.has(pk)) map.set(pk, new Map());
      const inner = map.get(pk)!;
      inner.set(bk, (inner.get(bk) ?? 0) + 1);
    });
    return map;
  }, [clients, gran, breakdown, clientMap, schoolMap, areaMap]);

  // === 2. Deelnemers per periode ===
  const deelnemerData = useMemo(() => {
    const map = new Map<string, Map<string, Set<string>>>();
    programClients.forEach((pc: any) => {
      const pk = periodKey(new Date(pc.enrolled_at ?? pc.created_at), gran);
      const bk = breakdown === "gebied" || breakdown === "school"
        ? breakdownKeyForProgram(pc.program_id)
        : breakdownKey(pc.client_id);
      if (!map.has(pk)) map.set(pk, new Map());
      const inner = map.get(pk)!;
      if (!inner.has(bk)) inner.set(bk, new Set());
      inner.get(bk)!.add(pc.client_id);
    });
    return map;
  }, [programClients, gran, breakdown, clientMap, schoolMap, areaMap, programMap]);

  // === 3. <80% aanwezigheid ===
  const lowAttendance = useMemo(() => {
    const cpMap = new Map<string, { total: number; present: number; clientId: string; programId: string }>();
    attendance.forEach((a: any) => {
      const progId = sessionProgramMap.get(a.session_id);
      if (!progId) return;
      const key = `${a.client_id}_${progId}`;
      if (!cpMap.has(key)) cpMap.set(key, { total: 0, present: 0, clientId: a.client_id, programId: progId });
      const entry = cpMap.get(key)!;
      entry.total++;
      if (a.present) entry.present++;
    });

    const results: any[] = [];
    cpMap.forEach((v) => {
      const pct = v.total > 0 ? (v.present / v.total) * 100 : 100;
      if (pct < 80 && v.total >= 2) {
        const c = clientMap.get(v.clientId);
        const p = programMap.get(v.programId);
        results.push({
          naam: c ? `${c.first_name} ${c.last_name}` : "?",
          programma: p?.name ?? "?",
          aanwezig: v.present,
          totaal: v.total,
          percentage: Math.round(pct),
          bk: breakdown === "school" ? schoolMap.get(c?.school_id)?.name ?? "Geen school"
            : breakdown === "gebied" ? areaMap.get(p?.area_id) ?? "Geen gebied"
            : breakdown === "leeftijd" ? ageCategory(c?.date_of_birth)
            : breakdown === "geslacht" ? genderLabel(c?.gender)
            : "Totaal",
        });
      }
    });
    results.sort((a, b) => a.percentage - b.percentage);
    return results;
  }, [attendance, sessionProgramMap, clientMap, programMap, breakdown, schoolMap, areaMap]);

  // === Monitoringslijst export ===
  const handleExportMonitoring = (programId: string) => {
    const program = programMap.get(programId);
    if (!program) return;

    const pClients = programClients.filter((pc: any) => pc.program_id === programId);
    const pSessions = sessions.filter((s: any) => s.program_id === programId);
    const trainers = programStaff
      .filter((ps: any) => ps.program_id === programId && ps.role !== "invaller")
      .map((ps: any) => (ps.staff as any)?.name ?? "")
      .filter(Boolean);

    // Build attendance per client
    const clientAttendance = new Map<string, { total: number; present: number }>();
    attendance.forEach((a: any) => {
      const progId = sessionProgramMap.get(a.session_id);
      if (progId !== programId) return;
      if (!clientAttendance.has(a.client_id)) clientAttendance.set(a.client_id, { total: 0, present: 0 });
      const entry = clientAttendance.get(a.client_id)!;
      entry.total++;
      if (a.present) entry.present++;
    });

    // Header info
    const headerData = [
      ["Naam interventie - Kanjertraining voor ouder en kind"],
      [],
      ["Gebied", program.areas?.name ?? ""],
      ["Uitvoeringslocatie", program.schools?.name ?? ""],
      ["Postcode", program.schools?.address ?? ""],
      ["Leeftijdscategorie", program.age_category ?? ""],
      ["Startdatum", program.start_date ?? ""],
      ["Einddatum", program.end_date ?? ""],
      ["Aantal bijeenkomsten", pSessions.length],
      ["Trainers", trainers.join(", ")],
      [],
      ["#", "Naam kind", "Gestart", "Reden niet gestart", "Actie niet gestart",
       "Aantal ouders deelgenomen", "Aantal bijeenkomsten deelgenomen", "Succesvol afgerond (80%)",
       "Voortijdig gestopt", "Reden voortijdig gestopt", "Actie voortijdig gestopt",
       "Doorverwezen naar", "Vervolgtraject",
       "KANVAS Ouder - Voormeting", "KANVAS Kind - Voormeting",
       "KANVAS Ouder - Nameting", "KANVAS Kind - Nameting",
       "Evaluatieformulier ingevuld ouders", "Cijfer tevredenheid ouders", "Cijfer tevredenheid kind"],
    ];

    // Client rows
    let totalGestart = 0, totalNietGestart = 0, totalAfgerond = 0, totalGestopt = 0;
    const clientRows = pClients.map((pc: any, i: number) => {
      const c = clientMap.get(pc.client_id);
      const att = clientAttendance.get(pc.client_id);
      const sessionsAttended = pc.sessions_attended ?? att?.present ?? 0;
      const totalSessions = pSessions.length;
      const pct = totalSessions > 0 ? (sessionsAttended / totalSessions) * 100 : 0;
      const completed = pc.successfully_completed ?? pct >= 80;
      const started = pc.started !== false;

      if (started) totalGestart++; else totalNietGestart++;
      if (completed && started) totalAfgerond++;
      if (pc.early_dropout) totalGestopt++;

      return [
        i + 1,
        c ? `${c.first_name} ${c.last_name}` : "?",
        started ? "Ja" : "Nee",
        pc.reason_not_started ?? "",
        pc.action_not_started ?? "",
        pc.parent_participants ?? "",
        sessionsAttended,
        completed ? "Ja" : "Nee",
        pc.early_dropout ? "Ja" : "Nee",
        pc.dropout_reason ?? "",
        pc.dropout_action ?? "",
        pc.referred_to ?? "",
        pc.follow_up_program ?? "",
        pc.kanvas_parent_pre ?? "",
        pc.kanvas_child_pre ?? "",
        pc.kanvas_parent_post ?? "",
        pc.kanvas_child_post ?? "",
        pc.evaluation_filled_parent ? "Ja" : "Nee",
        pc.satisfaction_parent ?? "",
        pc.satisfaction_child ?? "",
      ];
    });

    // Summary rows
    const summaryRows = [
      [],
      ["", "Totaal geplaatst:", pClients.length],
      ["", "Totaal gestart:", totalGestart],
      ["", "Totaal niet gestart:", totalNietGestart],
      ["", "Totaal tussentijds gestopt:", totalGestopt],
      ["", "Totaal afgerond:", totalAfgerond],
    ];

    const allRows = [...headerData, ...clientRows, ...summaryRows];

    const ws = XLSX.utils.aoa_to_sheet(allRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Monitoringslijst");

    // Set column widths
    ws["!cols"] = [
      { wch: 4 }, { wch: 25 }, { wch: 10 }, { wch: 25 }, { wch: 25 },
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 25 }, { wch: 25 },
      { wch: 20 }, { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
      { wch: 12 }, { wch: 12 }, { wch: 12 },
    ];

    XLSX.writeFile(wb, `Monitoringslijst_${program.name.replace(/\s+/g, "_")}.xlsx`);
  };

  // Helper to flatten pivot data to rows for table
  function pivotToRows(data: Map<string, Map<string, number | Set<string>>>, isSet = false) {
    const allKeys = new Set<string>();
    data.forEach((inner) => inner.forEach((_, k) => allKeys.add(k)));
    const categories = [...allKeys].sort();
    const periods = [...data.keys()].sort();

    const rows = periods.map((period) => {
      const row: Record<string, any> = { periode: period };
      let total = 0;
      categories.forEach((cat) => {
        const v = data.get(period)?.get(cat);
        const count = isSet ? (v as Set<string>)?.size ?? 0 : (v as number) ?? 0;
        row[cat] = count;
        total += count;
      });
      row._total = total;
      return row;
    });
    return { rows, categories, periods };
  }

  function exportTable(name: string, columns: ExportColumn[], rows: Record<string, any>[], fmt: "csv" | "xlsx") {
    downloadExport(`${name}.${fmt}`, columns, rows, fmt);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const aanmeld = pivotToRows(aanmeldData);
  const deelnemer = pivotToRows(deelnemerData, true);

  // Programs with enrolled clients (for monitoring export)
  const programsWithClients = programs.filter((p: any) =>
    programClients.some((pc: any) => pc.program_id === p.id)
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-foreground">Rapportages</h1>
        <p className="text-sm text-muted-foreground">Overzichten van aanmeldingen, deelnemers, aanwezigheid en facturen</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Select value={gran} onValueChange={(v) => setGran(v as Granularity)}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-popover">
            {(Object.keys(granularityLabel) as Granularity[]).map((g) => (
              <SelectItem key={g} value={g}>{granularityLabel[g]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={breakdown} onValueChange={(v) => setBreakdown(v as Breakdown)}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-popover">
            {(Object.keys(breakdownLabel) as Breakdown[]).map((b) => (
              <SelectItem key={b} value={b}>{breakdownLabel[b]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="aanmeldingen" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="aanmeldingen">Aanmeldingen</TabsTrigger>
          <TabsTrigger value="deelnemers">Deelnemers</TabsTrigger>
          <TabsTrigger value="aanwezigheid">Aanwezigheid &lt;80%</TabsTrigger>
          <TabsTrigger value="monitoringslijst">Monitoringslijst</TabsTrigger>
          <TabsTrigger value="facturen">Facturen</TabsTrigger>
        </TabsList>

        {/* Aanmeldingen tab */}
        <TabsContent value="aanmeldingen">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg font-bold text-card-foreground">Aanmeldingen per {granularityLabel[gran].toLowerCase()}</h2>
              <div className="flex gap-1">
                {(["csv", "xlsx"] as const).map((fmt) => (
                  <Button key={fmt} variant="ghost" size="sm" onClick={() => {
                    const cols: ExportColumn[] = [{ key: "periode", label: "Periode" }, ...aanmeld.categories.map((c) => ({ key: c, label: c })), { key: "_total", label: "Totaal" }];
                    exportTable("aanmeldingen", cols, aanmeld.rows, fmt);
                  }}>
                    <Download className="h-3.5 w-3.5 mr-1" />{fmt.toUpperCase()}
                  </Button>
                ))}
              </div>
            </div>
            <PivotTable data={aanmeld} />
          </Card>
        </TabsContent>

        {/* Deelnemers tab */}
        <TabsContent value="deelnemers">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg font-bold text-card-foreground">Deelnemers per {granularityLabel[gran].toLowerCase()}</h2>
              <div className="flex gap-1">
                {(["csv", "xlsx"] as const).map((fmt) => (
                  <Button key={fmt} variant="ghost" size="sm" onClick={() => {
                    const cols: ExportColumn[] = [{ key: "periode", label: "Periode" }, ...deelnemer.categories.map((c) => ({ key: c, label: c })), { key: "_total", label: "Totaal" }];
                    exportTable("deelnemers", cols, deelnemer.rows, fmt);
                  }}>
                    <Download className="h-3.5 w-3.5 mr-1" />{fmt.toUpperCase()}
                  </Button>
                ))}
              </div>
            </div>
            <PivotTable data={deelnemer} />
          </Card>
        </TabsContent>

        {/* Aanwezigheid <80% */}
        <TabsContent value="aanwezigheid">
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-lg font-bold text-card-foreground">Deelnemers met &lt;80% aanwezigheid</h2>
              <div className="flex gap-1">
                {(["csv", "xlsx"] as const).map((fmt) => (
                  <Button key={fmt} variant="ghost" size="sm" onClick={() => {
                    const cols: ExportColumn[] = [
                      { key: "naam", label: "Naam" }, { key: "programma", label: "Programma" },
                      { key: "bk", label: breakdownLabel[breakdown] },
                      { key: "aanwezig", label: "Aanwezig" }, { key: "totaal", label: "Totaal" },
                      { key: "percentage", label: "%" },
                    ];
                    exportTable("lage-aanwezigheid", cols, lowAttendance, fmt);
                  }}>
                    <Download className="h-3.5 w-3.5 mr-1" />{fmt.toUpperCase()}
                  </Button>
                ))}
              </div>
            </div>
            {lowAttendance.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Geen deelnemers met minder dan 80% aanwezigheid.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Naam</TableHead>
                      <TableHead>Programma</TableHead>
                      {breakdown !== "totaal" && <TableHead>{breakdownLabel[breakdown]}</TableHead>}
                      <TableHead className="text-right">Aanwezig</TableHead>
                      <TableHead className="text-right">Totaal</TableHead>
                      <TableHead className="text-right">%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lowAttendance.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{row.naam}</TableCell>
                        <TableCell>{row.programma}</TableCell>
                        {breakdown !== "totaal" && <TableCell>{row.bk}</TableCell>}
                        <TableCell className="text-right">{row.aanwezig}</TableCell>
                        <TableCell className="text-right">{row.totaal}</TableCell>
                        <TableCell className="text-right font-semibold text-destructive">{row.percentage}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Monitoringslijst tab */}
        <TabsContent value="monitoringslijst">
          <Card className="p-4">
            <div className="mb-4">
              <h2 className="font-display text-lg font-bold text-card-foreground">Monitoringslijst per training</h2>
              <p className="text-sm text-muted-foreground">Selecteer een training om de monitoringslijst te exporteren</p>
            </div>
            {programsWithClients.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Geen trainingen met deelnemers gevonden.</p>
            ) : (
              <div className="space-y-2">
                {programsWithClients.map((p: any) => {
                  const clientCount = programClients.filter((pc: any) => pc.program_id === p.id).length;
                  return (
                    <div key={p.id} className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-muted/30 transition-colors">
                      <div>
                        <p className="text-sm font-medium text-foreground">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.areas?.name ?? "Geen gebied"} • {clientCount} deelnemers
                          {p.start_date && ` • ${new Date(p.start_date).toLocaleDateString("nl-NL")}`}
                        </p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => handleExportMonitoring(p.id)}>
                        <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> Export XLSX
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Facturen tab */}
        <TabsContent value="facturen">
          <Card className="p-4">
            <InvoiceManager />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PivotTable({ data }: { data: { rows: Record<string, any>[]; categories: string[] } }) {
  if (data.rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Geen data beschikbaar.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Periode</TableHead>
            {data.categories.map((c) => (
              <TableHead key={c} className="text-right">{c}</TableHead>
            ))}
            <TableHead className="text-right font-bold">Totaal</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.rows.map((row) => (
            <TableRow key={row.periode}>
              <TableCell className="font-medium whitespace-nowrap">{row.periode}</TableCell>
              {data.categories.map((c) => (
                <TableCell key={c} className="text-right">{row[c] ?? 0}</TableCell>
              ))}
              <TableCell className="text-right font-bold">{row._total}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
