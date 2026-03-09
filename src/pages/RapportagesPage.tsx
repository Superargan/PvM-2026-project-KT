import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Loader2, BarChart3, Download, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadExport, ExportColumn } from "@/lib/csvExport";
import { useToast } from "@/hooks/use-toast";
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
      const { data, error } = await supabase.from("clients").select("id, first_name, last_name, created_at, date_of_birth, gender, school_id, postal_code, address, city, guardian_name, guardian_phone, guardian_email").eq("archived", false);
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
      const { data, error } = await supabase.from("programs").select("id, name, area_id, school_id, start_date, end_date, status, age_category, max_participants, areas(name), schools(name, address)").eq("archived", false);
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
      const { data, error } = await supabase.from("program_staff").select("program_id, staff_id, role, staff:staff!program_staff_staff_id_fkey(name, trade_name)");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: generatedDocs = [] } = useQuery({
    queryKey: ["rpt_generated_docs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("generated_documents")
        .select("id, staff_id, program_id, template_id, file_name, created_at, document_templates(category)")
        .not("staff_id", "is", null);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: docTemplates = [] } = useQuery({
    queryKey: ["rpt_doc_templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("document_templates").select("id, name, category");
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

    // Extract postcode from address (e.g. "Gordelweg 216, 3039 GA" -> "3039 GA")
    const addressStr = program.schools?.address ?? "";
    const postcodeMatch = addressStr.match(/\b(\d{4}\s?[A-Z]{2})\b/);
    const postcode = postcodeMatch ? postcodeMatch[1] : addressStr;

    // Header info
    const headerData: any[][] = [
      ["Naam interventie - Kanjertraining voor ouder en kind"],
      [],
      ["Gebied", program.areas?.name ?? "", "", "Gestart en zit in de groepsapp"],
      ["Uitvoeringslocatie", program.schools?.name ?? "", "", "Gestart, maar tussentijds gestopt"],
      ["Postcode", postcode, "", "Willen deze ronde niet mee doen, staat weer op wachtlijst of nieuwe lijst 2026"],
      ["Leeftijdscategorie", program.age_category ?? "", "", "Geen interesse meer"],
      ["Startdatum", program.start_date ?? "", "", "Niet te pakken gekregen"],
      ["Einddatum", program.end_date ?? "", "", "Vervolgtraject"],
      ["Aantal bijeenkomsten", pSessions.length],
      [],
      // Grouped headers row
      ["", "", "", "", "", "", "", "", "", "", "",
       "DOORVERWEZEN NAAR - VERVOLGTRAJECT", "",
       "KANVAS", "", "", "",
       "EVALUATIEFORMULIER - CLIENTTEVREDENHEID", "", ""],
      // Column headers
      ["", "Naam kind", "Gestart", "Reden niet gestart", "Actie niet gestart",
       "Aantal ouders die heeft deelgenomen aan interventie", "Aantal bijeenkomsten deelgenomen",
       "Succesvol afgerond Ja/Nee (80%)",
       "Voortijdig gestopt", "Reden voortijdig gestopt", "Actie voortijdig gestopt",
       "Doorverwezen naar", "Welk vervolgtraject",
       "KANVAS Ouder - Voormeting", "KANVAS Kind - Voormeting",
       "KANVAS Ouder - Nameting", "KANVAS Kind - Nameting",
       "Evaluatieformulier ingevuld ouders", "Cijfer clienttevredenheid ouders", "Cijfer clienttevredenheid kind"],
    ];

    // Client rows & stats collection
    let totalGestart = 0, totalNietGestart = 0, totalAfgerond = 0, totalGestopt = 0;
    let totalEvalIngevuld = 0, totalEvalNiet = 0;
    let sumSatisfactionParent = 0, countSatisfactionParent = 0;
    let sumSatisfactionChild = 0, countSatisfactionChild = 0;
    let totalKanvasPreWel = 0, totalKanvasPreNiet = 0;
    let totalKanvasPostWel = 0, totalKanvasPostNiet = 0;
    let sumKanvasParentPre = 0, countKanvasParentPre = 0;
    let sumKanvasChildPre = 0, countKanvasChildPre = 0;
    let sumKanvasParentPost = 0, countKanvasParentPost = 0;
    let sumKanvasChildPost = 0, countKanvasChildPost = 0;

    // Doorverwijzing categories
    const doorverwijzingCategories: Record<string, number> = {
      "SMW": 0, "CJG": 0, "Andere preventieve interventie": 0,
      "Wijkteam": 0, "Psycholoog": 0, "Veilig thuis/Jeugdbescherming": 0,
      "Anders namelijk": 0, "Niet van toepassing": 0,
    };

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

      // Evaluation stats
      if (pc.evaluation_filled_parent) {
        totalEvalIngevuld++;
      } else {
        totalEvalNiet++;
      }
      if (pc.satisfaction_parent != null) {
        sumSatisfactionParent += Number(pc.satisfaction_parent);
        countSatisfactionParent++;
      }
      if (pc.satisfaction_child != null) {
        sumSatisfactionChild += Number(pc.satisfaction_child);
        countSatisfactionChild++;
      }

      // KANVAS stats
      const hasPreParent = pc.kanvas_parent_pre != null;
      const hasPreChild = pc.kanvas_child_pre != null;
      const hasPre = hasPreParent || hasPreChild;
      const hasPostParent = pc.kanvas_parent_post != null;
      const hasPostChild = pc.kanvas_child_post != null;
      const hasPost = hasPostParent || hasPostChild;

      if (hasPre) totalKanvasPreWel++; else if (started) totalKanvasPreNiet++;
      if (hasPost) totalKanvasPostWel++; else if (started) totalKanvasPostNiet++;

      if (hasPreParent) { sumKanvasParentPre += Number(pc.kanvas_parent_pre); countKanvasParentPre++; }
      if (hasPreChild) { sumKanvasChildPre += Number(pc.kanvas_child_pre); countKanvasChildPre++; }
      if (hasPostParent) { sumKanvasParentPost += Number(pc.kanvas_parent_post); countKanvasParentPost++; }
      if (hasPostChild) { sumKanvasChildPost += Number(pc.kanvas_child_post); countKanvasChildPost++; }

      // Doorverwijzing
      const ref = pc.referred_to ?? "";
      if (ref) {
        const matched = Object.keys(doorverwijzingCategories).find(
          (k) => ref.toLowerCase().includes(k.toLowerCase())
        );
        if (matched) doorverwijzingCategories[matched]++;
        else doorverwijzingCategories["Anders namelijk"]++;
      }

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

    // Computed averages
    const avgKanvasParentPre = countKanvasParentPre > 0 ? (sumKanvasParentPre / countKanvasParentPre).toFixed(1) : "";
    const avgKanvasChildPre = countKanvasChildPre > 0 ? (sumKanvasChildPre / countKanvasChildPre).toFixed(1) : "";
    const avgKanvasParentPost = countKanvasParentPost > 0 ? (sumKanvasParentPost / countKanvasParentPost).toFixed(1) : "";
    const avgKanvasChildPost = countKanvasChildPost > 0 ? (sumKanvasChildPost / countKanvasChildPost).toFixed(1) : "";
    const avgKanvasPreTotal = (countKanvasParentPre + countKanvasChildPre) > 0
      ? ((sumKanvasParentPre + sumKanvasChildPre) / (countKanvasParentPre + countKanvasChildPre)).toFixed(1) : "";
    const avgKanvasPostTotal = (countKanvasParentPost + countKanvasChildPost) > 0
      ? ((sumKanvasParentPost + sumKanvasChildPost) / (countKanvasParentPost + countKanvasChildPost)).toFixed(1) : "";
    const avgKanvasVerschil = avgKanvasPreTotal && avgKanvasPostTotal
      ? (Number(avgKanvasPostTotal) - Number(avgKanvasPreTotal)).toFixed(1) : "";

    const avgSatisfactionParent = countSatisfactionParent > 0
      ? (sumSatisfactionParent / countSatisfactionParent).toFixed(1) : "";
    const avgSatisfactionChild = countSatisfactionChild > 0
      ? (sumSatisfactionChild / countSatisfactionChild).toFixed(1) : "";

    const percDeelname = pClients.length > 0 ? `${Math.round((totalGestart / pClients.length) * 100)}%` : "";
    const percUitval = totalGestart > 0 ? `${Math.round((totalGestopt / totalGestart) * 100)}%` : "";

    const totalDoorverwezen = Object.values(doorverwijzingCategories).reduce((a, b) => a + b, 0);

    // Summary rows matching reference template
    const summaryRows: any[][] = [
      [],
      // Totals row with column-aligned stats
      ["", "", `Totaal: ${totalGestart}`, "", `Totaal: ${totalNietGestart}`, "", "",
       `Totaal: ${totalAfgerond}`, `Totaal: ${totalGestopt}`, "", "",
       `Aantal doorverwezen naar:`, "", `Totaal: ${totalKanvasPreWel}`, "",
       `Totaal: ${totalKanvasPostWel}`, "", `Totaal: ${totalEvalIngevuld}`, "", `Totaal: ${countSatisfactionChild}`],
      ["", "", `Percentage deelname: ${percDeelname}`, "", "", "", "", "",
       `Uitvalpercentage: ${percUitval}`, "", "",
       `SMW: ${doorverwijzingCategories["SMW"]}`, "", "", "", "", "", "", "", ""],
      ["", `Totaal geplaatst: ${pClients.length}`, "", "", "", "", "", "", "", "", "",
       `CJG: ${doorverwijzingCategories["CJG"]}`, "",
       `Totaal STARTVRAGENLIJSTEN wel ingevuld: ${totalKanvasPreWel}`, "",
       `Totaal EINDVRAGENLIJSTEN wel ingevuld: ${totalKanvasPostWel}`, "",
       `Totaal wel ingevuld (Respons): ${totalEvalIngevuld}`,
       `Gemiddeld cijfer clienttevredenheid ouders: ${avgSatisfactionParent}`,
       `Gemiddeld cijfer clienttevredenheid kinderen: ${avgSatisfactionChild}`],
      ["", `Totaal gestart: ${totalGestart}`, "", "", "", "", "", "", "", "", "",
       `Andere preventieve interventie: ${doorverwijzingCategories["Andere preventieve interventie"]}`, "",
       `Totaal STARTVRAGENLIJSTEN niet ingevuld: ${totalKanvasPreNiet}`, "",
       `Totaal EINDVRAGENLIJSTEN niet ingevuld: ${totalKanvasPostNiet}`, "",
       `Totaal niet ingevuld (Respons): ${totalEvalNiet}`, "", ""],
      ["", `Totaal niet gestart: ${totalNietGestart}`, "", "", "", "", "", "", "", "", "",
       `Wijkteam: ${doorverwijzingCategories["Wijkteam"]}`, "", "", "", "", "", "", "", ""],
      ["", `Totaal tussentijds gestopt: ${totalGestopt}`, "", "", "", "", "", "", "", "", "",
       `Psycholoog: ${doorverwijzingCategories["Psycholoog"]}`, "",
       "Redenen niet ingevuld:", "", "Redenen niet ingevuld:", "",
       "Reden niet ingevuld:", "", "Reden geen respons:"],
      ["", `Totaal afgerond: ${totalAfgerond}`, "", "", "", "", "", "", "", "", "",
       `Veilig thuis/Jeugdbescherming: ${doorverwijzingCategories["Veilig thuis/Jeugdbescherming"]}`, "",
       "", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", "", "", "", "",
       `Anders namelijk: ${doorverwijzingCategories["Anders namelijk"]}`, "",
       "TOELICHTING KANVAS:", "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", "", "", "", "",
       `Niet van toepassing: ${doorverwijzingCategories["Niet van toepassing"]}`, "",
       `Gemiddeld effect - Voormeting: ${avgKanvasPreTotal}`, "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", "", "", "", "", "", "",
       `Gemiddeld effect - Nameting: ${avgKanvasPostTotal}`, "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", "", "", "", "",
       `Totaal doorverwezen: ${totalDoorverwezen}`, "",
       `Gemiddeld effect - Verschil: ${avgKanvasVerschil}`, "", "", "", "", "", ""],
      ["", "", "", "", "", "", "", "", "", "", "", "", "",
       "Toelichting:", "", "", "", "", "", ""],
    ];

    const allRows = [...headerData, ...clientRows, ...summaryRows];

    const ws = XLSX.utils.aoa_to_sheet(allRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Monitoringslijst");

    // Set column widths
    ws["!cols"] = [
      { wch: 4 }, { wch: 30 }, { wch: 22 }, { wch: 30 }, { wch: 30 },
      { wch: 18 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 28 }, { wch: 28 },
      { wch: 32 }, { wch: 24 }, { wch: 22 }, { wch: 22 }, { wch: 22 }, { wch: 22 },
      { wch: 26 }, { wch: 26 }, { wch: 26 },
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
          <TabsTrigger value="contracten">Contracten</TabsTrigger>
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

        {/* Contracten tab */}
        <TabsContent value="contracten">
          <Card className="p-4">
            <ContractenOverzicht
              programs={programs}
              programStaff={programStaff}
              generatedDocs={generatedDocs}
              areas={areas}
              docTemplates={docTemplates}
            />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ContractenOverzicht({ programs, programStaff, generatedDocs, areas, docTemplates }: {
  programs: any[];
  programStaff: any[];
  generatedDocs: any[];
  areas: any[];
  docTemplates: any[];
}) {
  const [statusFilter, setStatusFilter] = useState<string>("alle");
  const [viewMode, setViewMode] = useState<"ontbrekend" | "overzicht">("ontbrekend");
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const areaMap = useMemo(() => new Map(areas.map((a: any) => [a.id, a.name])), [areas]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Find template by category
  const voorovereenkomstTemplate = useMemo(() => docTemplates.find((t: any) => t.category === "voorovereenkomst"), [docTemplates]);
  const overeenkomstTemplate = useMemo(() => docTemplates.find((t: any) => t.category === "overeenkomst"), [docTemplates]);

  // Only count as "done" when the document has a signed version
  const staffHasVoorovereenkomst = useMemo(() => {
    const set = new Set<string>();
    generatedDocs.forEach((doc: any) => {
      if (!doc.staff_id) return;
      const cat = (doc.document_templates as any)?.category?.toLowerCase() ?? "";
      if (cat === "voorovereenkomst" && doc.signed_file_path) set.add(doc.staff_id);
    });
    return set;
  }, [generatedDocs]);

  const programStaffHasOvereenkomst = useMemo(() => {
    const set = new Set<string>();
    generatedDocs.forEach((doc: any) => {
      if (!doc.staff_id) return;
      const cat = (doc.document_templates as any)?.category?.toLowerCase() ?? "";
      if (cat === "overeenkomst" && doc.program_id && doc.signed_file_path) {
        set.add(`${doc.program_id}_${doc.staff_id}`);
      }
    });
    return set;
  }, [generatedDocs]);

  // Track whether a document has been generated (but not yet signed)
  const staffHasVoorovereenkomstGenerated = useMemo(() => {
    const set = new Set<string>();
    generatedDocs.forEach((doc: any) => {
      if (!doc.staff_id) return;
      const cat = (doc.document_templates as any)?.category?.toLowerCase() ?? "";
      if (cat === "voorovereenkomst") set.add(doc.staff_id);
    });
    return set;
  }, [generatedDocs]);

  const programStaffHasOvereenkomstGenerated = useMemo(() => {
    const set = new Set<string>();
    generatedDocs.forEach((doc: any) => {
      if (!doc.staff_id) return;
      const cat = (doc.document_templates as any)?.category?.toLowerCase() ?? "";
      if (cat === "overeenkomst" && doc.program_id) {
        set.add(`${doc.program_id}_${doc.staff_id}`);
      }
    });
    return set;
  }, [generatedDocs]);

  const checkExempt = (name: string, tradeName: string) =>
    tradeName.toLowerCase().replace(/\s/g, "").includes("praktijk4kids") ||
    name.toLowerCase().replace(/\s/g, "").includes("praktijk4kids");

  const rows = useMemo(() => {
    return programs
      .filter((p: any) => statusFilter === "alle" ? true : (p.status ?? "te_plannen") === statusFilter)
      .map((prog: any) => {
        const trainers = programStaff
          .filter((ps: any) => ps.program_id === prog.id && ps.role !== "invaller")
          .map((ps: any) => {
            const name = (ps.staff as any)?.name ?? "Onbekend";
            const tradeName = (ps.staff as any)?.trade_name ?? "";
            const exempt = checkExempt(name, tradeName);
            return {
              staffId: ps.staff_id, name, tradeName, role: ps.role ?? "trainer", exempt,
              hasVoorovereenkomst: exempt || staffHasVoorovereenkomst.has(ps.staff_id),
              hasOvereenkomst: exempt || programStaffHasOvereenkomst.has(`${prog.id}_${ps.staff_id}`),
              voorovereenkomstGenerated: staffHasVoorovereenkomstGenerated.has(ps.staff_id),
              overeenkomstGenerated: programStaffHasOvereenkomstGenerated.has(`${prog.id}_${ps.staff_id}`),
            };
          });
        return {
          id: prog.id, name: prog.name, trainingNumber: (prog as any).training_number ?? "",
          status: prog.status ?? "te_plannen", area: areaMap.get(prog.area_id) ?? "", trainers,
        };
      })
      .filter((r) => r.status === "gestart" || r.status === "afgerond" || r.trainers.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [programs, programStaff, staffHasVoorovereenkomst, programStaffHasOvereenkomst, statusFilter, areaMap]);

  const missingVoor = useMemo(() => {
    const seen = new Map<string, { staffId: string; name: string; tradeName: string; programs: string[] }>();
    rows.forEach((row) => row.trainers.forEach((t: any) => {
      if (!t.hasVoorovereenkomst && !t.exempt) {
        if (!seen.has(t.staffId)) seen.set(t.staffId, { staffId: t.staffId, name: t.name, tradeName: t.tradeName, programs: [] });
        seen.get(t.staffId)!.programs.push(row.name);
      }
    }));
    return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);

  const missingOvk = useMemo(() => {
    const list: { programId: string; programName: string; trainingNumber: string; staffId: string; trainerName: string; role: string }[] = [];
    rows.forEach((row) => row.trainers.forEach((t: any) => {
      if (!t.hasOvereenkomst && !t.exempt)
        list.push({ programId: row.id, programName: row.name, trainingNumber: row.trainingNumber, staffId: t.staffId, trainerName: t.name, role: t.role });
    }));
    return list;
  }, [rows]);

  // Voorovereenkomsten: count per unique trainer (not per slot)
  const uniqueTrainers = useMemo(() => {
    const map = new Map<string, { exempt: boolean; has: boolean }>();
    rows.forEach((r) => r.trainers.forEach((t: any) => {
      if (!map.has(t.staffId)) map.set(t.staffId, { exempt: t.exempt, has: t.hasVoorovereenkomst });
    }));
    return map;
  }, [rows]);
  const totalUniqueTrainers = [...uniqueTrainers.values()].filter((v) => !v.exempt).length;
  const voorOk = [...uniqueTrainers.values()].filter((v) => !v.exempt && v.has).length;

  // Overeenkomsten van opdracht: count per trainer-program combination
  const totalSlots = rows.reduce((s, r) => s + r.trainers.filter((t: any) => !t.exempt).length, 0);
  const ovkOk = rows.reduce((s, r) => s + r.trainers.filter((t: any) => !t.exempt && t.hasOvereenkomst).length, 0);

  const statusLabels: Record<string, string> = { te_plannen: "Te plannen", ingepland: "Ingepland", gestart: "Gestart", afgerond: "Afgerond" };

  const generateDocument = async (templateId: string, staffId: string, programId?: string) => {
    const key = programId ? `ovk_${programId}_${staffId}` : `voor_${staffId}`;
    setGeneratingIds((prev) => new Set(prev).add(key));
    try {
      const body: any = { template_id: templateId, staff_id: staffId, output_format: "docx" };
      if (programId) body.program_id = programId;
      const { data, error } = await supabase.functions.invoke("generate-document", { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Download the file
      const { data: fileData, error: dlError } = await supabase.storage
        .from("generated-documents")
        .download(data.file_path);
      if (!dlError && fileData) {
        const url = URL.createObjectURL(fileData);
        const a = document.createElement("a");
        a.href = url;
        a.download = data.file_name;
        a.click();
        URL.revokeObjectURL(url);
      }

      toast({ title: "Document aangemaakt", description: data.file_name });
      queryClient.invalidateQueries({ queryKey: ["rpt_generated_docs"] });
    } catch (err: any) {
      toast({ title: "Fout bij aanmaken", description: err.message, variant: "destructive" });
    } finally {
      setGeneratingIds((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  };

  const generateAllVoorovereenkomsten = async () => {
    if (!voorovereenkomstTemplate) {
      toast({ title: "Geen voorovereenkomst-template gevonden", variant: "destructive" });
      return;
    }
    for (const item of missingVoor) {
      await generateDocument(voorovereenkomstTemplate.id, item.staffId);
    }
  };

  const generateAllOvereenkomsten = async () => {
    if (!overeenkomstTemplate) {
      toast({ title: "Geen overeenkomst-template gevonden", variant: "destructive" });
      return;
    }
    for (const item of missingOvk) {
      await generateDocument(overeenkomstTemplate.id, item.staffId, item.programId);
    }
  };

  const handleExport = () => {
    const exportRows = rows.flatMap((r: any) =>
      r.trainers.length > 0
        ? r.trainers.map((t: any) => ({
            training: r.name, nummer: r.trainingNumber, status: statusLabels[r.status] ?? r.status, gebied: r.area,
            trainer: t.name, rol: t.role,
            voorovereenkomst: t.exempt ? "N.v.t." : t.hasVoorovereenkomst ? "Ja" : "Nee",
            overeenkomst: t.exempt ? "N.v.t." : t.hasOvereenkomst ? "Ja" : "Nee",
          }))
        : [{ training: r.name, nummer: r.trainingNumber, status: statusLabels[r.status] ?? r.status, gebied: r.area, trainer: "—", rol: "—", voorovereenkomst: "—", overeenkomst: "—" }]
    );
    downloadExport("contracten_overzicht.xlsx", [
      { key: "training", label: "Training" }, { key: "nummer", label: "Nummer" }, { key: "status", label: "Status" },
      { key: "gebied", label: "Gebied" }, { key: "trainer", label: "Trainer" }, { key: "rol", label: "Rol" },
      { key: "voorovereenkomst", label: "Voorovereenkomst" }, { key: "overeenkomst", label: "Overeenkomst" },
    ] as ExportColumn[], exportRows, "xlsx");
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Voorovereenkomsten</p>
          <p className="text-xl font-bold text-card-foreground">{voorOk} <span className="text-sm font-normal text-muted-foreground">/ {totalUniqueTrainers}</span></p>
          {missingVoor.length > 0 && <p className="text-xs text-destructive mt-1">{missingVoor.length} trainer(s) mist voorovereenkomst</p>}
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Overeenkomsten van opdracht</p>
          <p className="text-xl font-bold text-card-foreground">{ovkOk} <span className="text-sm font-normal text-muted-foreground">/ {totalSlots}</span></p>
          {missingOvk.length > 0 && <p className="text-xs text-destructive mt-1">{missingOvk.length} ontbrekend</p>}
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-xs text-muted-foreground">Trainingen</p>
          <p className="text-xl font-bold text-card-foreground">{rows.length}</p>
          <p className="text-xs text-muted-foreground mt-1">{rows.filter(r => r.trainers.length === 0).length} zonder trainers</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant={viewMode === "ontbrekend" ? "default" : "outline"} size="sm" onClick={() => setViewMode("ontbrekend")}>Ontbrekende contracten</Button>
          <Button variant={viewMode === "overzicht" ? "default" : "outline"} size="sm" onClick={() => setViewMode("overzicht")}>Volledig overzicht</Button>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-popover">
              <SelectItem value="alle">Alle statussen</SelectItem>
              <SelectItem value="te_plannen">Te plannen</SelectItem>
              <SelectItem value="ingepland">Ingepland</SelectItem>
              <SelectItem value="gestart">Gestart</SelectItem>
              <SelectItem value="afgerond">Afgerond</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleExport}><Download className="h-4 w-4" /> Excel</Button>
        </div>
      </div>

      {viewMode === "ontbrekend" ? (
        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-card-foreground flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-destructive" />
                Ontbrekende voorovereenkomsten ({missingVoor.length})
              </h4>
              {missingVoor.length > 0 && voorovereenkomstTemplate && (
                <Button size="sm" variant="outline" onClick={generateAllVoorovereenkomsten} disabled={generatingIds.size > 0}>
                  <FileText className="h-3.5 w-3.5 mr-1" /> Alle aanmaken
                </Button>
              )}
            </div>
            {missingVoor.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3 pl-4">✓ Alle trainers hebben een voorovereenkomst</p>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader><TableRow className="bg-muted/50">
                    <TableHead>Trainer</TableHead><TableHead>Handelsnaam</TableHead><TableHead>Gekoppeld aan trainingen</TableHead><TableHead className="w-[130px]"></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {missingVoor.map((item, i) => {
                      const key = `voor_${item.staffId}`;
                      const isGenerating = generatingIds.has(key);
                      return (
                        <TableRow key={i}>
                          <TableCell className="font-medium text-sm">{item.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{item.tradeName}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{item.programs.slice(0, 3).join(", ")}{item.programs.length > 3 ? ` +${item.programs.length - 3}` : ""}</TableCell>
                          <TableCell>
                            {voorovereenkomstTemplate ? (
                              <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={isGenerating}
                                onClick={() => generateDocument(voorovereenkomstTemplate.id, item.staffId)}>
                                {isGenerating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <FileText className="h-3 w-3 mr-1" />}
                                Aanmaken
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">Geen template</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-card-foreground flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-destructive" />
                Ontbrekende overeenkomsten van opdracht ({missingOvk.length})
              </h4>
              {missingOvk.length > 0 && overeenkomstTemplate && (
                <Button size="sm" variant="outline" onClick={generateAllOvereenkomsten} disabled={generatingIds.size > 0}>
                  <FileText className="h-3.5 w-3.5 mr-1" /> Alle aanmaken
                </Button>
              )}
            </div>
            {missingOvk.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3 pl-4">✓ Alle overeenkomsten van opdracht zijn aangemaakt</p>
            ) : (
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader><TableRow className="bg-muted/50">
                    <TableHead>Training</TableHead><TableHead>Nr.</TableHead><TableHead>Trainer</TableHead><TableHead>Rol</TableHead><TableHead className="w-[130px]"></TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {missingOvk.map((item, i) => {
                      const key = `ovk_${item.programId}_${item.staffId}`;
                      const isGenerating = generatingIds.has(key);
                      return (
                        <TableRow key={i}>
                          <TableCell className="font-medium text-sm">{item.programName}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{item.trainingNumber}</TableCell>
                          <TableCell className="text-sm">{item.trainerName}</TableCell>
                          <TableCell className="text-xs text-muted-foreground capitalize">{item.role}</TableCell>
                          <TableCell>
                            {overeenkomstTemplate ? (
                              <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={isGenerating}
                                onClick={() => generateDocument(overeenkomstTemplate.id, item.staffId, item.programId)}>
                                {isGenerating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <FileText className="h-3 w-3 mr-1" />}
                                Aanmaken
                              </Button>
                            ) : (
                              <span className="text-xs text-muted-foreground">Geen template</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      ) : (
        rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Geen programma's gevonden.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader><TableRow className="bg-muted/50">
                <TableHead>Training</TableHead><TableHead>Nr.</TableHead><TableHead>Status</TableHead>
                <TableHead>Gebied</TableHead><TableHead>Trainer</TableHead><TableHead>Rol</TableHead>
                <TableHead className="text-center">Voorovereenkomst</TableHead><TableHead className="text-center">Overeenkomst</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {rows.map((row: any) =>
                  row.trainers.length > 0
                    ? row.trainers.map((t: any, i: number) => (
                        <TableRow key={`${row.id}-${t.staffId}-${i}`}>
                          {i === 0 && (
                            <>
                              <TableCell rowSpan={row.trainers.length} className="font-medium align-top">{row.name}</TableCell>
                              <TableCell rowSpan={row.trainers.length} className="align-top text-xs text-muted-foreground">{row.trainingNumber}</TableCell>
                              <TableCell rowSpan={row.trainers.length} className="align-top">
                                <span className={`status-indicator ${row.status === "afgerond" || row.status === "gestart" ? "status-groen" : row.status === "ingepland" ? "status-oranje" : "status-rood"}`}>
                                  {statusLabels[row.status] ?? row.status}
                                </span>
                              </TableCell>
                              <TableCell rowSpan={row.trainers.length} className="align-top text-sm">{row.area}</TableCell>
                            </>
                          )}
                          <TableCell className="text-sm">{t.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground capitalize">{t.role}</TableCell>
                          <TableCell className="text-center">
                            {t.exempt ? <span className="text-xs text-muted-foreground">n.v.t.</span>
                              : t.hasVoorovereenkomst ? <span className="text-xs font-medium text-emerald-700">✓</span>
                              : (
                                <Button size="sm" variant="ghost" className="h-6 text-xs text-destructive" disabled={!voorovereenkomstTemplate || generatingIds.has(`voor_${t.staffId}`)}
                                  onClick={() => voorovereenkomstTemplate && generateDocument(voorovereenkomstTemplate.id, t.staffId)}>
                                  {generatingIds.has(`voor_${t.staffId}`) ? <Loader2 className="h-3 w-3 animate-spin" /> : "✗ Aanmaken"}
                                </Button>
                              )}
                          </TableCell>
                          <TableCell className="text-center">
                            {t.exempt ? <span className="text-xs text-muted-foreground">n.v.t.</span>
                              : t.hasOvereenkomst ? <span className="text-xs font-medium text-emerald-700">✓</span>
                              : (
                                <Button size="sm" variant="ghost" className="h-6 text-xs text-destructive" disabled={!overeenkomstTemplate || generatingIds.has(`ovk_${row.id}_${t.staffId}`)}
                                  onClick={() => overeenkomstTemplate && generateDocument(overeenkomstTemplate.id, t.staffId, row.id)}>
                                  {generatingIds.has(`ovk_${row.id}_${t.staffId}`) ? <Loader2 className="h-3 w-3 animate-spin" /> : "✗ Aanmaken"}
                                </Button>
                              )}
                          </TableCell>
                        </TableRow>
                      ))
                    : (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">{row.name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{row.trainingNumber}</TableCell>
                          <TableCell><span className={`status-indicator ${row.status === "afgerond" || row.status === "gestart" ? "status-groen" : row.status === "ingepland" ? "status-oranje" : "status-rood"}`}>{statusLabels[row.status] ?? row.status}</span></TableCell>
                          <TableCell className="text-sm">{row.area}</TableCell>
                          <TableCell colSpan={4} className="text-sm text-muted-foreground italic">Geen trainers gekoppeld</TableCell>
                        </TableRow>
                      )
                )}
              </TableBody>
            </Table>
          </div>
        )
      )}
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
