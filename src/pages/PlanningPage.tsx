import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval, parseISO, startOfMonth, endOfMonth, addMonths, subMonths, getDay } from "date-fns";
import {
  getAgeCategoryPlanning,
  buildAvailabilityByClient,
  buildPrefsByClientMap,
  getClientDataCompleteness,
  hasAvailabilityCoverage,
  type ClientDataCompleteness,
} from "@/lib/clientUtils";
import { clientKeys, areaKeys } from "@/lib/queryKeys";
import { nl } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, Users, Clock, Plus, X, FileSpreadsheet, Star, Palmtree, CalendarClock, AlertTriangle, ShieldAlert, MapPinOff, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import GroupComposer from "@/components/GroupComposer";
import AvailabilityManager from "@/components/AvailabilityManager";
import PlanningImport from "@/components/PlanningImport";
import WaitlistOverview from "@/components/WaitlistOverview";
import ClientFilters from "@/components/ClientFilters";
import { isSpecialDay } from "@/lib/holidays";

const trainerTypeLabels: Record<string, string> = {
  oudertrainer: "Oudertrainer",
  kindtrainer: "Kindtrainer",
  beide: "Ouder- & Kindtrainer",
};

const trainerTypeColors: Record<string, string> = {
  oudertrainer: "bg-purple-100 text-purple-800",
  kindtrainer: "bg-sky-100 text-sky-800",
  beide: "bg-indigo-100 text-indigo-800",
};

type ViewMode = "week" | "maand";

