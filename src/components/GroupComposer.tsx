import { useState, useMemo, useCallback, useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users, UserCog, Check, AlertTriangle, CalendarClock, Search, Calendar, Maximize2, FlaskConical, RotateCcw, CheckCircle2, Save, Upload, ShieldAlert, Download, Link2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import {
  calculateAge,
  getAgeCategoryPlanning,
  resolveAreaId,
  getMatchType,
  matchSortOrder,
  matchColors,
  statusBadgeStyles,
  getMissingFields,
  buildPrefsByClientMap,
  buildAvailabilityByClient,
  getTopAvailabilityOverlaps,
  getAlternativeWindowsForDay,
  validateScenario,
  type AgeCategory,
  type MatchType,
} from "@/lib/clientUtils";
import { clientKeys, areaKeys, scenarioKeys } from "@/lib/queryKeys";
import { downloadExport } from "@/lib/csvExport";

interface ClientWithMatch {
  client: any;
  matchType: MatchType;
  sortOrder: number;
}

interface GroupedClients {
  areaId: string;
  areaName: string;
  ageCategory: AgeCategory;
  clients: ClientWithMatch[];
  subGroupIndex: number;
  subGroupCount: number;
}

const MAX_GROUP_SIZE = 10;
const SUB_GROUP_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export interface GroupComposerHandle {
  triggerSave: () => Promise<boolean>;
  hasActiveSimulation: boolean;
  isDirty: boolean;
  hasUnsavedWork: boolean;
}

interface GroupComposerProps {
  activeScenarioId?: string | null;
  onSaveScenario?: (scenarioId: string) => void;
  onClearScenario?: () => void;
  onLoadScenario?: (scenarioId: string) => void;
  filterArea?: string;
  onFilterAreaChange?: (area: string) => void;
  filterAgeCategory?: AgeCategory;
  preLinkedProgramId?: string;
}

const GroupComposer = forwardRef<GroupComposerHandle, GroupComposerProps>(function GroupComposer({ activeScenarioId, onSaveScenario, onClearScenario, onLoadScenario, filterArea: externalFilterArea, onFilterAreaChange, filterAgeCategory, preLinkedProgramId }, ref) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedClients, setSelectedClients] = useState<Record<string, Set<string>>>({});
  const [selectedOudertrainer, setSelectedOudertrainer] = useState<Record<string, string>>({});
  const [selectedKindtrainer, setSelectedKindtrainer] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState<string | null>(null);
  const filterArea = externalFilterArea ?? "alle";
  const setFilterArea = onFilterAreaChange ?? (() => {});
  const [expandedReserve, setExpandedReserve] = useState<Set<string>>(new Set());
  const [selectedStartDate, setSelectedStartDate] = useState<Record<string, string>>({});
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [simulatedGroups, setSimulatedGroups] = useState<Map<string, { proposalIdx: number; suggestion: any }>>(new Map());
  const [expandedAlternatives, setExpandedAlternatives] = useState<Set<string>>(new Set());
  const [linkedPrograms, setLinkedPrograms] = useState<Record<string, string>>({}); // groupKey -> programId

  // Export state
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"xlsx" | "csv">("xlsx");
  const PLANNING_EXPORT_COLUMNS = [
    { key: "gebied", label: "Gebied", group: "Groep" },
    { key: "leeftijd", label: "Leeftijdscategorie", group: "Groep" },
    { key: "dag", label: "Dag", group: "Groep" },
    { key: "tijdstip", label: "Tijdstip", group: "Groep" },
    { key: "overlap", label: "Beschikbare deelnemers", group: "Groep" },
    { key: "groepsgrootte", label: "Groepsgrootte", group: "Groep" },
    { key: "status_groep", label: "Groepsstatus", group: "Groep" },
    { key: "naam", label: "Naam deelnemer", group: "Deelnemer" },
    { key: "geboortedatum", label: "Geboortedatum", group: "Deelnemer" },
    { key: "leeftijd_jr", label: "Leeftijd", group: "Deelnemer" },
    { key: "geslacht", label: "Geslacht", group: "Deelnemer" },
    { key: "school", label: "School", group: "Deelnemer" },
    { key: "intake_status", label: "Status deelnemer", group: "Deelnemer" },
    { key: "match_type", label: "Match type", group: "Deelnemer" },
    { key: "oudertrainer", label: "Oudertrainer", group: "Trainers" },
    { key: "kindtrainer", label: "Kindtrainer", group: "Trainers" },
    { key: "startdatum", label: "Vermoedelijke startdatum", group: "Overig" },
    { key: "voorstel_nr", label: "Voorstel nummer", group: "Overig" },
  ] as const;
  const [exportSelected, setExportSelected] = useState<Set<string>>(
    new Set(["gebied", "leeftijd", "dag", "tijdstip", "naam", "school", "intake_status", "match_type"])
  );
  const toggleExportCol = (key: string) => {
    setExportSelected(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  };
  const selectExportGroup = (group: string, checked: boolean) => {
    setExportSelected(prev => {
      const next = new Set(prev);
      for (const col of PLANNING_EXPORT_COLUMNS) {
        if (col.group === group) { if (checked) next.add(col.key); else next.delete(col.key); }
      }
      return next;
    });
  };

  // Scenario state
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [scenarioName, setScenarioName] = useState("");
  const [scenarioDescription, setScenarioDescription] = useState("");
  const [scenarioStatus, setScenarioStatus] = useState("concept");
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [convertResultDialog, setConvertResultDialog] = useState<any[] | null>(null);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string | null>(null);
  const [loadedScenarioName, setLoadedScenarioName] = useState<string | null>(null);
  const [loadedProformaNumber, setLoadedProformaNumber] = useState<string | null>(null);
  const [confirmCreateOpen, setConfirmCreateOpen] = useState(false);
  const [confirmCreateGroup, setConfirmCreateGroup] = useState<GroupedClients | null>(null);

  // Fetch waitlist clients
  const { data: waitlistClients = [] } = useQuery({
    queryKey: clientKeys.groupComposer,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name, date_of_birth, waitlist_area_id, all_areas_flexible, intake_status, school_id, neighborhood_id, neighborhoods:neighborhood_id(id, area_id, areas(id, name)), schools(id, name, neighborhood_id, neighborhoods(id, area_id, areas(id, name)))")
        .eq("archived", false)
        .in("intake_status", ["wachtlijst", "intake_afgerond"]);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch area preferences
  const { data: allPreferences = [] } = useQuery({
    queryKey: clientKeys.allAreaPreferences,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_area_preferences")
        .select("client_id, area_id, preference_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch areas
  const { data: areas = [] } = useQuery({
    queryKey: areaKeys.all,
    queryFn: async () => {
      const { data, error } = await supabase.from("areas").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch all client availability — paginated to avoid 1000-row limit
  const { data: allAvailability = [] } = useQuery({
    queryKey: clientKeys.allAvailability,
    queryFn: async () => {
      const results: any[] = [];
      let from = 0;
      const pageSize = 1000;
      while (true) {
        const { data, error } = await supabase
          .from("client_availability")
          .select("client_id, available_date, start_time, end_time")
          .range(from, from + pageSize - 1);
        if (error) throw error;
        if (data) results.push(...data);
        if (!data || data.length < pageSize) break;
        from += pageSize;
      }
      return results;
    },
  });

  // Fetch program_clients for "al ingepland" check (AC-2)
  const { data: programClients = [] } = useQuery({
    queryKey: ["program-clients-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("program_clients")
        .select("client_id, programs!inner(archived)")
        .eq("programs.archived", false);
      if (error) throw error;
      return data ?? [];
    },
  });

  const programClientIds = useMemo(() => new Set(programClients.map((pc: any) => pc.client_id)), [programClients]);

  // Fetch override logs
  const { data: overrideLogs = [] } = useQuery({
    queryKey: clientKeys.overrideLogs,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("availability_override_logs")
        .select("client_id")
        .eq("active", true);
      if (error) throw error;
      return data ?? [];
    },
  });

  const overriddenClientIds = useMemo(() => new Set(overrideLogs.map((o: any) => o.client_id as string)), [overrideLogs]);

  const availByClient = useMemo(() => buildAvailabilityByClient(allAvailability as any), [allAvailability]);
  const getSuggestions = (clientIds: Set<string>) => getTopAvailabilityOverlaps(clientIds, availByClient, 3, 90);

  const { data: allTrainers = [] } = useQuery({
    queryKey: ["group-composer-trainers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("id, name, trainer_type")
        .eq("archived", false)
        .not("name", "is", null)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch non-archived programs for linking
  const { data: linkablePrograms = [] } = useQuery({
    queryKey: ["linkable-programs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("programs")
        .select("id, name, area_id, age_category, status, training_number, areas(name)")
        .eq("archived", false)
        .order("training_number", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const prefsByClient = useMemo(() => buildPrefsByClientMap(allPreferences as any), [allPreferences]);

  const areaMap = useMemo(() => {
    const m: Record<string, string> = {};
    areas.forEach((a: any) => { m[a.id] = a.name; });
    return m;
  }, [areas]);

  const areaIds = useMemo(() => new Set(areas.map((a: any) => a.id as string)), [areas]);

  // Current state snapshot for dirty detection
  const getCurrentSnapshot = useCallback(() => {
    return JSON.stringify({
      simulatedGroups: Array.from(simulatedGroups.entries()),
      selectedClients: Object.fromEntries(
        Object.entries(selectedClients).map(([k, v]) => [k, Array.from(v)])
      ),
      linkedPrograms,
    });
  }, [simulatedGroups, selectedClients, linkedPrograms]);

  const isDirty = useMemo(() => {
    if (!activeScenarioId) return simulatedGroups.size > 0;
    const current = getCurrentSnapshot();
    return current !== lastSavedSnapshot;
  }, [activeScenarioId, getCurrentSnapshot, lastSavedSnapshot, simulatedGroups.size]);

  // Broad guard: blocks ALL definitive writes from non-definitive work states
  const canCreateDefinitiveGroup = useMemo(() => {
    if (isSimulating) return false; // active simulation
    if (isDirty) return false; // unsaved changes
    if (simulatedGroups.size > 0) return false; // non-saved proforma data
    if (activeScenarioId !== null) return false; // working from proforma context
    return true;
  }, [isSimulating, isDirty, simulatedGroups.size, activeScenarioId]);

  const getBlockReason = (): string => {
    if (isSimulating) return "Actieve simulatie — sla eerst op als proforma planning";
    if (isDirty) return "Onopgeslagen wijzigingen — sla eerst op";
    if (simulatedGroups.size > 0) return "Niet-opgeslagen proforma-data aanwezig";
    if (activeScenarioId !== null) return "Werkend vanuit proforma — gebruik 'Omzetten naar definitieve planning'";
    return "";
  };

  // Load scenario from DB
  useEffect(() => {
    if (!activeScenarioId) return;

    const loadScenario = async () => {
      const { data: scenario, error } = await supabase
        .from("simulation_scenarios")
        .select(`
          id, name, description, status, proforma_number,
          simulation_scenario_slots (
            id, area_id, age_category, label, mode, proposal_idx,
            day_name, start_time, end_time, confirmed, notes, linked_program_id,
            simulation_scenario_members (client_id, has_override)
          )
        `)
        .eq("id", activeScenarioId)
        .single();

      if (error || !scenario) {
        toast({ title: "Scenario niet gevonden", variant: "destructive" });
        return;
      }

      setLoadedScenarioName(scenario.name);
      setLoadedProformaNumber((scenario as any).proforma_number ?? null);
      setScenarioName(scenario.name);
      setScenarioDescription(scenario.description ?? "");
      setScenarioStatus(scenario.status);

      // Deserialize into simulatedGroups + selectedClients
      const newSimulated = new Map<string, { proposalIdx: number; suggestion: any }>();
      const newSelected: Record<string, Set<string>> = {};
      const newLinked: Record<string, string> = {};

      (scenario.simulation_scenario_slots ?? []).forEach((slot: any) => {
        const groupKey = `${slot.area_id}__${slot.age_category ?? ""}`;
        newSimulated.set(groupKey, {
          proposalIdx: slot.proposal_idx ?? 0,
          suggestion: slot.mode === "manual" ? {
            dayName: slot.day_name,
            startTime: slot.start_time,
            endTime: slot.end_time,
          } : null,
        });

        const memberIds = (slot.simulation_scenario_members ?? []).map((m: any) => m.client_id);
        newSelected[groupKey] = new Set(memberIds);

        if (slot.linked_program_id) {
          newLinked[groupKey] = slot.linked_program_id;
        }
      });

      setSimulatedGroups(newSimulated);
      setSelectedClients(newSelected);
      setLinkedPrograms(newLinked);

      // Set snapshot after loading
      setTimeout(() => {
        setLastSavedSnapshot(JSON.stringify({
          simulatedGroups: Array.from(newSimulated.entries()),
          selectedClients: Object.fromEntries(
            Object.entries(newSelected).map(([k, v]) => [k, Array.from(v)])
          ),
          linkedPrograms: newLinked,
        }));
      }, 0);
    };

    loadScenario();
  }, [activeScenarioId]);


  const simulatedClientIds = useMemo(() => {
    const ids = new Set<string>();
    simulatedGroups.forEach((val, simKey) => {
      const sel = selectedClients[simKey];
      if (sel) sel.forEach(id => ids.add(id));
    });
    return ids;
  }, [simulatedGroups, selectedClients]);

  const isSimulating = simulatedGroups.size > 0;

  // Group clients by area + age category
  const groups: GroupedClients[] = useMemo(() => {
    const result: GroupedClients[] = [];

    areas.forEach((area: any) => {
      const ageCategories: AgeCategory[] = ["4-7 jaar", "8-12 jaar"];
      ageCategories.forEach((ageCategory) => {
        const baseKey = `${area.id}__${ageCategory}`;
        // Check if any sub-group key is simulated
        const isSimulated = Array.from(simulatedGroups.keys()).some(k => k.startsWith(baseKey));
        const matchedClients: ClientWithMatch[] = [];

        waitlistClients.forEach((client: any) => {
          if (!isSimulated && simulatedClientIds.has(client.id)) return;
          const ageCat = getAgeCategoryPlanning(client.date_of_birth);
          if (ageCat !== ageCategory) return;
          const mt = getMatchType(client, area.id, prefsByClient);
          if (!mt) return;
          matchedClients.push({ client, matchType: mt, sortOrder: matchSortOrder[mt] });
        });

        if (matchedClients.length > 0) {
          matchedClients.sort((a, b) => a.sortOrder - b.sortOrder);

          if (matchedClients.length > MAX_GROUP_SIZE) {
            // Split into balanced sub-groups
            const subGroupCount = Math.ceil(matchedClients.length / MAX_GROUP_SIZE);
            const baseSize = Math.floor(matchedClients.length / subGroupCount);
            const remainder = matchedClients.length % subGroupCount;
            let offset = 0;

            for (let i = 0; i < subGroupCount; i++) {
              const size = baseSize + (i < remainder ? 1 : 0);
              const subClients = matchedClients.slice(offset, offset + size);
              offset += size;

              result.push({
                areaId: area.id,
                areaName: areaMap[area.id] ?? "Onbekend gebied",
                ageCategory,
                clients: subClients,
                subGroupIndex: i,
                subGroupCount,
              });
            }
          } else {
            result.push({
              areaId: area.id,
              areaName: areaMap[area.id] ?? "Onbekend gebied",
              ageCategory,
              clients: matchedClients,
              subGroupIndex: 0,
              subGroupCount: 1,
            });
          }
        }
      });
    });

    return result.sort((a, b) => b.clients.length - a.clients.length);
  }, [waitlistClients, areas, areaMap, prefsByClient, simulatedGroups, simulatedClientIds]);

  const unassigned = useMemo(() => {
    return waitlistClients.filter((c: any) => {
      if (simulatedClientIds.has(c.id)) return false;
      return !resolveAreaId(c) || !getAgeCategoryPlanning(c.date_of_birth);
    });
  }, [waitlistClients, simulatedClientIds]);

  const filteredGroups = useMemo(() => {
    let result = groups;
    if (filterArea !== "alle") result = result.filter(g => g.areaId === filterArea);
    if (filterAgeCategory) result = result.filter(g => g.ageCategory === filterAgeCategory);
    return result;
  }, [groups, filterArea, filterAgeCategory]);

  const toggleSimulation = (key: string, group: GroupedClients, proposalIdx: number, suggestion: any) => {
    setSimulatedGroups(prev => {
      const next = new Map(prev);
      const existing = next.get(key);
      if (existing && existing.proposalIdx === proposalIdx) {
        next.delete(key);
      } else {
        if (!selectedClients[key]) {
          setSelectedClients(sc => ({ ...sc, [key]: new Set(group.clients.map(cm => cm.client.id)) }));
        }
        next.set(key, { proposalIdx, suggestion });
      }
      return next;
    });
  };

  const resetSimulation = () => {
    setSimulatedGroups(new Map());
    setLinkedPrograms({});
    setLastSavedSnapshot(null);
    setLoadedScenarioName(null);
    onClearScenario?.();
  };

  const oudertrainers = useMemo(() => {
    return allTrainers.filter((t: any) =>
      !t.trainer_type || t.trainer_type === "oudertrainer" || t.trainer_type === "beide"
    );
  }, [allTrainers]);

  const kindtrainers = useMemo(() => {
    return allTrainers.filter((t: any) =>
      !t.trainer_type || t.trainer_type === "kindtrainer" || t.trainer_type === "beide"
    );
  }, [allTrainers]);

  const trainerLabel = (t: any) => {
    if (!t.trainer_type) return `${t.name} (type onbekend)`;
    return t.name;
  };

  const getGroupKey = (g: GroupedClients) => g.subGroupCount > 1 ? `${g.areaId}__${g.ageCategory}__${g.subGroupIndex}` : `${g.areaId}__${g.ageCategory}`;

  // Auto-link program when preLinkedProgramId is provided
  useEffect(() => {
    if (!preLinkedProgramId || filteredGroups.length === 0) return;
    setLinkedPrograms(prev => {
      const next = { ...prev };
      let changed = false;
      filteredGroups.forEach(g => {
        const key = getGroupKey(g);
        if (!next[key]) { next[key] = preLinkedProgramId; changed = true; }
      });
      return changed ? next : prev;
    });
  }, [preLinkedProgramId, filteredGroups]);

  const getSelectedForGroup = (g: GroupedClients): Set<string> => {
    const key = getGroupKey(g);
    if (!selectedClients[key]) {
      return new Set(g.clients.map((cm) => cm.client.id));
    }
    return selectedClients[key];
  };

  const toggleClient = (g: GroupedClients, clientId: string) => {
    const key = getGroupKey(g);
    const current = getSelectedForGroup(g);
    const next = new Set(current);
    if (next.has(clientId)) next.delete(clientId);
    else next.add(clientId);
    setSelectedClients(prev => ({ ...prev, [key]: next }));
  };

  const toggleAll = (g: GroupedClients) => {
    const key = getGroupKey(g);
    const current = getSelectedForGroup(g);
    if (current.size === g.clients.length) {
      setSelectedClients(prev => ({ ...prev, [key]: new Set() }));
    } else {
      setSelectedClients(prev => ({ ...prev, [key]: new Set(g.clients.map((cm) => cm.client.id)) }));
    }
  };

  const statusLabelsMap: Record<string, string> = {
    intake_afgerond: "Intake afgerond",
    wachtlijst: "Wachtlijst",
  };

  const handleExportPlanning = () => {
    const selected = PLANNING_EXPORT_COLUMNS.filter(c => exportSelected.has(c.key));
    if (selected.length === 0) return;

    const columns = selected.map(c => ({ key: c.key, label: c.label }));
    const rows: Record<string, any>[] = [];

    const groupsToExport = filteredGroups;

    for (const group of groupsToExport) {
      const key = getGroupKey(group);
      const groupSelected = getSelectedForGroup(group);
      const suggestions = getSuggestions(groupSelected);
      const simulated = simulatedGroups.get(key);
      const activeSuggestion = simulated?.suggestion ?? suggestions[0] ?? null;
      const statusInfo = getStatusInfo(groupSelected.size);

      const groupClients = group.clients.filter(cm => groupSelected.has(cm.client.id));

      if (groupClients.length === 0) continue;

      const oudertrainer = allTrainers.find((t: any) => t.id === selectedOudertrainer[key]);
      const kindtrainer = allTrainers.find((t: any) => t.id === selectedKindtrainer[key]);

      for (const cm of groupClients) {
        const { client, matchType } = cm;
        const row: Record<string, any> = {};
        for (const col of selected) {
          switch (col.key) {
            case "gebied": row[col.key] = group.areaName; break;
            case "leeftijd": row[col.key] = group.ageCategory; break;
            case "dag": row[col.key] = activeSuggestion?.dayName ?? "—"; break;
            case "tijdstip": row[col.key] = activeSuggestion ? `${activeSuggestion.startTime?.slice(0,5)} – ${activeSuggestion.endTime?.slice(0,5)}` : "—"; break;
            case "overlap": row[col.key] = activeSuggestion?.overlap ?? "—"; break;
            case "groepsgrootte": row[col.key] = groupSelected.size; break;
            case "status_groep": row[col.key] = groupSelected.size >= 7 ? "Gereed" : groupSelected.size >= 5 ? "Bijna gereed" : "Te weinig"; break;
            case "naam": row[col.key] = `${client.first_name} ${client.last_name}`; break;
            case "geboortedatum": row[col.key] = client.date_of_birth ? new Date(client.date_of_birth).toLocaleDateString("nl-NL") : ""; break;
            case "leeftijd_jr": row[col.key] = calculateAge(client.date_of_birth) ?? ""; break;
            case "geslacht": row[col.key] = client.gender ?? ""; break;
            case "school": row[col.key] = client.schools?.name ?? ""; break;
            case "intake_status": row[col.key] = statusLabelsMap[client.intake_status] ?? client.intake_status ?? ""; break;
            case "match_type": row[col.key] = matchType; break;
            case "oudertrainer": row[col.key] = oudertrainer?.name ?? ""; break;
            case "kindtrainer": row[col.key] = kindtrainer?.name ?? ""; break;
            case "startdatum": row[col.key] = selectedStartDate[key] ? new Date(selectedStartDate[key]).toLocaleDateString("nl-NL") : ""; break;
            case "voorstel_nr": row[col.key] = simulated ? simulated.proposalIdx + 1 : (suggestions.length > 0 ? 1 : ""); break;
          }
        }
        rows.push(row);
      }
    }

    downloadExport(`planning-groepen.${exportFormat}`, columns, rows, exportFormat);
    setExportOpen(false);
  };

  const getStatusInfo = (count: number) => {
    if (count >= 7) return { color: "text-emerald-700 bg-emerald-50 border-emerald-200", label: "Gereed om te starten", icon: <Check className="h-4 w-4" /> };
    if (count >= 5) return { color: "text-amber-700 bg-amber-50 border-amber-200", label: `Nog ${7 - count} nodig`, icon: <AlertTriangle className="h-4 w-4" /> };
    return { color: "text-red-700 bg-red-50 border-red-200", label: `Nog ${7 - count} nodig`, icon: <AlertTriangle className="h-4 w-4" /> };
  };

  const toggleReserveSearch = (key: string) => {
    setExpandedReserve(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const getReserveCandidates = (group: GroupedClients): ClientWithMatch[] => {
    const existingIds = new Set(group.clients.map(cm => cm.client.id));
    const candidates: ClientWithMatch[] = [];

    waitlistClients.forEach((client: any) => {
      if (existingIds.has(client.id)) return;
      const ageCat = getAgeCategoryPlanning(client.date_of_birth);
      if (ageCat !== group.ageCategory) return;

      const prefs = prefsByClient[client.id];
      if (prefs && prefs[group.areaId]) {
        const order = prefs[group.areaId];
        const mt: MatchType = order === 1 ? "Reserve 1" : order === 2 ? "Reserve 2" : "Reserve 3";
        candidates.push({ client, matchType: mt, sortOrder: matchSortOrder[mt] });
        return;
      }
      if (client.all_areas_flexible) {
        candidates.push({ client, matchType: "Flexibel", sortOrder: matchSortOrder["Flexibel"] });
      }
    });

    candidates.sort((a, b) => a.sortOrder - b.sortOrder);
    return candidates;
  };

  // === SCENARIO SAVE ===
  const handleSaveScenario = async (): Promise<boolean> => {
    if (!scenarioName.trim()) {
      toast({ title: "Vul een naam in", variant: "destructive" });
      return false;
    }

    setSaving(true);
    try {
      // Serialize simulatedGroups + selectedClients into slots + members
      const slots: any[] = [];
      simulatedGroups.forEach((val, groupKey) => {
        const [areaId, ageCategory] = groupKey.split("__");
        const members = Array.from(selectedClients[groupKey] ?? []).map(clientId => ({
          client_id: clientId,
          has_override: overriddenClientIds.has(clientId),
        }));

        slots.push({
          area_id: areaId,
          age_category: ageCategory || null,
          label: null,
          mode: val.suggestion ? "manual" : "proposal",
          proposal_idx: val.suggestion ? null : val.proposalIdx,
          day_name: val.suggestion?.dayName ? (
            val.suggestion.dayName === "maandag" ? "ma" :
            val.suggestion.dayName === "dinsdag" ? "di" :
            val.suggestion.dayName === "woensdag" ? "wo" :
            val.suggestion.dayName === "donderdag" ? "do" :
            val.suggestion.dayName === "vrijdag" ? "vr" :
            val.suggestion.dayName
          ) : null,
          start_time: val.suggestion?.startTime ?? null,
          end_time: val.suggestion?.endTime ?? null,
           confirmed: false,
           notes: null,
           linked_program_id: linkedPrograms[groupKey] ?? null,
           members,
        });
      });

      const { data, error } = await supabase.rpc("save_scenario", {
        p_scenario_id: activeScenarioId ?? null,
        p_name: scenarioName,
        p_description: scenarioDescription || null,
        p_status: scenarioStatus,
        p_slots: slots,
      });

      if (error) throw error;

      const savedId = data as string;
      toast({ title: activeScenarioId ? "Scenario bijgewerkt" : "Scenario opgeslagen" });
      queryClient.invalidateQueries({ queryKey: scenarioKeys.all });

      // Update snapshot
      setLastSavedSnapshot(getCurrentSnapshot());
      setLoadedScenarioName(scenarioName);
      onSaveScenario?.(savedId);
      setSaveDialogOpen(false);
      return true;
    } catch (err: any) {
      toast({ title: "Fout bij opslaan", description: err.message, variant: "destructive" });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const hasUnsavedWork = simulatedGroups.size > 0 || isDirty;

  // Expose save + active simulation state to parent via ref
  useImperativeHandle(ref, () => ({
    triggerSave: async () => {
      if (scenarioName.trim()) {
        return handleSaveScenario();
      }
      setSaveDialogOpen(true);
      return false;
    },
    hasActiveSimulation: isSimulating,
    isDirty,
    hasUnsavedWork,
  }), [isSimulating, scenarioName, isDirty, hasUnsavedWork]);

  // === SCENARIO CONVERT ===
  const handleConvert = async () => {
    if (!activeScenarioId) {
      toast({ title: "Sla eerst het scenario op", variant: "destructive" });
      return;
    }
    if (isDirty) {
      toast({ title: "Sla eerst op", description: "Er zijn onopgeslagen wijzigingen.", variant: "destructive" });
      return;
    }

    setConverting(true);
    try {
      // Fresh validation on DB data
      const { data: scenario, error: fetchErr } = await supabase
        .from("simulation_scenarios")
        .select(`
          id, validation_status,
          simulation_scenario_slots (
            id, area_id, age_category, mode, proposal_idx, day_name, start_time, end_time, confirmed,
            simulation_scenario_members (client_id, has_override)
          )
        `)
        .eq("id", activeScenarioId)
        .single();

      if (fetchErr || !scenario) throw fetchErr ?? new Error("Scenario niet gevonden");

      const slots = scenario.simulation_scenario_slots ?? [];
      const clientsMap: Record<string, any> = {};
      waitlistClients.forEach((c: any) => { clientsMap[c.id] = c; });

      // Fetch any scenario member clients not in waitlistClients
      const allMemberClientIds = slots.flatMap((s: any) =>
        (s.simulation_scenario_members ?? []).map((m: any) => m.client_id)
      );
      const missingIds = allMemberClientIds.filter((id: string) => !clientsMap[id]);
      if (missingIds.length > 0) {
        const { data: extraClients } = await supabase
          .from("clients")
          .select("id, first_name, last_name, date_of_birth, waitlist_area_id, all_areas_flexible, intake_status, school_id, neighborhood_id")
          .in("id", missingIds);
        (extraClients ?? []).forEach((c: any) => { clientsMap[c.id] = c; });
      }

      const membersBySlot: Record<string, { client_id: string; has_override: boolean }[]> = {};
      slots.forEach((s: any) => {
        membersBySlot[s.id] = (s.simulation_scenario_members ?? []).map((m: any) => ({
          client_id: m.client_id,
          has_override: m.has_override,
        }));
      });

      const validation = validateScenario(
        slots,
        membersBySlot,
        clientsMap,
        availByClient,
        prefsByClient,
        programClientIds,
        overriddenClientIds,
        areaIds
      );

      // Update validation in DB
      await supabase
        .from("simulation_scenarios")
        .update({
          validation_status: validation.status,
          validation_details: validation as any,
          last_validated_at: new Date().toISOString(),
        })
        .eq("id", activeScenarioId);

      if (validation.status === "ongeldig") {
        toast({
          title: "Omzetting geblokkeerd",
          description: "Het scenario is ongeldig. Los de problemen op en hervalideer.",
          variant: "destructive",
        });
        queryClient.invalidateQueries({ queryKey: scenarioKeys.all });
        return;
      }

      if (validation.status === "aandacht_vereist") {
        const proceed = window.confirm(
          "Het scenario vereist aandacht. Wil je toch doorgaan met omzetten?"
        );
        if (!proceed) return;
      }

      // Call convert RPC
      const { data: results, error: convertErr } = await supabase.rpc("convert_scenario_to_planning", {
        p_scenario_id: activeScenarioId,
      });

      if (convertErr) throw convertErr;

      setConvertResultDialog(results as any[]);
      queryClient.invalidateQueries({ queryKey: scenarioKeys.all });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    } catch (err: any) {
      toast({ title: "Fout bij omzetten", description: err.message, variant: "destructive" });
    } finally {
      setConverting(false);
    }
  };

  // === VALIDATE ===
  const handleValidate = async () => {
    if (!activeScenarioId) return;

    const { data: scenario, error } = await supabase
      .from("simulation_scenarios")
      .select(`
        id,
        simulation_scenario_slots (
          id, area_id, age_category, mode, proposal_idx, day_name, start_time, end_time,
          simulation_scenario_members (client_id, has_override)
        )
      `)
      .eq("id", activeScenarioId)
      .single();

    if (error || !scenario) {
      toast({ title: "Scenario niet gevonden", variant: "destructive" });
      return;
    }

    const slots = scenario.simulation_scenario_slots ?? [];
    const clientsMap: Record<string, any> = {};
    waitlistClients.forEach((c: any) => { clientsMap[c.id] = c; });

    // Fetch any scenario member clients not in waitlistClients
    const allMemberClientIds = slots.flatMap((s: any) =>
      (s.simulation_scenario_members ?? []).map((m: any) => m.client_id)
    );
    const missingIds = allMemberClientIds.filter((id: string) => !clientsMap[id]);
    if (missingIds.length > 0) {
      const { data: extraClients } = await supabase
        .from("clients")
        .select("id, first_name, last_name, date_of_birth, waitlist_area_id, all_areas_flexible, intake_status, school_id, neighborhood_id")
        .in("id", missingIds);
      (extraClients ?? []).forEach((c: any) => { clientsMap[c.id] = c; });
    }

    const membersBySlot: Record<string, { client_id: string; has_override: boolean }[]> = {};
    slots.forEach((s: any) => {
      membersBySlot[s.id] = (s.simulation_scenario_members ?? []).map((m: any) => ({
        client_id: m.client_id,
        has_override: m.has_override,
      }));
    });

    const validation = validateScenario(
      slots,
      membersBySlot,
      clientsMap,
      availByClient,
      prefsByClient,
      programClientIds,
      overriddenClientIds,
      areaIds
    );

    await supabase
      .from("simulation_scenarios")
      .update({
        validation_status: validation.status,
        validation_details: validation as any,
        last_validated_at: new Date().toISOString(),
      })
      .eq("id", activeScenarioId);

    queryClient.invalidateQueries({ queryKey: scenarioKeys.all });
    toast({
      title: `Validatie: ${validation.status === "geldig" ? "Geldig ✓" : validation.status === "aandacht_vereist" ? "Aandacht vereist ⚠" : "Ongeldig ✗"}`,
    });
  };

  // Opens confirmation dialog before definitive group creation
  const requestCreateGroup = (g: GroupedClients) => {
    if (!canCreateDefinitiveGroup) {
      toast({ title: "Blokkade", description: getBlockReason(), variant: "destructive" });
      return;
    }
    const key = getGroupKey(g);
    const selected = getSelectedForGroup(g);
    if (selected.size === 0) {
      toast({ title: "Selecteer minimaal 1 aanmelder", variant: "destructive" });
      return;
    }
    setConfirmCreateGroup(g);
    setConfirmCreateOpen(true);
  };

  // DEFINITIEVE WRITE — creates program, program_clients, sets clients.intake_status = 'actief'
  const createGroup = async (g: GroupedClients) => {
    const key = getGroupKey(g);
    const selected = getSelectedForGroup(g);
    const oudertrainerId = selectedOudertrainer[key];
    const kindtrainerId = selectedKindtrainer[key];

    if (selected.size === 0) {
      toast({ title: "Selecteer minimaal 1 aanmelder", variant: "destructive" });
      return;
    }

    setCreating(key);

    try {
      const programName = `${g.areaName} – ${g.ageCategory}`;
      const { data: program, error: progErr } = await supabase
        .from("programs")
        .insert({
          name: programName,
          area_id: g.areaId,
          age_category: g.ageCategory,
          status: "te_plannen",
          max_participants: selected.size,
          start_date: selectedStartDate[key] || null,
        })
        .select("id")
        .single();

      if (progErr) throw progErr;

      const clientInserts = Array.from(selected).map(clientId => ({
        program_id: program.id,
        client_id: clientId,
      }));
      const { error: clientErr } = await supabase.from("program_clients").insert(clientInserts);
      if (clientErr) throw clientErr;

      const staffInserts: any[] = [];
      if (oudertrainerId) {
        staffInserts.push({ program_id: program.id, staff_id: oudertrainerId, role: "oudertrainer" });
      }
      if (kindtrainerId && kindtrainerId !== oudertrainerId) {
        staffInserts.push({ program_id: program.id, staff_id: kindtrainerId, role: "kindtrainer" });
      }
      if (staffInserts.length > 0) {
        const { error: staffErr } = await supabase.from("program_staff").insert(staffInserts);
        if (staffErr) throw staffErr;
      }

      const { error: updateErr } = await supabase
        .from("clients")
        .update({ intake_status: "actief" })
        .in("id", Array.from(selected));
      if (updateErr) throw updateErr;

      toast({ title: "Groep definitief aangemaakt", description: `${programName} met ${selected.size} deelnemers` });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      navigate(`/programmas/${program.id}`);
    } catch (err: any) {
      toast({ title: "Fout bij aanmaken", description: err.message, variant: "destructive" });
    } finally {
      setCreating(null);
    }
  };

  const renderClientRow = (cm: ClientWithMatch, group: GroupedClients, selected: Set<string>) => {
    const { client, matchType } = cm;
    const age = calculateAge(client.date_of_birth);
    const statusStyle = statusBadgeStyles[client.intake_status] ?? statusBadgeStyles.wachtlijst;

    return (
      <label
        key={client.id}
        className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 cursor-pointer transition-colors"
      >
        <Checkbox
          checked={selected.has(client.id)}
          onCheckedChange={() => toggleClient(group, client.id)}
        />
        <span className="text-sm text-foreground truncate">
          {client.first_name} {client.last_name}
        </span>
        <Badge
          variant="outline"
          className={`text-[10px] px-1.5 py-0 ml-auto shrink-0 ${statusStyle.className}`}
        >
          {statusStyle.label}
        </Badge>
        <Badge
          variant="outline"
          className={`text-[10px] px-1.5 py-0 shrink-0 ${matchColors[matchType]}`}
        >
          {matchType}
        </Badge>
        {age !== null && (
          <span className="text-xs text-muted-foreground shrink-0">{age}j</span>
        )}
      </label>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Stel automatisch groepen samen op basis van leeftijd en gebied. Inclusief reserve-voorkeuren en flexibele aanmelders.
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)} className="gap-1.5">
            <Download className="h-3.5 w-3.5" /> Exporteren
          </Button>
          <Select value={filterArea} onValueChange={setFilterArea}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Filter op gebied" /></SelectTrigger>
            <SelectContent className="bg-popover">
              <SelectItem value="alle">Alle gebieden</SelectItem>
              {areas.map((a: any) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary badges */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className="border-muted-foreground/30">
          <Users className="h-3 w-3 mr-1" />
          {waitlistClients.length} aanmelders
        </Badge>
        <Badge variant="outline" className="border-blue-300 text-blue-700">
          {waitlistClients.filter((c: any) => c.intake_status === "intake_afgerond").length} intake afgerond
        </Badge>
        <Badge variant="outline" className="border-orange-300 text-orange-700">
          {waitlistClients.filter((c: any) => c.intake_status === "wachtlijst").length} wachtlijst
        </Badge>
        <Badge variant="outline" className="border-emerald-300 text-emerald-700">
          {groups.filter(g => g.clients.length >= 7).length} groep(en) gereed
        </Badge>
        {unassigned.length > 0 && (
          <Badge variant="outline" className="border-amber-300 text-amber-700">
            {unassigned.length} zonder gebied/leeftijd
          </Badge>
        )}
      </div>

      {/* Simulation / proforma banner */}
      {isSimulating && (() => {
        const affectedAreas = new Set<string>();
        simulatedGroups.forEach((val, simKey) => {
          const areaId = simKey.split("__")[0];
          affectedAreas.add(areaId);
        });
        const otherGroupsInSameArea = filteredGroups.filter(g => {
          const gKey = getGroupKey(g);
          return !simulatedGroups.has(gKey) && affectedAreas.has(g.areaId);
        });
        const impactedCount = otherGroupsInSameArea.reduce((sum, g) => {
          const originalCount = waitlistClients.filter((c: any) => {
            const ageCat = getAgeCategoryPlanning(c.date_of_birth);
            if (ageCat !== g.ageCategory) return false;
            const mt = getMatchType(c, g.areaId, prefsByClient);
            return !!mt;
          }).length;
          return sum + Math.max(0, originalCount - g.clients.length);
        }, 0);

        return (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-foreground">
                  {loadedScenarioName
                    ? `Proforma planning: ${loadedScenarioName}`
                    : "Simulatie (niet opgeslagen)"
                  }
                  {" — "}{simulatedGroups.size} voorstel(len), {simulatedClientIds.size} deelnemers
                </span>
                {isDirty && (
                  <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 gap-0.5">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    Wijzigingen niet opgeslagen
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="sm" onClick={() => setSaveDialogOpen(true)} className="gap-1.5">
                  <Save className="h-3 w-3" /> Opslaan
                </Button>
                {activeScenarioId && (
                  <>
                    <Button variant="outline" size="sm" onClick={handleValidate} className="gap-1.5">
                      <CheckCircle2 className="h-3 w-3" /> Hervalideren
                    </Button>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Button
                              variant="default"
                              size="sm"
                              onClick={handleConvert}
                              disabled={isDirty || converting}
                              className="gap-1.5"
                            >
                              <Upload className="h-3 w-3" /> {converting ? "Omzetten..." : "Omzetten naar planning"}
                            </Button>
                          </span>
                        </TooltipTrigger>
                        {isDirty && (
                          <TooltipContent>
                            <p className="text-xs">Sla eerst op voordat je kunt omzetten</p>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TooltipProvider>
                  </>
                )}
                <Button variant="outline" size="sm" onClick={resetSimulation} className="gap-1.5">
                  <RotateCcw className="h-3 w-3" /> Reset
                </Button>
              </div>
            </div>
            {impactedCount > 0 && (
              <p className="text-xs text-muted-foreground pl-6">
                ↳ {impactedCount} deelnemer(s) weggevallen uit {otherGroupsInSameArea.length} andere groep(en) in {affectedAreas.size === 1 ? "hetzelfde gebied" : `${affectedAreas.size} gebieden`}
              </p>
            )}
            <div className="flex flex-wrap gap-1.5 pl-6">
              {Array.from(simulatedGroups.entries()).map(([simKey, val]) => {
                const parts = simKey.split("__");
                const areaName = areaMap[parts[0]] ?? "Onbekend";
                return (
                  <Badge key={simKey} variant="outline" className="text-xs border-primary/30 text-primary gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {areaName} · {parts[1]} — Voorstel {val.proposalIdx + 1}
                    {val.suggestion && <span className="text-muted-foreground">({val.suggestion.dayName} {val.suggestion.startTime?.slice(0,5)})</span>}
                  </Badge>
                );
              })}
            </div>
          </div>
        );
      })()}

      {filteredGroups.length === 0 && (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <Users className="h-10 w-10 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">
            Geen aanmelders gevonden die gegroepeerd kunnen worden.
          </p>
        </div>
      )}

      {/* Group cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {filteredGroups.map((group) => {
          const key = getGroupKey(group);
          const selected = getSelectedForGroup(group);
          const status = getStatusInfo(selected.size);
          const isCreating = creating === key;
          const intakeClients = group.clients.filter(cm => cm.client.intake_status === "intake_afgerond");
          const wachtlijstClients_ = group.clients.filter(cm => cm.client.intake_status !== "intake_afgerond");
          const showReserve = expandedReserve.has(key);
          const reserveCandidates = showReserve ? getReserveCandidates(group) : [];
          const isGroupSimulated = simulatedGroups.has(key);

          return (
            <Card key={key} className={`border-border ${expandedCard === key ? "col-span-2" : ""} ${isGroupSimulated ? "ring-2 ring-primary/40 bg-primary/[0.02]" : ""}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-base font-bold text-foreground">
                        {group.areaName} · {group.ageCategory}
                        {group.subGroupCount > 1 && (
                          <span className="ml-1 text-primary"> — Groep {SUB_GROUP_LABELS[group.subGroupIndex] ?? group.subGroupIndex + 1}</span>
                        )}
                      </CardTitle>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setExpandedCard(expandedCard === key ? null : key)}
                      >
                        <Maximize2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <span className="text-blue-700">{intakeClients.length} intake afgerond</span>
                      {wachtlijstClients_.length > 0 && (
                        <span className="text-orange-700 ml-1">· {wachtlijstClients_.length} wachtlijst</span>
                      )}
                    </p>
                  </div>
                  <Badge className={`${status.color} gap-1`}>
                    {status.icon}
                    {selected.size >= 7 ? `${selected.size} geselecteerd ✓` : status.label}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Aanmelders</span>
                    <button
                      className="text-xs text-primary hover:underline"
                      onClick={() => toggleAll(group)}
                    >
                      {selected.size === group.clients.length ? "Deselecteer alles" : "Selecteer alles"}
                    </button>
                  </div>
                  <div className="max-h-56 overflow-y-auto space-y-0.5 pr-1">
                    {intakeClients.length > 0 && (
                      <>
                        <div className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider px-2 pt-1 pb-0.5">
                          Intake afgerond ({intakeClients.length})
                        </div>
                        {intakeClients.map(cm => renderClientRow(cm, group, selected))}
                      </>
                    )}
                    {wachtlijstClients_.length > 0 && (
                      <>
                        <div className="text-[10px] font-semibold text-orange-700 uppercase tracking-wider px-2 pt-2 pb-0.5">
                          Wachtlijst ({wachtlijstClients_.length})
                        </div>
                        {wachtlijstClients_.map(cm => renderClientRow(cm, group, selected))}
                      </>
                    )}
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs gap-1.5"
                  onClick={() => toggleReserveSearch(key)}
                >
                  <Search className="h-3 w-3" />
                  {showReserve ? "Verberg reservegebied resultaten" : "Zoek op reservegebied"}
                </Button>

                {showReserve && (
                  <div className="rounded-lg border border-border bg-muted/20 p-2 space-y-1">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">
                      Extra kandidaten via reservegebied ({reserveCandidates.length})
                    </p>
                    {reserveCandidates.length === 0 ? (
                      <p className="text-xs text-muted-foreground px-1 py-1">Geen extra kandidaten gevonden.</p>
                    ) : (
                      <div className="max-h-32 overflow-y-auto space-y-0.5">
                        {reserveCandidates.map(cm => renderClientRow(cm, group, selected))}
                      </div>
                    )}
                  </div>
                )}

                {/* Link to existing program */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Link2 className="h-3 w-3" /> Koppelen aan programma
                  </label>
                  <div className="flex items-center gap-1.5">
                    {(() => {
                      const selectedProg = linkedPrograms[key] ? linkablePrograms.find((p: any) => p.id === linkedPrograms[key]) : null;
                      const matchingProgs = linkablePrograms.filter((p: any) => p.area_id === group.areaId && (!p.age_category || p.age_category === group.ageCategory));
                      const otherProgs = linkablePrograms.filter((p: any) => p.area_id !== group.areaId || (p.age_category && p.age_category !== group.ageCategory));
                      return (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" role="combobox" className="h-9 text-xs justify-between w-full font-normal">
                              {selectedProg ? (
                                <span className="truncate">{selectedProg.name} ({(selectedProg as any).training_number || selectedProg.status})</span>
                              ) : (
                                <span className="text-muted-foreground">Nieuw programma (standaard)</span>
                              )}
                              <Search className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[320px] p-0" align="start">
                            <Command>
                              <CommandInput placeholder="Zoek programma (bijv. 26)..." className="h-9 text-xs" />
                              <CommandList className="max-h-[250px]">
                                <CommandEmpty>Geen programma gevonden.</CommandEmpty>
                                <CommandGroup>
                                  <CommandItem
                                    value="__nieuw_programma__"
                                    onSelect={() => {
                                      setLinkedPrograms(prev => { const next = { ...prev }; delete next[key]; return next; });
                                    }}
                                  >
                                    <span className="text-muted-foreground">Nieuw programma aanmaken</span>
                                  </CommandItem>
                                </CommandGroup>
                                {matchingProgs.length > 0 && (
                                  <CommandGroup heading="Matching programma's">
                                    {matchingProgs.map((p: any) => (
                                      <CommandItem
                                        key={p.id}
                                        value={`${p.name} ${p.training_number ?? ''} ${p.status}`}
                                        onSelect={() => setLinkedPrograms(prev => ({ ...prev, [key]: p.id }))}
                                      >
                                        <Check className={`mr-1 h-3 w-3 ${linkedPrograms[key] === p.id ? "opacity-100" : "opacity-0"}`} />
                                        <span className="truncate">{p.name}</span>
                                        <span className="ml-auto text-[10px] text-muted-foreground">{p.status}</span>
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                )}
                                {otherProgs.length > 0 && (
                                  <>
                                    <CommandSeparator />
                                    <CommandGroup heading="Overige programma's">
                                      {otherProgs.map((p: any) => (
                                        <CommandItem
                                          key={p.id}
                                          value={`${p.name} ${p.training_number ?? ''} ${(p as any).areas?.name ?? ''} ${p.age_category ?? ''} ${p.status}`}
                                          onSelect={() => setLinkedPrograms(prev => ({ ...prev, [key]: p.id }))}
                                        >
                                          <Check className={`mr-1 h-3 w-3 ${linkedPrograms[key] === p.id ? "opacity-100" : "opacity-0"}`} />
                                          <span className="truncate">{p.name}</span>
                                          <span className="ml-auto text-[10px] text-muted-foreground">{(p as any).areas?.name ?? "?"}</span>
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </>
                                )}
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      );
                    })()}
                    {linkedPrograms[key] && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 shrink-0"
                        onClick={() => setLinkedPrograms(prev => { const next = { ...prev }; delete next[key]; return next; })}
                      >
                        <Unlink className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                  {linkedPrograms[key] && (
                    <p className="text-[10px] text-blue-700 flex items-center gap-1">
                      <Link2 className="h-3 w-3" />
                      Deelnemers worden bij omzetting <strong>toegevoegd</strong> aan dit programma
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Vermoedelijke startdatum
                  </label>
                  <Input
                    type="date"
                    className="h-9 text-xs"
                    value={selectedStartDate[key] ?? ""}
                    onChange={(e) => setSelectedStartDate(prev => ({ ...prev, [key]: e.target.value }))}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <UserCog className="h-3 w-3" /> Oudertrainer
                    </label>
                    <Select
                      value={selectedOudertrainer[key] ?? ""}
                      onValueChange={(v) => setSelectedOudertrainer(prev => ({ ...prev, [key]: v }))}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Selecteer..." />
                      </SelectTrigger>
                      <SelectContent className="bg-popover">
                        {oudertrainers.map((t: any) => (
                          <SelectItem key={t.id} value={t.id}>
                            {trainerLabel(t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <UserCog className="h-3 w-3" /> Kindtrainer
                    </label>
                    <Select
                      value={selectedKindtrainer[key] ?? ""}
                      onValueChange={(v) => setSelectedKindtrainer(prev => ({ ...prev, [key]: v }))}
                    >
                      <SelectTrigger className="h-9 text-xs">
                        <SelectValue placeholder="Selecteer..." />
                      </SelectTrigger>
                      <SelectContent className="bg-popover">
                        {kindtrainers.map((t: any) => (
                          <SelectItem key={t.id} value={t.id}>
                            {trainerLabel(t)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {(() => {
                  const suggestions = getSuggestions(selected);
                  const clientsWithAvail = Array.from(selected).filter(id => availByClient[id]?.length > 0).length;
                  const simulated = simulatedGroups.get(key);
                  
                  if (clientsWithAvail === 0) {
                    return (
                      <div className="rounded-lg border border-border bg-muted/30 p-3 flex items-center gap-2">
                        <CalendarClock className="h-4 w-4 text-muted-foreground shrink-0" />
                        <p className="text-xs text-muted-foreground">Geen beschikbaarheid ingevuld — voeg beschikbaarheid toe voor een voorstel.</p>
                      </div>
                    );
                  }
                  
                  if (suggestions.length === 0) {
                    return (
                      <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 flex items-center gap-2">
                        <CalendarClock className="h-4 w-4 text-amber-600 shrink-0" />
                        <p className="text-xs text-amber-800">Geen overlappend moment gevonden. {clientsWithAvail}/{selected.size} aanmelders hebben beschikbaarheid.</p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-2">
                      {suggestions.map((suggestion, idx) => {
                        const isThisSimulated = simulated?.proposalIdx === idx;
                        const altKey = `${key}__${idx}`;
                        const showAlts = expandedAlternatives.has(altKey);
                        return (
                          <div key={idx} className="space-y-1">
                            <div className={`rounded-lg border p-3 space-y-1 ${isThisSimulated ? "border-primary ring-1 ring-primary/30 bg-primary/5" : idx === 0 ? "border-emerald-200 bg-emerald-50/50" : "border-border bg-muted/20"}`}>
                              <div className="flex items-center gap-2 justify-between">
                                <div className="flex items-center gap-2">
                                  <CalendarClock className={`h-4 w-4 shrink-0 ${isThisSimulated ? "text-primary" : idx === 0 ? "text-emerald-600" : "text-muted-foreground"}`} />
                                  <p className={`text-xs font-semibold ${isThisSimulated ? "text-primary" : idx === 0 ? "text-emerald-800" : "text-foreground"}`}>Voorstel {idx + 1}</p>
                                </div>
                                <Button
                                  variant={isThisSimulated ? "secondary" : "ghost"}
                                  size="sm"
                                  className={`h-7 text-xs gap-1 ${isThisSimulated ? "border-primary/30" : ""}`}
                                  onClick={() => toggleSimulation(key, group, idx, suggestion)}
                                  disabled={selected.size === 0}
                                >
                                  {isThisSimulated ? (
                                    <><CheckCircle2 className="h-3 w-3" /> Gesimuleerd</>
                                  ) : (
                                    <><FlaskConical className="h-3 w-3" /> Simuleer</>
                                  )}
                                </Button>
                              </div>
                              <div className="flex items-center gap-3 pl-6">
                                <Badge variant="outline" className={`text-xs capitalize ${isThisSimulated ? "border-primary/30 text-primary" : idx === 0 ? "border-emerald-300 text-emerald-700" : "border-border text-foreground"}`}>
                                  {suggestion.dayName}
                                </Badge>
                                <span className="text-sm font-medium text-foreground">
                                  {suggestion.startTime.slice(0, 5)} – {suggestion.endTime.slice(0, 5)}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  ({suggestion.overlap}/{suggestion.total} beschikbaar)
                                </span>
                                {suggestion.alternativesOnDay > 0 && (
                                  <button
                                    className="text-xs text-blue-600 font-medium hover:underline cursor-pointer"
                                    onClick={() => setExpandedAlternatives(prev => {
                                      const next = new Set(prev);
                                      if (next.has(altKey)) next.delete(altKey); else next.add(altKey);
                                      return next;
                                    })}
                                  >
                                    {showAlts ? "Verberg" : `+${suggestion.alternativesOnDay}`} {suggestion.alternativesOnDay === 1 ? "ander moment" : "andere momenten"} op {suggestion.dayName}
                                  </button>
                                )}
                              </div>
                            </div>
                            {/* Alternative windows for same day */}
                            {showAlts && (() => {
                              const alts = getAlternativeWindowsForDay(
                                suggestion.dayName,
                                suggestion.startTime,
                                selected,
                                availByClient,
                                90
                              );
                              return (
                                <div className="ml-6 space-y-1">
                                  {alts.map((alt, altIdx) => {
                                    const isAltSimulated = simulated?.suggestion?.dayName === alt.dayName
                                      && simulated?.suggestion?.startTime === alt.startTime;
                                    return (
                                      <div key={altIdx} className={`rounded-lg border p-2.5 flex items-center justify-between ${isAltSimulated ? "border-primary ring-1 ring-primary/30 bg-primary/5" : "border-border bg-muted/10"}`}>
                                        <div className="flex items-center gap-3">
                                          <CalendarClock className={`h-3.5 w-3.5 shrink-0 ${isAltSimulated ? "text-primary" : "text-muted-foreground"}`} />
                                          <Badge variant="outline" className="text-xs capitalize border-border text-foreground">
                                            {alt.dayName}
                                          </Badge>
                                          <span className="text-sm font-medium text-foreground">
                                            {alt.startTime.slice(0, 5)} – {alt.endTime.slice(0, 5)}
                                          </span>
                                          <span className="text-xs text-muted-foreground">
                                            ({alt.overlap}/{alt.total} beschikbaar)
                                          </span>
                                        </div>
                                        <Button
                                          variant={isAltSimulated ? "secondary" : "ghost"}
                                          size="sm"
                                          className={`h-7 text-xs gap-1 ${isAltSimulated ? "border-primary/30" : ""}`}
                                          onClick={() => toggleSimulation(key, group, idx, alt)}
                                          disabled={selected.size === 0}
                                        >
                                          {isAltSimulated ? (
                                            <><CheckCircle2 className="h-3 w-3" /> Gesimuleerd</>
                                          ) : (
                                            <><FlaskConical className="h-3 w-3" /> Simuleer</>
                                          )}
                                        </Button>
                                      </div>
                                    );
                                  })}
                                  {alts.length === 0 && (
                                    <p className="text-xs text-muted-foreground px-2 py-1">Geen alternatieve momenten gevonden.</p>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                <Button
                  className="w-full"
                  onClick={() => createGroup(group)}
                  disabled={isCreating || selected.size === 0}
                >
                  {isCreating ? "Aanmaken..." : `Groep aanmaken (${selected.size})`}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Clients without area/age */}
      {(() => {
        const noArea = unassigned.filter((c: any) => !resolveAreaId(c));
        const noAge = unassigned.filter((c: any) => !getAgeCategoryPlanning(c.date_of_birth));
        return (
          <>
            {noArea.length > 0 && (
              <Card className="border-amber-200 bg-amber-50/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-amber-800">
                    <AlertTriangle className="h-4 w-4 inline mr-1" />
                    Aanmelders zonder gebied ({noArea.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1">
                    {noArea.map((c: any) => (
                      <Badge key={c.id} variant="outline" className="text-xs border-amber-300 text-amber-700 cursor-pointer hover:bg-amber-100" onClick={() => navigate(`/clienten/${c.id}`)}>
                        {c.first_name} {c.last_name}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            {noAge.length > 0 && (
              <Card className="border-red-200 bg-red-50/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-red-800">
                    <AlertTriangle className="h-4 w-4 inline mr-1" />
                    Aanmelders zonder geboortedatum ({noAge.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1">
                    {noAge.map((c: any) => (
                      <Badge key={c.id} variant="outline" className="text-xs border-red-300 text-red-700 cursor-pointer hover:bg-red-100" onClick={() => navigate(`/clienten/${c.id}`)}>
                        {c.first_name} {c.last_name}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        );
      })()}

      {/* Export dialog */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Planning exporteren</DialogTitle>
            <DialogDescription>
              Selecteer de kolommen die je wilt opnemen in de export. Elke rij bevat één deelnemer per groep/tijdslot.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[50vh] overflow-y-auto">
            {Array.from(new Set(PLANNING_EXPORT_COLUMNS.map(c => c.group))).map(group => {
              const groupCols = PLANNING_EXPORT_COLUMNS.filter(c => c.group === group);
              const allChecked = groupCols.every(c => exportSelected.has(c.key));
              const someChecked = groupCols.some(c => exportSelected.has(c.key));
              return (
                <div key={group} className="space-y-1.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={allChecked}
                      className={someChecked && !allChecked ? "opacity-60" : ""}
                      onCheckedChange={(checked) => selectExportGroup(group, !!checked)}
                    />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group}</span>
                  </label>
                  <div className="grid grid-cols-2 gap-1 pl-6">
                    {groupCols.map(col => (
                      <label key={col.key} className="flex items-center gap-2 cursor-pointer py-0.5">
                        <Checkbox
                          checked={exportSelected.has(col.key)}
                          onCheckedChange={() => toggleExportCol(col.key)}
                        />
                        <span className="text-sm text-foreground">{col.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Formaat:</span>
              <Button
                variant={exportFormat === "xlsx" ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setExportFormat("xlsx")}
              >
                Excel (.xlsx)
              </Button>
              <Button
                variant={exportFormat === "csv" ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setExportFormat("csv")}
              >
                CSV
              </Button>
            </div>
            <Button onClick={handleExportPlanning} disabled={exportSelected.size === 0}>
              <Download className="h-4 w-4" /> Exporteren ({exportSelected.size})
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Save scenario dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{activeScenarioId ? "Scenario bijwerken" : "Opslaan als scenario"}</DialogTitle>
            <DialogDescription>
              Geef het scenario een naam en optioneel een beschrijving.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Naam *</Label>
              <Input
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
                placeholder="bijv. Kralingen 4-7 Q2"
              />
            </div>
            <div>
              <Label>Beschrijving</Label>
              <Textarea
                value={scenarioDescription}
                onChange={(e) => setScenarioDescription(e.target.value)}
                placeholder="Optionele toelichting..."
                rows={2}
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={scenarioStatus} onValueChange={setScenarioStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="concept">Concept</SelectItem>
                  <SelectItem value="vastgezet">Vastgezet</SelectItem>
                  <SelectItem value="in_uitwerking">In uitwerking</SelectItem>
                  <SelectItem value="gecontroleerd">Gecontroleerd</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>Annuleren</Button>
            <Button onClick={handleSaveScenario} disabled={saving}>
              {saving ? "Opslaan..." : "Opslaan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Convert result dialog */}
      <Dialog open={convertResultDialog !== null} onOpenChange={(open) => { if (!open) setConvertResultDialog(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Omzettingsresultaat</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {(convertResultDialog ?? []).map((result: any, idx: number) => (
              <div key={idx} className={`rounded-lg border p-3 ${result.status === "gelukt" ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50"}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">
                    Slot {result.label ?? idx + 1}
                  </span>
                  <Badge variant="outline" className={result.status === "gelukt" ? "border-emerald-300 text-emerald-700" : "border-red-300 text-red-700"}>
                    {result.status === "gelukt" ? (result.linked ? "✓ Gekoppeld" : "✓ Omgezet") : "✗ Mislukt"}
                  </Badge>
                </div>
                {result.program_id && (
                  <Button
                    variant="link"
                    size="sm"
                    className="text-xs p-0 h-auto mt-1"
                    onClick={() => { setConvertResultDialog(null); navigate(`/programmas/${result.program_id}`); }}
                  >
                    Bekijk programma →
                  </Button>
                )}
                {result.error && (
                  <p className="text-xs text-red-700 mt-1">{result.error}</p>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setConvertResultDialog(null)}>Sluiten</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});

export default GroupComposer;