// Compact availability summary panel for a selected area+age
function AvailabilitySummaryPanel({ filterArea, filterAge, areaName }: { filterArea: string; filterAge: string; areaName: string }) {
  const { data: candidates = [] } = useQuery({
    queryKey: clientKeys.planningAvailPanel(filterArea, filterAge),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name, date_of_birth, waitlist_area_id, intake_status")
        .eq("archived", false)
        .in("intake_status", ["wachtlijst", "intake_afgerond"])
        .eq("waitlist_area_id", filterArea);
      if (error) throw error;
      return (data ?? []).filter((c: any) => {
        return getAgeCategoryPlanning(c.date_of_birth) === filterAge;
      });
    },
  });

  const candidateIds = candidates.map((c: any) => c.id);

  const { data: availData = [] } = useQuery({
    queryKey: clientKeys.planningAvailPanelData(candidateIds),
    enabled: candidateIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_availability")
        .select("client_id, available_date, start_time, end_time")
        .in("client_id", candidateIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const dayNames = ["Zo", "Ma", "Di", "Wo", "Do", "Vr", "Za"];
  const daySummary = useMemo(() => {
    const counts: Record<number, number> = {};
    const clientsPerDay: Record<number, Set<string>> = {};
    availData.forEach((a: any) => {
      const dow = getDay(parseISO(a.available_date));
      if (!clientsPerDay[dow]) clientsPerDay[dow] = new Set();
      clientsPerDay[dow].add(a.client_id);
    });
    for (let i = 0; i < 7; i++) {
      counts[i] = clientsPerDay[i]?.size ?? 0;
    }
    return counts;
  }, [availData]);

  const clientsWithAvail = new Set(availData.map((a: any) => a.client_id)).size;

  if (candidates.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center gap-2">
        <CalendarClock className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">
          Beschikbaarheid {areaName} · {filterAge}
        </span>
        <Badge variant="outline" className="text-xs ml-auto">
          {clientsWithAvail}/{candidates.length} met beschikbaarheid
        </Badge>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {[1, 2, 3, 4, 5, 6, 0].map(dow => {
          const count = daySummary[dow];
          const pct = candidates.length > 0 ? count / candidates.length : 0;
          return (
            <div key={dow} className="text-center">
              <div className="text-[10px] font-semibold text-muted-foreground mb-1">{dayNames[dow]}</div>
              <div
                className={`rounded-lg py-2 text-sm font-bold ${
                  pct >= 0.5
                    ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                    : count > 0
                    ? "bg-amber-100 text-amber-800 border border-amber-300"
                    : "bg-muted text-muted-foreground border border-border"
                }`}
              >
                {count}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Warning button component
function WarningButton({ count, label, icon: Icon, color, onClick }: {
  count: number;
  label: string;
  icon: any;
  color: "amber" | "red" | "blue" | "purple";
  onClick?: () => void;
}) {
  if (count === 0) return null;
  const colorMap = {
    amber: "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100",
    red: "bg-red-50 text-red-800 border-red-200 hover:bg-red-100",
    blue: "bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100",
    purple: "bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100",
  };
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${colorMap[color]}`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{count}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

export default function PlanningPage() {
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [filterArea, setFilterArea] = useState<string>("alle");
  const [filterAge, setFilterAge] = useState<string>("alle");
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [availType, setAvailType] = useState<"trainer" | "deelnemer">("trainer");
  const [selectedStaffId, setSelectedStaffId] = useState<string>("");
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [availDate, setAvailDate] = useState("");
  const [availStart, setAvailStart] = useState("09:00");
  const [availEnd, setAvailEnd] = useState("17:00");
  const [importOpen, setImportOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("groepen");
  const [showGroupComposer, setShowGroupComposer] = useState(false);
  const [overrideDialogOpen, setOverrideDialogOpen] = useState(false);
  const [overrideClientId, setOverrideClientId] = useState<string>("");
  const [overrideReason, setOverrideReason] = useState("");
  const [warningFilter, setWarningFilter] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = useAuth();

  const dateRange = useMemo(() => {
    if (viewMode === "week") {
      return { start: startOfWeek(currentDate, { weekStartsOn: 1 }), end: endOfWeek(currentDate, { weekStartsOn: 1 }) };
    }
    return { start: startOfMonth(currentDate), end: endOfMonth(currentDate) };
  }, [viewMode, currentDate]);

  const days = useMemo(() => eachDayOfInterval(dateRange), [dateRange]);

  const navigate_ = (dir: "prev" | "next") => {
    if (viewMode === "week") {
      setCurrentDate(dir === "prev" ? subWeeks(currentDate, 1) : addWeeks(currentDate, 1));
    } else {
      setCurrentDate(dir === "prev" ? subMonths(currentDate, 1) : addMonths(currentDate, 1));
    }
  };

  // === DATA QUERIES ===
  const { data: intakes = [] } = useQuery({
    queryKey: clientKeys.planningIntakes(dateRange.start.toISOString(), dateRange.end.toISOString()),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name, intake_status, intake_date, date_of_birth, schools(name), waitlist_area_id, areas:waitlist_area_id(name)")
        .eq("archived", false)
        .in("intake_status", ["intake_gepland", "intake", "intake_afgerond"])
        .gte("intake_date", format(dateRange.start, "yyyy-MM-dd"))
        .lte("intake_date", format(dateRange.end, "yyyy-MM-dd"));
      if (error) throw error;
      return data ?? [];
    },
  });

  const intakeClientIds = intakes.map((i: any) => i.id);
  const { data: intakeAssignments = [] } = useQuery({
    queryKey: ["planning-intake-assignments", intakeClientIds],
    enabled: intakeClientIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_assignments")
        .select("client_id, staff(name)")
        .in("client_id", intakeClientIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["planning-sessions", dateRange.start.toISOString(), dateRange.end.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("program_sessions")
        .select("id, session_number, session_date, location, program_id, programs(id, name, age_category, status, area_id, areas(name), schools(name))")
        .gte("session_date", format(dateRange.start, "yyyy-MM-dd"))
        .lte("session_date", format(dateRange.end, "yyyy-MM-dd"))
        .order("session_date");
      if (error) throw error;
      return data ?? [];
    },
  });

  const programIds = [...new Set(sessions.map((s: any) => s.program_id))];
  const { data: programStaff = [] } = useQuery({
    queryKey: ["planning-program-staff", programIds],
    enabled: programIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("program_staff")
        .select("program_id, session_id, role, staff_id, replaces_staff_id, staff!program_staff_staff_id_fkey(name, trainer_type)")
        .in("program_id", programIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: allTrainers = [] } = useQuery({
    queryKey: ["planning-trainers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("id, name, trainer_type, email")
        .eq("archived", false)
        .not("name", "is", null)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: availability = [], refetch: refetchAvailability } = useQuery({
    queryKey: ["planning-availability", dateRange.start.toISOString(), dateRange.end.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_availability")
        .select("id, staff_id, available_date, start_time, end_time, notes")
        .gte("available_date", format(dateRange.start, "yyyy-MM-dd"))
        .lte("available_date", format(dateRange.end, "yyyy-MM-dd"));
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: allClients = [] } = useQuery({
    queryKey: clientKeys.planning,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name, waitlist_area_id, neighborhood_id, date_of_birth, intake_status, school_id, areas:waitlist_area_id(name), schools(name)")
        .eq("archived", false)
        .in("intake_status", ["nieuw", "intake_gepland", "intake", "intake_afgerond", "actief", "wachtlijst"])
        .order("first_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: clientAvailability = [], refetch: refetchClientAvail } = useQuery({
    queryKey: ["planning-client-availability", dateRange.start.toISOString(), dateRange.end.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_availability")
        .select("id, client_id, available_date, start_time, end_time, notes")
        .gte("available_date", format(dateRange.start, "yyyy-MM-dd"))
        .lte("available_date", format(dateRange.end, "yyyy-MM-dd"));
      if (error) throw error;
      return data ?? [];
    },
  });

  // All client availability (no date filter) for warning calculations
  const { data: allClientAvailability = [] } = useQuery({
    queryKey: clientKeys.list("all-availability"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_availability")
        .select("client_id, available_date, start_time, end_time");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Client area preferences for warning calculations
  const { data: allPreferences = [] } = useQuery({
    queryKey: clientKeys.list("all-preferences"),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_area_preferences")
        .select("client_id, area_id, preference_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Override logs
  const { data: overrideLogs = [], refetch: refetchOverrides } = useQuery({
    queryKey: ["availability-override-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("availability_override_logs")
        .select("*")
        .eq("active", true);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Check if current user is admin
  const { data: isAdmin = false } = useQuery({
    queryKey: ["user-is-admin", session?.user?.id],
    enabled: !!session?.user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", session!.user.id)
        .eq("role", "admin");
      if (error) throw error;
      return (data ?? []).length > 0;
    },
  });

  const { data: areas = [] } = useQuery({
    queryKey: areaKeys.all,
    queryFn: async () => {
      const { data, error } = await supabase.from("areas").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // === DERIVED DATA ===
  const overriddenClientIds = useMemo(() => {
    return new Set(overrideLogs.map((o: any) => o.client_id as string));
  }, [overrideLogs]);

  const availByClient = useMemo(() => buildAvailabilityByClient(allClientAvailability), [allClientAvailability]);
  const prefsByClient = useMemo(() => buildPrefsByClientMap(allPreferences), [allPreferences]);

  // Warning counts
  const warningCounts = useMemo(() => {
    const planningClients = allClients.filter((c: any) => {
      const s = c.intake_status ?? "nieuw";
      return s === "intake_afgerond" || s === "wachtlijst";
    });

    let noAvail = 0;
    let unusableAvail = 0;
    let staleCoverage = 0;
    let noArea = 0;
    let overridden = 0;

    const noAvailIds: string[] = [];
    const unusableAvailIds: string[] = [];
    const staleCoverageIds: string[] = [];
    const noAreaIds: string[] = [];
    const overriddenIds: string[] = [];

    planningClients.forEach((c: any) => {
      const comp = getClientDataCompleteness(c, availByClient, prefsByClient, overriddenClientIds);

      if (comp.isOverridden) {
        overridden++;
        overriddenIds.push(c.id);
        return; // mutually exclusive
      }

      if (comp.requiresAvailability && !comp.hasAvailability) {
        noAvail++;
        noAvailIds.push(c.id);
      }

      // For "unusable": has raw records but none usable (buildAvailabilityByClient filtered all out)
      const rawRecords = allClientAvailability.filter((a: any) => a.client_id === c.id);
      if (rawRecords.length > 0 && !comp.hasUsableAvailability) {
        unusableAvail++;
        unusableAvailIds.push(c.id);
      }

      if (comp.hasUsableAvailability && !hasAvailabilityCoverage(availByClient[c.id])) {
        staleCoverage++;
        staleCoverageIds.push(c.id);
      }

      if (comp.requiresAvailability && !comp.hasArea) {
        noArea++;
        noAreaIds.push(c.id);
      }
    });

    return { noAvail, unusableAvail, staleCoverage, noArea, overridden, noAvailIds, unusableAvailIds, staleCoverageIds, noAreaIds, overriddenIds };
  }, [allClients, availByClient, prefsByClient, overriddenClientIds, allClientAvailability]);

  const intakeAssignmentMap = useMemo(() => {
    const map: Record<string, string[]> = {};
    intakeAssignments.forEach((a: any) => {
      if (!map[a.client_id]) map[a.client_id] = [];
      if (a.staff?.name) map[a.client_id].push(a.staff.name);
    });
    return map;
  }, [intakeAssignments]);

  const agendaByDay = useMemo(() => {
    const map: Record<string, { intakes: any[]; sessions: any[] }> = {};
    days.forEach((day) => {
      const key = format(day, "yyyy-MM-dd");
      map[key] = { intakes: [], sessions: [] };
    });
    intakes.forEach((intake: any) => {
      if (intake.intake_date && map[intake.intake_date]) {
        if (filterArea !== "alle" && intake.waitlist_area_id !== filterArea) return;
        map[intake.intake_date].intakes.push(intake);
      }
    });
    sessions.forEach((session: any) => {
      if (session.session_date && map[session.session_date]) {
        const prog = (session as any).programs;
        if (filterArea !== "alle" && prog?.area_id !== filterArea) return;
        if (filterAge !== "alle" && prog?.age_category !== filterAge) return;
        map[session.session_date].sessions.push(session);
      }
    });
    return map;
  }, [days, intakes, sessions, filterArea, filterAge]);

  const getStaffForSession = (programId: string, sessionId: string) => {
    const vaste = programStaff.filter((ps: any) => ps.program_id === programId && ps.session_id === null);
    const invallers = programStaff.filter((ps: any) => ps.program_id === programId && ps.session_id === sessionId);
    return { vaste, invallers };
  };

  const saveAvailability = async () => {
    if (availType === "trainer") {
      if (!selectedStaffId || !availDate) return;
      const { error } = await supabase.from("staff_availability").upsert({
        staff_id: selectedStaffId,
        available_date: availDate,
        start_time: availStart,
        end_time: availEnd,
      } as any, { onConflict: "staff_id,available_date" });
      if (error) {
        toast({ title: "Fout", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Beschikbaarheid trainer opgeslagen" });
        refetchAvailability();
        setAvailabilityOpen(false);
      }
    } else {
      if (!selectedClientId || !availDate) return;
      const { error } = await supabase.from("client_availability").upsert({
        client_id: selectedClientId,
        available_date: availDate,
        start_time: availStart,
        end_time: availEnd,
      } as any, { onConflict: "client_id,available_date" });
      if (error) {
        toast({ title: "Fout", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Beschikbaarheid deelnemer opgeslagen" });
        refetchClientAvail();
        setAvailabilityOpen(false);
      }
    }
  };

  const handleOverrideSave = async () => {
    if (!overrideClientId || !overrideReason.trim() || !session?.user?.id) return;

    // Deactivate existing
    await supabase
      .from("availability_override_logs")
      .update({ active: false })
      .eq("client_id", overrideClientId)
      .eq("active", true);

    const { error } = await supabase
      .from("availability_override_logs")
      .insert({
        client_id: overrideClientId,
        overridden_by: session.user.id,
        reason: overrideReason.trim(),
        override_type: "beschikbaarheid_verplichting",
        active: true,
      });

    if (error) {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Override opgeslagen" });
      refetchOverrides();
      setOverrideDialogOpen(false);
      setOverrideClientId("");
      setOverrideReason("");
    }
  };

  const today = format(new Date(), "yyyy-MM-dd");

  // Get warning client names for tooltip
  const getWarningClients = (ids: string[]) => {
    return ids.map((id) => {
      const c = allClients.find((cl: any) => cl.id === id);
      return c ? `${c.first_name} ${c.last_name}` : id;
    });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-foreground">Planning</h1>
          <p className="text-sm text-muted-foreground">Agenda, wachtlijst en beschikbaarheid</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <FileSpreadsheet className="h-4 w-4" /> Import
          </Button>
          <Button onClick={() => setAvailabilityOpen(true)} size="sm">
            <Plus className="h-4 w-4" /> Beschikbaarheid
          </Button>
        </div>
      </div>

      {/* Warning buttons */}
      <TooltipProvider>
        <div className="flex flex-wrap gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <WarningButton count={warningCounts.noAvail} label="Beschikbaarheid nog doorgeven" icon={AlertTriangle} color="amber" />
              </div>
            </TooltipTrigger>
            {warningCounts.noAvail > 0 && (
              <TooltipContent className="max-w-xs">
                <p className="text-xs font-medium mb-1">{warningCounts.noAvail} deelnemers zonder beschikbaarheid:</p>
                <p className="text-xs text-muted-foreground">{getWarningClients(warningCounts.noAvailIds).slice(0, 5).join(", ")}{warningCounts.noAvailIds.length > 5 ? ` +${warningCounts.noAvailIds.length - 5}` : ""}</p>
              </TooltipContent>
            )}
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <WarningButton count={warningCounts.unusableAvail} label="Onbruikbare beschikbaarheid" icon={ShieldAlert} color="red" />
              </div>
            </TooltipTrigger>
            {warningCounts.unusableAvail > 0 && (
              <TooltipContent className="max-w-xs">
                <p className="text-xs font-medium mb-1">{warningCounts.unusableAvail} deelnemers met onbruikbare beschikbaarheid:</p>
                <p className="text-xs text-muted-foreground">{getWarningClients(warningCounts.unusableAvailIds).slice(0, 5).join(", ")}{warningCounts.unusableAvailIds.length > 5 ? ` +${warningCounts.unusableAvailIds.length - 5}` : ""}</p>
              </TooltipContent>
            )}
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <WarningButton count={warningCounts.staleCoverage} label="Beschikbaarheid actualiseren" icon={RefreshCw} color="amber" />
              </div>
            </TooltipTrigger>
            {warningCounts.staleCoverage > 0 && (
              <TooltipContent className="max-w-xs">
                <p className="text-xs font-medium mb-1">{warningCounts.staleCoverage} deelnemers met verouderde beschikbaarheid:</p>
                <p className="text-xs text-muted-foreground">{getWarningClients(warningCounts.staleCoverageIds).slice(0, 5).join(", ")}{warningCounts.staleCoverageIds.length > 5 ? ` +${warningCounts.staleCoverageIds.length - 5}` : ""}</p>
              </TooltipContent>
            )}
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <WarningButton count={warningCounts.noArea} label="Geen gebied" icon={MapPinOff} color="blue" />
              </div>
            </TooltipTrigger>
            {warningCounts.noArea > 0 && (
              <TooltipContent className="max-w-xs">
                <p className="text-xs font-medium mb-1">{warningCounts.noArea} deelnemers zonder gebied:</p>
                <p className="text-xs text-muted-foreground">{getWarningClients(warningCounts.noAreaIds).slice(0, 5).join(", ")}{warningCounts.noAreaIds.length > 5 ? ` +${warningCounts.noAreaIds.length - 5}` : ""}</p>
              </TooltipContent>
            )}
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <WarningButton count={warningCounts.overridden} label="Overruled (admin)" icon={ShieldCheck} color="purple" />
              </div>
            </TooltipTrigger>
            {warningCounts.overridden > 0 && (
              <TooltipContent className="max-w-xs">
                <p className="text-xs font-medium mb-1">{warningCounts.overridden} deelnemers met admin override:</p>
                <p className="text-xs text-muted-foreground">{getWarningClients(warningCounts.overriddenIds).slice(0, 5).join(", ")}{warningCounts.overriddenIds.length > 5 ? ` +${warningCounts.overriddenIds.length - 5}` : ""}</p>
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      </TooltipProvider>

      {/* Global filters */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={filterArea} onValueChange={setFilterArea}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Gebied" /></SelectTrigger>
          <SelectContent className="bg-popover">
            <SelectItem value="alle">Alle gebieden</SelectItem>
            {areas.map((a: any) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterAge} onValueChange={setFilterAge}>
          <SelectTrigger className="w-32"><SelectValue placeholder="Leeftijd" /></SelectTrigger>
          <SelectContent className="bg-popover">
            <SelectItem value="alle">Alle leeftijden</SelectItem>
            <SelectItem value="5-7 jaar">5-7 jaar</SelectItem>
            <SelectItem value="8-12 jaar">8-12 jaar</SelectItem>
          </SelectContent>
        </Select>
        {(filterArea !== "alle" || filterAge !== "alle") && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterArea("alle"); setFilterAge("alle"); }}>
            <X className="h-3.5 w-3.5 mr-1" /> Wissen
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="groepen">
            <Users className="h-4 w-4 mr-1.5" />
            Wachtlijst & Groepen
          </TabsTrigger>
          <TabsTrigger value="beschikbaarheid">
            <Clock className="h-4 w-4 mr-1.5" />
            Beschikbaarheid
          </TabsTrigger>
          <TabsTrigger value="agenda">
            <CalendarDays className="h-4 w-4 mr-1.5" />
            Agenda
          </TabsTrigger>
        </TabsList>

        {/* === AGENDA TAB === */}
        <TabsContent value="agenda" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon" onClick={() => navigate_("prev")}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
                Vandaag
              </Button>
              <Button variant="outline" size="icon" onClick={() => navigate_("next")}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <span className="font-display text-base font-bold text-foreground capitalize">
              {viewMode === "week"
                ? `${format(dateRange.start, "d MMM", { locale: nl })} – ${format(dateRange.end, "d MMM yyyy", { locale: nl })}`
                : format(currentDate, "MMMM yyyy", { locale: nl })}
            </span>
            <div className="ml-auto">
              <Select value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="week">Week</SelectItem>
                  <SelectItem value="maand">Maand</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Week view — compact */}
          {viewMode === "week" ? (
            <div className="space-y-1">
              {days.map((day) => {
                const key = format(day, "yyyy-MM-dd");
                const items = agendaByDay[key];
                const isToday = key === today;
                const hasItems = items && (items.intakes.length > 0 || items.sessions.length > 0);
                const special = isSpecialDay(key);
                const hasHoliday = special.holidays.length > 0;
                const hasVacation = !!special.vacation;

                return (
                  <div
                    key={key}
                    className={`rounded-lg border ${isToday ? "border-primary bg-primary/5" : hasHoliday ? "border-destructive/30 bg-destructive/5" : hasVacation ? "border-muted-foreground/20 bg-muted/30" : "border-border bg-card"}`}
                  >
                    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/50">
                      <span className={`text-xs font-bold capitalize ${isToday ? "text-primary" : hasHoliday ? "text-destructive" : "text-foreground"}`}>
                        {format(day, "EEE d MMM", { locale: nl })}
                      </span>
                      {isToday && <Badge variant="default" className="text-[9px] px-1 py-0 h-4">Vandaag</Badge>}
                      {special.holidays.map((h, i) => (
                        <Badge key={i} variant="outline" className="text-[9px] px-1 py-0 h-4 border-destructive/40 text-destructive">
                          <Star className="h-2.5 w-2.5 mr-0.5" />{h.name}
                        </Badge>
                      ))}
                      {hasVacation && !hasHoliday && (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-muted-foreground/40 text-muted-foreground">
                          <Palmtree className="h-2.5 w-2.5 mr-0.5" />{special.vacation!.name}
                        </Badge>
                      )}
                    </div>

                    <div className="px-3 py-1.5 space-y-1">
                      {!hasItems && !hasHoliday && !hasVacation && (
                        <p className="text-[11px] text-muted-foreground py-0.5">Geen activiteiten</p>
                      )}
                      {!hasItems && (hasHoliday || hasVacation) && (
                        <p className="text-[11px] text-muted-foreground py-0.5">
                          {hasHoliday ? "Feestdag" : "Schoolvakantie"}
                        </p>
                      )}

                      {/* Intakes — compact row */}
                      {items?.intakes.map((intake: any) => (
                        <div
                          key={intake.id}
                          className="flex items-center gap-2 rounded-md bg-amber-50 border border-amber-200 px-2.5 py-1.5 cursor-pointer hover:bg-amber-100 transition-colors"
                          onClick={() => navigate(`/clienten/${intake.id}`)}
                        >
                          <Clock className="h-3.5 w-3.5 text-amber-700 shrink-0" />
                          <span className="text-xs font-semibold text-amber-900 truncate">
                            Intake: {intake.first_name} {intake.last_name}
                          </span>
                          <span className="text-[10px] text-amber-700 truncate ml-auto">
                            {intake.schools?.name ?? ""} {(intake as any).areas?.name ? `· ${(intake as any).areas.name}` : ""}
                          </span>
                          {(intakeAssignmentMap[intake.id] ?? []).map((name: string, i: number) => (
                            <Badge key={i} variant="secondary" className="text-[9px] h-4 shrink-0">{name}</Badge>
                          ))}
                        </div>
                      ))}

                      {/* Sessions — compact row */}
                      {items?.sessions.map((session: any) => {
                        const prog = (session as any).programs;
                        const { vaste, invallers } = getStaffForSession(session.program_id, session.id);
                        return (
                          <div
                            key={session.id}
                            className="flex items-center gap-2 rounded-md bg-sky-50 border border-sky-200 px-2.5 py-1.5 cursor-pointer hover:bg-sky-100 transition-colors"
                            onClick={() => navigate(`/programmas/${session.program_id}`)}
                          >
                            <CalendarDays className="h-3.5 w-3.5 text-sky-700 shrink-0" />
                            <span className="text-xs font-semibold text-sky-900 truncate">
                              {prog?.name ?? "Training"} — S{session.session_number}
                            </span>
                            <span className="text-[10px] text-sky-700 truncate">
                              {prog?.age_category ?? ""} {prog?.areas?.name ? `· ${prog.areas.name}` : ""}
                            </span>
                            <div className="flex gap-0.5 ml-auto shrink-0">
                              {vaste.slice(0, 2).map((ps: any) => (
                                <Badge key={ps.staff_id} className={`text-[9px] h-4 ${trainerTypeColors[(ps as any).staff?.trainer_type] ?? "bg-muted text-muted-foreground"}`}>
                                  {(ps as any).staff?.name?.split(" ")[0] ?? "?"}
                                </Badge>
                              ))}
                              {invallers.length > 0 && (
                                <Badge variant="outline" className="text-[9px] h-4 border-orange-300 text-orange-700">
                                  +{invallers.length} inval
                                </Badge>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Maand grid */
            <div className="grid grid-cols-7 gap-px bg-border rounded-xl overflow-hidden border border-border">
              {["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"].map((d) => (
                <div key={d} className="bg-muted/50 px-2 py-2 text-center text-xs font-semibold text-muted-foreground">{d}</div>
              ))}
              {(() => {
                const firstDow = (days[0].getDay() + 6) % 7;
                return Array.from({ length: firstDow }).map((_, i) => (
                  <div key={`pad-${i}`} className="bg-card min-h-[72px]" />
                ));
              })()}
              {days.map((day) => {
                const key = format(day, "yyyy-MM-dd");
                const items = agendaByDay[key];
                const isToday = key === today;
                const intakeCount = items?.intakes.length ?? 0;
                const sessionCount = items?.sessions.length ?? 0;
                const special = isSpecialDay(key);
                const hasHoliday = special.holidays.length > 0;
                const hasVacation = !!special.vacation;

                return (
                  <div
                    key={key}
                    className={`bg-card min-h-[72px] p-1.5 ${isToday ? "ring-2 ring-primary ring-inset" : ""} ${hasHoliday ? "bg-destructive/5" : hasVacation ? "bg-muted/40" : ""}`}
                  >
                    <span className={`text-xs font-semibold ${isToday ? "text-primary" : hasHoliday ? "text-destructive" : "text-foreground"}`}>
                      {format(day, "d")}
                    </span>
                    <div className="mt-0.5 space-y-0.5">
                      {hasHoliday && (
                        <div className="rounded bg-destructive/10 px-1 py-0.5 text-[9px] font-medium text-destructive truncate">
                          ⭐ {special.holidays[0].name}
                        </div>
                      )}
                      {hasVacation && !hasHoliday && (
                        <div className="rounded bg-muted px-1 py-0.5 text-[9px] font-medium text-muted-foreground truncate">
                          🌴
                        </div>
                      )}
                      {intakeCount > 0 && (
                        <div className="rounded bg-amber-100 px-1 py-0.5 text-[9px] font-medium text-amber-800">
                          {intakeCount}× intake
                        </div>
                      )}
                      {sessionCount > 0 && (
                        <div className="rounded bg-sky-100 px-1 py-0.5 text-[9px] font-medium text-sky-800">
                          {sessionCount}× sessie
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* === WACHTLIJST & GROEPEN TAB === */}
        <TabsContent value="groepen" className="space-y-6">
          {!showGroupComposer ? (
            <>
              <WaitlistOverview
                onSelectGroup={(areaId, age) => {
                  setFilterArea(areaId);
                  setFilterAge(age);
                  setShowGroupComposer(true);
                }}
                onViewAvailability={(areaId) => {
                  setFilterArea(areaId);
                  setActiveTab("beschikbaarheid");
                }}
              />

              {/* Compact availability summary when area+age filter is set */}
              {filterArea !== "alle" && filterAge !== "alle" && (
                <AvailabilitySummaryPanel
                  filterArea={filterArea}
                  filterAge={filterAge}
                  areaName={areas.find((a: any) => a.id === filterArea)?.name ?? ""}
                />
              )}

              <div className="flex justify-center">
                <Button onClick={() => setShowGroupComposer(true)} size="lg">
                  <Users className="h-4 w-4 mr-2" />
                  Groepen samenstellen
                </Button>
              </div>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => setShowGroupComposer(false)}>
                ← Terug naar overzicht
              </Button>
              <GroupComposer />
            </>
          )}
        </TabsContent>

        {/* === BESCHIKBAARHEID TAB (combined) === */}
        <TabsContent value="beschikbaarheid" className="space-y-6">
          {/* Sub-tabs via simple toggle */}
          <Tabs defaultValue="trainers" className="space-y-4">
            <TabsList className="h-9">
              <TabsTrigger value="trainers" className="text-xs">Trainers</TabsTrigger>
              <TabsTrigger value="deelnemers" className="text-xs">Deelnemers</TabsTrigger>
              <TabsTrigger value="invoer-trainer" className="text-xs">Invoer trainers</TabsTrigger>
              <TabsTrigger value="invoer-deelnemer" className="text-xs">Invoer deelnemers</TabsTrigger>
            </TabsList>

            <TabsContent value="trainers" className="space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate_("prev")}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setCurrentDate(new Date())}>Vandaag</Button>
                  <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate_("next")}>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <span className="text-sm font-semibold text-foreground capitalize">
                  {viewMode === "week"
                    ? `${format(dateRange.start, "d MMM", { locale: nl })} – ${format(dateRange.end, "d MMM yyyy", { locale: nl })}`
                    : format(currentDate, "MMMM yyyy", { locale: nl })}
                </span>
              </div>
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Trainer</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Type</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Beschikbaar</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sessies</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {allTrainers.map((trainer: any) => {
                      const trainerAvail = availability.filter((a: any) => a.staff_id === trainer.id);
                      const trainerSessions = programStaff.filter((ps: any) => ps.staff_id === trainer.id && ps.session_id === null);
                      const trainerInval = programStaff.filter((ps: any) => ps.staff_id === trainer.id && ps.session_id !== null);
                      return (
                        <tr key={trainer.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-3 py-2">
                            <p className="text-sm font-semibold text-foreground">{trainer.name}</p>
                          </td>
                          <td className="px-3 py-2">
                            {trainer.trainer_type ? (
                              <Badge className={`text-[10px] ${trainerTypeColors[trainer.trainer_type] ?? "bg-muted"}`}>
                                {trainerTypeLabels[trainer.trainer_type] ?? trainer.trainer_type}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex flex-wrap gap-1">
                              {trainerAvail.length > 0 ? trainerAvail.map((a: any) => (
                                <Badge key={a.id} variant="outline" className="text-[9px] border-emerald-300 text-emerald-700">
                                  {format(parseISO(a.available_date), "d MMM", { locale: nl })}
                                </Badge>
                              )) : (
                                <span className="text-[11px] text-muted-foreground">—</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <span className="text-sm text-foreground font-medium">
                              {trainerSessions.length}{trainerInval.length > 0 ? ` +${trainerInval.length}` : ""}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                    {allTrainers.length === 0 && (
                      <tr><td colSpan={4} className="px-3 py-6 text-center text-sm text-muted-foreground">Geen trainers</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            <TabsContent value="deelnemers" className="space-y-4">
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Deelnemer</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Gebied</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Beschikbaar</th>
                      {isAdmin && <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Override</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {allClients
                      .filter((c: any) => filterArea === "alle" || c.waitlist_area_id === filterArea)
                      .map((client: any) => {
                        const clientAvail = clientAvailability.filter((a: any) => a.client_id === client.id);
                        const hasOverride = overriddenClientIds.has(client.id);
                        const overrideLog = overrideLogs.find((o: any) => o.client_id === client.id);
                        return (
                          <tr key={client.id} className="hover:bg-muted/30 transition-colors">
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm font-semibold text-foreground">{client.first_name} {client.last_name}</p>
                                {hasOverride && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger>
                                        <Badge className="text-[9px] h-4 bg-purple-100 text-purple-800 border-purple-300">
                                          <ShieldCheck className="h-2.5 w-2.5 mr-0.5" />Override
                                        </Badge>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p className="text-xs">Reden: {overrideLog?.reason ?? "—"}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <span className="text-sm text-card-foreground">{(client as any).areas?.name ?? "—"}</span>
                            </td>
                            <td className="px-3 py-2">
                              <span className="text-xs text-muted-foreground">{client.intake_status ?? "—"}</span>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap gap-1">
                                {clientAvail.length > 0 ? clientAvail.map((a: any) => (
                                  <Badge key={a.id} variant="outline" className="text-[9px] border-emerald-300 text-emerald-700">
                                    {format(parseISO(a.available_date), "d MMM", { locale: nl })}
                                  </Badge>
                                )) : (
                                  <span className="text-[11px] text-muted-foreground">—</span>
                                )}
                              </div>
                            </td>
                            {isAdmin && (
                              <td className="px-3 py-2">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-xs h-7"
                                  onClick={() => {
                                    setOverrideClientId(client.id);
                                    setOverrideReason("");
                                    setOverrideDialogOpen(true);
                                  }}
                                >
                                  <ShieldCheck className="h-3 w-3 mr-1" />
                                  {hasOverride ? "Wijzig" : "Override"}
                                </Button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    {allClients.filter((c: any) => filterArea === "alle" || c.waitlist_area_id === filterArea).length === 0 && (
                      <tr><td colSpan={isAdmin ? 5 : 4} className="px-3 py-6 text-center text-sm text-muted-foreground">Geen deelnemers</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            <TabsContent value="invoer-trainer">
              <AvailabilityManager type="trainer" />
            </TabsContent>
            <TabsContent value="invoer-deelnemer">
              <AvailabilityManager type="deelnemer" />
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>

      {/* Beschikbaarheid dialog */}
      <Dialog open={availabilityOpen} onOpenChange={setAvailabilityOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Beschikbaarheid toevoegen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={availType} onValueChange={(v) => { setAvailType(v as "trainer" | "deelnemer"); setSelectedStaffId(""); setSelectedClientId(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="trainer">Trainer / Medewerker</SelectItem>
                  <SelectItem value="deelnemer">Deelnemer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {availType === "trainer" ? (
              <div className="space-y-1.5">
                <Label>Trainer</Label>
                <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
                  <SelectTrigger><SelectValue placeholder="Selecteer trainer..." /></SelectTrigger>
                  <SelectContent className="bg-popover">
                    {allTrainers.map((t: any) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Deelnemer</Label>
                <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                  <SelectTrigger><SelectValue placeholder="Selecteer deelnemer..." /></SelectTrigger>
                  <SelectContent className="bg-popover">
                    {allClients.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.first_name} {c.last_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Datum</Label>
              <Input type="date" value={availDate} onChange={(e) => setAvailDate(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Van</Label>
                <Input type="time" value={availStart} onChange={(e) => setAvailStart(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Tot</Label>
                <Input type="time" value={availEnd} onChange={(e) => setAvailEnd(e.target.value)} />
              </div>
            </div>
            <Button
              className="w-full"
              onClick={saveAvailability}
              disabled={(availType === "trainer" ? !selectedStaffId : !selectedClientId) || !availDate}
            >
              Opslaan
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Admin Override dialog */}
      <Dialog open={overrideDialogOpen} onOpenChange={setOverrideDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Admin override — beschikbaarheid</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Met een override wordt deze deelnemer als planbaar beschouwd, ongeacht ontbrekende beschikbaarheidsgegevens.
            </p>
            <div className="space-y-1.5">
              <Label>Deelnemer</Label>
              <p className="text-sm font-medium text-foreground">
                {allClients.find((c: any) => c.id === overrideClientId)
                  ? `${allClients.find((c: any) => c.id === overrideClientId)!.first_name} ${allClients.find((c: any) => c.id === overrideClientId)!.last_name}`
                  : "—"}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Reden (verplicht)</Label>
              <Textarea
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Bijv. beschikbaarheid telefonisch bevestigd..."
                rows={3}
              />
            </div>
            <Button
              className="w-full"
              onClick={handleOverrideSave}
              disabled={!overrideReason.trim()}
            >
              Override opslaan
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <PlanningImport open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
