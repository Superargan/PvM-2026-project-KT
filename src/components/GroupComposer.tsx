import { useState, useMemo, useCallback, useEffect, useImperativeHandle, forwardRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
  getMatchType,
  matchSortOrder,
  matchColors,
  statusBadgeStyles,
  getTopAvailabilityOverlaps,
  getAlternativeWindowsForDay,
  resolveAreaId,
  type MatchType,
} from "@/lib/DomainResolver";
import { clientKeys, scenarioKeys } from "@/lib/queryKeys";
import { downloadExport } from "@/lib/csvExport";

// Extracted modules
import type {
  GroupComposerHandle,
  GroupComposerProps,
  GroupedClients,
  ClientWithMatch,
  SimulationEntry,
  ConvertResult,
  AvailabilitySuggestion,
} from "./group-composer/types";
import {
  MAX_GROUP_SIZE,
  SUB_GROUP_LABELS,
  PLANNING_EXPORT_COLUMNS,
} from "./group-composer/types";
import { useGroupComposerQueries } from "./group-composer/useGroupComposerQueries";
import { useScenarioActions } from "./group-composer/useScenarioActions";
import {
  getGroupKey,
  getStatusInfo,
  buildGroups,
  getUnassignedClients,
  getReserveCandidates,
  filterTrainersByType,
  trainerLabel,
  buildExportRows,
  serializeSnapshot,
  getBlockReason,
  buildAssignedGroupLabel,
  computeSlotFit,
} from "./group-composer/utils";

// Re-export handle type for consumers
export type { GroupComposerHandle } from "./group-composer/types";

const GroupComposer = forwardRef<GroupComposerHandle, GroupComposerProps>(function GroupComposer({ activeScenarioId, onSaveScenario, onClearScenario, onLoadScenario, filterArea: externalFilterArea, onFilterAreaChange, filterAgeCategory, preLinkedProgramId }, ref) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ─── Data ───────────────────────────────────────────────────────
  const {
    waitlistClients, areas, prefsByClient, availByClient,
    areaMap, areaIds, programClientIds, overriddenClientIds,
    allTrainers, linkablePrograms,
  } = useGroupComposerQueries();

  // ─── Local state ────────────────────────────────────────────────
  const [selectedClients, setSelectedClients] = useState<Record<string, Set<string>>>({});
  const [selectedOudertrainer, setSelectedOudertrainer] = useState<Record<string, string>>({});
  const [selectedKindtrainer, setSelectedKindtrainer] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState<string | null>(null);
  const filterArea = externalFilterArea ?? "alle";
  const setFilterArea = onFilterAreaChange ?? (() => {});
  const [expandedReserve, setExpandedReserve] = useState<Set<string>>(new Set());
  const [selectedStartDate, setSelectedStartDate] = useState<Record<string, string>>({});
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [simulatedGroups, setSimulatedGroups] = useState<Map<string, SimulationEntry>>(new Map());
  const [expandedAlternatives, setExpandedAlternatives] = useState<Set<string>>(new Set());
  const [linkedPrograms, setLinkedPrograms] = useState<Record<string, string>>({});

  // Export state
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"xlsx" | "csv">("xlsx");
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
  const [convertResultDialog, setConvertResultDialog] = useState<ConvertResult[] | null>(null);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<string | null>(null);
  const [loadedScenarioName, setLoadedScenarioName] = useState<string | null>(null);
  const [loadedProformaNumber, setLoadedProformaNumber] = useState<string | null>(null);
  const [confirmCreateOpen, setConfirmCreateOpen] = useState(false);
  const [confirmCreateGroup, setConfirmCreateGroup] = useState<GroupedClients | null>(null);

  // ─── Derived data ───────────────────────────────────────────────
  const getSuggestions = (clientIds: Set<string>): AvailabilitySuggestion[] => getTopAvailabilityOverlaps(clientIds, availByClient, 3, 90);

  const oudertrainers = useMemo(() => filterTrainersByType(allTrainers, "oudertrainer"), [allTrainers]);
  const kindtrainers = useMemo(() => filterTrainersByType(allTrainers, "kindtrainer"), [allTrainers]);

  const getCurrentSnapshot = useCallback(() => {
    return serializeSnapshot(simulatedGroups, selectedClients, linkedPrograms);
  }, [simulatedGroups, selectedClients, linkedPrograms]);

  const isDirty = useMemo(() => {
    if (!activeScenarioId) return simulatedGroups.size > 0;
    return getCurrentSnapshot() !== lastSavedSnapshot;
  }, [activeScenarioId, getCurrentSnapshot, lastSavedSnapshot, simulatedGroups.size]);

  const simulatedClientIds = useMemo(() => {
    const ids = new Set<string>();
    simulatedGroups.forEach((_val, simKey) => {
      const sel = selectedClients[simKey];
      if (sel) sel.forEach(id => ids.add(id));
    });
    return ids;
  }, [simulatedGroups, selectedClients]);

  const clientGroupAssignment = useMemo(() => {
    const map = new Map<string, string>();
    Object.entries(selectedClients).forEach(([groupKey, clientSet]) => {
      clientSet.forEach(clientId => map.set(clientId, groupKey));
    });
    return map;
  }, [selectedClients]);

  const isSimulating = simulatedGroups.size > 0;
  const hasUnsavedWork = isSimulating || isDirty;

  const canCreateDefinitiveGroup = useMemo(() => {
    if (isSimulating || isDirty || simulatedGroups.size > 0) return false;
    if (activeScenarioId !== null && activeScenarioId !== undefined) return false;
    return true;
  }, [isSimulating, isDirty, simulatedGroups.size, activeScenarioId]);

  // ─── Groups ─────────────────────────────────────────────────────
  const groups = useMemo(
    () => buildGroups(waitlistClients, areas, areaMap, prefsByClient, simulatedGroups, simulatedClientIds),
    [waitlistClients, areas, areaMap, prefsByClient, simulatedGroups, simulatedClientIds]
  );

  const unassigned = useMemo(
    () => getUnassignedClients(waitlistClients, simulatedClientIds),
    [waitlistClients, simulatedClientIds]
  );

  const filteredGroups = useMemo(() => {
    let result = groups;
    if (filterArea !== "alle") result = result.filter(g => g.areaId === filterArea);
    if (filterAgeCategory) result = result.filter(g => g.ageCategory === filterAgeCategory);
    return result;
  }, [groups, filterArea, filterAgeCategory]);

  // ─── Scenario actions ──────────────────────────────────────────
  const { handleSaveScenario, handleValidate, handleConvert } = useScenarioActions({
    activeScenarioId,
    scenarioName,
    scenarioDescription,
    scenarioStatus,
    simulatedGroups,
    selectedClients,
    linkedPrograms,
    overriddenClientIds,
    waitlistClients,
    availByClient,
    prefsByClient,
    programClientIds,
    areaIds,
    getCurrentSnapshot,
    setLastSavedSnapshot,
    setLoadedScenarioName,
    onSaveScenario,
    setSaveDialogOpen,
    setSaving,
    setConverting,
    setConvertResultDialog,
    isDirty,
  });

  // ─── Load scenario from DB ─────────────────────────────────────
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
      setLoadedProformaNumber(scenario.proforma_number ?? null);
      setScenarioName(scenario.name);
      setScenarioDescription(scenario.description ?? "");
      setScenarioStatus(scenario.status);

      const newSimulated = new Map<string, SimulationEntry>();
      const newSelected: Record<string, Set<string>> = {};
      const newLinked: Record<string, string> = {};

      (scenario.simulation_scenario_slots ?? []).forEach((slot) => {
        const groupKey = `${slot.area_id}__${slot.age_category ?? ""}`;
        newSimulated.set(groupKey, {
          proposalIdx: slot.proposal_idx ?? 0,
          suggestion: slot.mode === "manual" ? {
            dayName: slot.day_name ?? "",
            startTime: slot.start_time ?? "",
            endTime: slot.end_time ?? "",
            overlap: 0,
            total: 0,
            clientIds: [],
          } : null,
        });

        const memberIds = (slot.simulation_scenario_members ?? []).map((m) => m.client_id);
        newSelected[groupKey] = new Set(memberIds);

        if (slot.linked_program_id) {
          newLinked[groupKey] = slot.linked_program_id;
        }
      });

      setSimulatedGroups(newSimulated);
      setSelectedClients(newSelected);
      setLinkedPrograms(newLinked);

      setTimeout(() => {
        setLastSavedSnapshot(serializeSnapshot(newSimulated, newSelected, newLinked));
      }, 0);
    };

    loadScenario();
  }, [activeScenarioId]);

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

  // Expose ref handle
  useImperativeHandle(ref, () => ({
    triggerSave: async () => {
      if (scenarioName.trim()) return handleSaveScenario();
      setSaveDialogOpen(true);
      return false;
    },
    hasActiveSimulation: isSimulating,
    isDirty,
    hasUnsavedWork,
  }), [isSimulating, scenarioName, isDirty, hasUnsavedWork, handleSaveScenario]);

  // ─── Selection logic ───────────────────────────────────────────
  const getSelectedForGroup = (g: GroupedClients): Set<string> => {
    const key = getGroupKey(g);
    return selectedClients[key] ?? new Set(g.clients.map((cm) => cm.client.id));
  };

  const toggleClient = (g: GroupedClients, clientId: string) => {
    const key = getGroupKey(g);
    const current = getSelectedForGroup(g);
    const isCurrentlySelected = current.has(clientId);

    if (!isCurrentlySelected) {
      const existingGroup = clientGroupAssignment.get(clientId);
      if (existingGroup && existingGroup !== key) {
        const assignedGroupLabel = buildAssignedGroupLabel(existingGroup, areaMap);
        const oldGroupSelected = selectedClients[existingGroup] ? new Set(selectedClients[existingGroup]) : null;
        const newCurrent = new Set(current);
        newCurrent.add(clientId);

        if (oldGroupSelected) {
          oldGroupSelected.delete(clientId);
          setSelectedClients(prev => ({ ...prev, [existingGroup]: oldGroupSelected, [key]: newCurrent }));
        } else {
          setSelectedClients(prev => ({ ...prev, [key]: newCurrent }));
        }

        const oldCount = oldGroupSelected ? oldGroupSelected.size : "?";
        toast({
          title: "Cliënt verplaatst",
          description: `Verwijderd uit ${assignedGroupLabel} (nu ${oldCount}) en toegevoegd aan huidige groep (nu ${newCurrent.size}).`,
        });
        return;
      }
    }

    const next = new Set(current);
    if (next.has(clientId)) next.delete(clientId);
    else next.add(clientId);
    setSelectedClients(prev => ({ ...prev, [key]: next }));
  };

  const toggleAll = (g: GroupedClients) => {
    const key = getGroupKey(g);
    const current = getSelectedForGroup(g);
    const availableClients = g.clients.filter(cm => {
      const assigned = clientGroupAssignment.get(cm.client.id);
      return !assigned || assigned === key;
    });
    if (current.size === availableClients.length) {
      setSelectedClients(prev => ({ ...prev, [key]: new Set() }));
    } else {
      setSelectedClients(prev => ({ ...prev, [key]: new Set(availableClients.map((cm) => cm.client.id)) }));
    }
  };

  const toggleSimulation = (key: string, group: GroupedClients, proposalIdx: number, suggestion: AvailabilitySuggestion | null) => {
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

  // ─── Export ─────────────────────────────────────────────────────
  const handleExportPlanning = () => {
    const { columns, rows } = buildExportRows(
      filteredGroups, exportSelected, getSelectedForGroup, getSuggestions,
      simulatedGroups, allTrainers, selectedOudertrainer, selectedKindtrainer,
      selectedStartDate, areaMap,
    );
    if (columns.length === 0) return;
    downloadExport(`planning-groepen.${exportFormat}`, columns, rows, exportFormat);
    setExportOpen(false);
  };

  // ─── Definitive group creation ─────────────────────────────────
  const requestCreateGroup = (g: GroupedClients) => {
    if (!canCreateDefinitiveGroup) {
      toast({ title: "Blokkade", description: getBlockReason(isSimulating, isDirty, simulatedGroups.size, activeScenarioId), variant: "destructive" });
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
        .insert({ name: programName, area_id: g.areaId, age_category: g.ageCategory, status: "te_plannen", max_participants: selected.size, start_date: selectedStartDate[key] || null })
        .select("id")
        .single();
      if (progErr) throw progErr;

      const clientInserts = Array.from(selected).map(clientId => ({ program_id: program.id, client_id: clientId }));
      const { error: clientErr } = await supabase.from("program_clients").insert(clientInserts);
      if (clientErr) throw clientErr;

      const staffInserts: { program_id: string; staff_id: string; role: string }[] = [];
      if (oudertrainerId) staffInserts.push({ program_id: program.id, staff_id: oudertrainerId, role: "oudertrainer" });
      if (kindtrainerId && kindtrainerId !== oudertrainerId) staffInserts.push({ program_id: program.id, staff_id: kindtrainerId, role: "kindtrainer" });
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
      queryClient.invalidateQueries({ queryKey: clientKeys.all });
      navigate(`/programmas/${program.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ title: "Fout bij aanmaken", description: message, variant: "destructive" });
    } finally {
      setCreating(null);
    }
  };

  // ─── Status labels ─────────────────────────────────────────────
  const statusLabelsMap: Record<string, string> = {
    intake_afgerond: "Intake afgerond",
    wachtlijst: "Wachtlijst",
  };

  // ─── Client row renderer ───────────────────────────────────────
  const renderClientRow = (cm: ClientWithMatch, group: GroupedClients, selected: Set<string>) => {
    const { client, matchType } = cm;
    const age = calculateAge(client.date_of_birth);
    const statusStyle = statusBadgeStyles[client.intake_status ?? ""] ?? statusBadgeStyles.wachtlijst;
    const currentKey = getGroupKey(group);
    const assignedTo = clientGroupAssignment.get(client.id);
    const isAssignedElsewhere = !!assignedTo && assignedTo !== currentKey;
    const isCheckedHere = selected.has(client.id);
    const isDisabled = isAssignedElsewhere && !isCheckedHere;
    const isInProgram = programClientIds.has(client.id);

    let assignedGroupLabel = "";
    if (isAssignedElsewhere && assignedTo) {
      assignedGroupLabel = buildAssignedGroupLabel(assignedTo, areaMap);
    }

    return (
      <TooltipProvider key={client.id}>
        <Tooltip>
          <TooltipTrigger asChild>
            <label
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors ${
                isDisabled ? "opacity-50 cursor-not-allowed" : "hover:bg-muted/50 cursor-pointer"
              }`}
            >
              <Checkbox checked={isCheckedHere} onCheckedChange={() => toggleClient(group, client.id)} disabled={isDisabled} />
              <span className="text-sm text-foreground truncate">{client.first_name} {client.last_name}</span>
              {isAssignedElsewhere && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 border-warning-border text-warning-foreground gap-0.5">
                  <AlertTriangle className="h-2.5 w-2.5" /> Al in {assignedGroupLabel}
                </Badge>
              )}
              {isInProgram && !isAssignedElsewhere && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 border-destructive/40 text-destructive gap-0.5">
                  <ShieldAlert className="h-2.5 w-2.5" /> Al ingepland
                </Badge>
              )}
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ml-auto shrink-0 ${statusStyle.className}`}>{statusStyle.label}</Badge>
              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 shrink-0 ${matchColors[matchType]}`}>{matchType}</Badge>
              {age !== null && <span className="text-xs text-muted-foreground shrink-0">{age}j</span>}
            </label>
          </TooltipTrigger>
          {isAssignedElsewhere && (
            <TooltipContent>
              <p className="text-xs">Al geselecteerd in groep {assignedGroupLabel}. Verwijder eerst de selectie daar.</p>
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
    );
  };

  // ─── Reserve toggle ────────────────────────────────────────────
  const toggleReserveSearch = (key: string) => {
    setExpandedReserve(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════

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
              {areas.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary badges */}
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline" className="border-muted-foreground/30">
          <Users className="h-3 w-3 mr-1" /> {waitlistClients.length} aanmelders
        </Badge>
        <Badge variant="outline" className="border-info-border text-info-foreground">
          {waitlistClients.filter((c) => c.intake_status === "intake_afgerond").length} intake afgerond
        </Badge>
        <Badge variant="outline" className="border-warning-border text-warning-foreground">
          {waitlistClients.filter((c) => c.intake_status === "wachtlijst").length} wachtlijst
        </Badge>
        <Badge variant="outline" className="border-success-border text-success-foreground">
          {groups.filter(g => g.clients.length >= 7).length} groep(en) gereed
        </Badge>
        {unassigned.length > 0 && (
          <Badge variant="outline" className="border-warning-border text-warning-foreground">
            {unassigned.length} zonder gebied/leeftijd
          </Badge>
        )}
      </div>

      {/* Simulation / proforma banner */}
      {isSimulating && (() => {
        const affectedAreas = new Set<string>();
        simulatedGroups.forEach((_val, simKey) => {
          affectedAreas.add(simKey.split("__")[0]);
        });
        const otherGroupsInSameArea = filteredGroups.filter(g => {
          const gKey = getGroupKey(g);
          return !simulatedGroups.has(gKey) && affectedAreas.has(g.areaId);
        });
        const impactedCount = otherGroupsInSameArea.reduce((sum, g) => {
          const originalCount = waitlistClients.filter((c) => {
            const ageCat = getAgeCategoryPlanning(c.date_of_birth);
            if (ageCat !== g.ageCategory) return false;
            return !!getMatchType(c, g.areaId, prefsByClient);
          }).length;
          return sum + Math.max(0, originalCount - g.clients.length);
        }, 0);

        return (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium text-foreground">
                  {loadedScenarioName ? `Proforma planning: ${loadedScenarioName}` : "Simulatie (niet opgeslagen)"}
                  {" — "}{simulatedGroups.size} voorstel(len), {simulatedClientIds.size} deelnemers
                </span>
                {loadedProformaNumber && (
                  <Badge variant="outline" className="text-[10px] border-primary/40 text-primary font-mono">{loadedProformaNumber}</Badge>
                )}
                {isDirty && (
                  <Badge variant="outline" className="text-[10px] border-warning-border text-warning-foreground gap-0.5">
                    <AlertTriangle className="h-2.5 w-2.5" /> Wijzigingen niet opgeslagen
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <Button variant="outline" size="sm" onClick={() => setSaveDialogOpen(true)} className="gap-1.5">
                  <Save className="h-3 w-3" /> Opslaan als proforma
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
                            <Button variant="default" size="sm" onClick={handleConvert} disabled={isDirty || converting} className="gap-1.5">
                              <Upload className="h-3 w-3" /> {converting ? "Omzetten..." : "Omzetten naar definitieve planning"}
                            </Button>
                          </span>
                        </TooltipTrigger>
                        {isDirty && <TooltipContent><p className="text-xs">Sla eerst op voordat je kunt omzetten</p></TooltipContent>}
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
          <p className="text-sm text-muted-foreground">Geen aanmelders gevonden die gegroepeerd kunnen worden.</p>
        </div>
      )}

      {/* Group cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {filteredGroups.map((group) => {
          const key = getGroupKey(group);
          const selected = getSelectedForGroup(group);
          const isCreating = creating === key;
          const intakeClients = group.clients.filter(cm => cm.client.intake_status === "intake_afgerond");
          const wachtlijstClients_ = group.clients.filter(cm => cm.client.intake_status !== "intake_afgerond");
          const showReserve = expandedReserve.has(key);
          const allReserveCandidates = getReserveCandidates(group, waitlistClients, prefsByClient);
          const primaryClientIds = new Set(group.clients.map(cm => cm.client.id));
          const selectedReserves = allReserveCandidates.filter(cm => selected.has(cm.client.id) && !primaryClientIds.has(cm.client.id));
          const unselectedReserves = allReserveCandidates.filter(cm => !selected.has(cm.client.id));
          const isGroupSimulated = simulatedGroups.has(key);
          
          // Compute slot-fit when a suggestion is active
          const simulated = simulatedGroups.get(key);
          const activeSuggestion = simulated?.suggestion ?? null;
          const slotFit = computeSlotFit(selected, activeSuggestion);
          const hasSlotFit = activeSuggestion !== null && slotFit.optimalGroupSize > 0;
          
          // Status is based on slot-fit when simulated, otherwise on selected count
          const effectiveSize = hasSlotFit ? slotFit.optimalGroupSize : selected.size;
          const status = getStatusInfo(effectiveSize);
          const StatusIcon = status.iconType === "check" ? Check : AlertTriangle;

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
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setExpandedCard(expandedCard === key ? null : key)}>
                        <Maximize2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <span className="text-info-foreground">{intakeClients.length} intake afgerond</span>
                      {wachtlijstClients_.length > 0 && <span className="text-warning-foreground ml-1">· {wachtlijstClients_.length} wachtlijst</span>}
                      {selectedReserves.length > 0 && <span className="text-role-foreground ml-1">· {selectedReserves.length} uit reserve</span>}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge className={`${status.color} gap-1`}>
                      <StatusIcon className="h-4 w-4" />
                      {hasSlotFit
                        ? `${slotFit.optimalGroupSize} op slot ✓`
                        : selected.size >= 7 ? `${selected.size} geselecteerd ✓` : status.label
                      }
                    </Badge>
                    {hasSlotFit && slotFit.excludedClients.length > 0 && (
                      <span className="text-[10px] text-warning-foreground">
                        {slotFit.excludedClients.length} niet beschikbaar op dit slot
                      </span>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Aanmelders</span>
                    <button className="text-xs text-primary hover:underline" onClick={() => toggleAll(group)}>
                      {selected.size === group.clients.length ? "Deselecteer alles" : "Selecteer alles"}
                    </button>
                  </div>
                  <div className="max-h-72 overflow-y-auto space-y-0.5 pr-1">
                    {intakeClients.length > 0 && (
                      <>
                        <div className="text-[10px] font-semibold text-info-foreground uppercase tracking-wider px-2 pt-1 pb-0.5">Intake afgerond ({intakeClients.length})</div>
                        {intakeClients.map(cm => renderClientRow(cm, group, selected))}
                      </>
                    )}
                    {wachtlijstClients_.length > 0 && (
                      <>
                        <div className="text-[10px] font-semibold text-warning-foreground uppercase tracking-wider px-2 pt-2 pb-0.5">Wachtlijst ({wachtlijstClients_.length})</div>
                        {wachtlijstClients_.map(cm => renderClientRow(cm, group, selected))}
                      </>
                    )}
                    {selectedReserves.length > 0 && (
                      <>
                        <div className="text-[10px] font-semibold text-role-foreground uppercase tracking-wider px-2 pt-2 pb-0.5 flex items-center gap-1">
                          <Search className="h-2.5 w-2.5" /> Uit reservegebied ({selectedReserves.length})
                        </div>
                        {selectedReserves.map(cm => renderClientRow(cm, group, selected))}
                      </>
                    )}
                  </div>
                </div>

                <Button variant="outline" size="sm" className="w-full text-xs gap-1.5" onClick={() => toggleReserveSearch(key)}>
                  <Search className="h-3 w-3" />
                  {showReserve ? "Verberg reservegebied resultaten" : "Zoek op reservegebied"}
                </Button>

                {showReserve && (
                  <div className="rounded-lg border border-border bg-muted/20 p-2 space-y-1">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-1">Extra kandidaten via reservegebied ({unselectedReserves.length})</p>
                    {unselectedReserves.length === 0 ? (
                      <p className="text-xs text-muted-foreground px-1 py-1">Geen extra kandidaten gevonden.</p>
                    ) : (
                      <div className="max-h-32 overflow-y-auto space-y-0.5">
                        {unselectedReserves.map(cm => renderClientRow(cm, group, selected))}
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
                      const selectedProg = linkedPrograms[key] ? linkablePrograms.find((p) => p.id === linkedPrograms[key]) : null;
                      const matchingProgs = linkablePrograms.filter((p) => p.area_id === group.areaId && (!p.age_category || p.age_category === group.ageCategory));
                      const otherProgs = linkablePrograms.filter((p) => p.area_id !== group.areaId || (p.age_category && p.age_category !== group.ageCategory));
                      return (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" role="combobox" className="h-9 text-xs justify-between w-full font-normal">
                              {selectedProg ? (
                                <span className="truncate">{selectedProg.name} ({selectedProg.training_number || selectedProg.status})</span>
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
                                  <CommandItem value="__nieuw_programma__" onSelect={() => { setLinkedPrograms(prev => { const next = { ...prev }; delete next[key]; return next; }); }}>
                                    <span className="text-muted-foreground">Nieuw programma aanmaken</span>
                                  </CommandItem>
                                </CommandGroup>
                                {matchingProgs.length > 0 && (
                                  <CommandGroup heading="Matching programma's">
                                    {matchingProgs.map((p) => (
                                      <CommandItem key={p.id} value={`${p.name} ${p.training_number ?? ''} ${p.status}`} onSelect={() => setLinkedPrograms(prev => ({ ...prev, [key]: p.id }))}>
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
                                      {otherProgs.map((p) => (
                                        <CommandItem key={p.id} value={`${p.name} ${p.training_number ?? ''} ${p.areas?.name ?? ''} ${p.age_category ?? ''} ${p.status}`} onSelect={() => setLinkedPrograms(prev => ({ ...prev, [key]: p.id }))}>
                                          <Check className={`mr-1 h-3 w-3 ${linkedPrograms[key] === p.id ? "opacity-100" : "opacity-0"}`} />
                                          <span className="truncate">{p.name}</span>
                                          <span className="ml-auto text-[10px] text-muted-foreground">{p.areas?.name ?? "?"}</span>
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
                      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => setLinkedPrograms(prev => { const next = { ...prev }; delete next[key]; return next; })}>
                        <Unlink className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    )}
                  </div>
                  {linkedPrograms[key] && (
                    <p className="text-[10px] text-info-foreground flex items-center gap-1">
                      <Link2 className="h-3 w-3" /> Deelnemers worden bij omzetting <strong>toegevoegd</strong> aan dit programma
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Vermoedelijke startdatum
                  </label>
                  <Input type="date" className="h-9 text-xs" value={selectedStartDate[key] ?? ""} onChange={(e) => setSelectedStartDate(prev => ({ ...prev, [key]: e.target.value }))} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <UserCog className="h-3 w-3" /> Oudertrainer
                    </label>
                    <Select value={selectedOudertrainer[key] ?? ""} onValueChange={(v) => setSelectedOudertrainer(prev => ({ ...prev, [key]: v }))}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Selecteer..." /></SelectTrigger>
                      <SelectContent className="bg-popover">
                        {oudertrainers.map((t) => <SelectItem key={t.id} value={t.id}>{trainerLabel(t)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                      <UserCog className="h-3 w-3" /> Kindtrainer
                    </label>
                    <Select value={selectedKindtrainer[key] ?? ""} onValueChange={(v) => setSelectedKindtrainer(prev => ({ ...prev, [key]: v }))}>
                      <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Selecteer..." /></SelectTrigger>
                      <SelectContent className="bg-popover">
                        {kindtrainers.map((t) => <SelectItem key={t.id} value={t.id}>{trainerLabel(t)}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Availability suggestions */}
                {(() => {
                  const suggestions = getSuggestions(selected);
                  const clientsWithAvail = Array.from(selected).filter(id => availByClient[id]?.length > 0).length;
                  
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
                      <div className="rounded-lg border border-warning-border bg-warning-muted/50 p-3 flex items-center gap-2">
                        <CalendarClock className="h-4 w-4 text-warning shrink-0" />
                        <p className="text-xs text-warning-foreground">Geen overlappend moment gevonden. {clientsWithAvail}/{selected.size} aanmelders hebben beschikbaarheid.</p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-2">
                      {suggestions.map((suggestion, idx) => {
                        const isThisSimulated = simulated?.proposalIdx === idx;
                        const altKey = `${key}__${idx}`;
                        const showAlts = expandedAlternatives.has(altKey);
                        const suggestionFit = computeSlotFit(selected, suggestion);
                        const excludedCount = suggestionFit.excludedClients.length;
                        return (
                          <div key={idx} className="space-y-1">
                            <div className={`rounded-lg border p-3 space-y-1 ${isThisSimulated ? "border-primary ring-1 ring-primary/30 bg-primary/5" : idx === 0 ? "border-success-border bg-success-muted/50" : "border-border bg-muted/20"}`}>
                              <div className="flex items-center gap-2 justify-between">
                                <div className="flex items-center gap-2">
                                  <CalendarClock className={`h-4 w-4 shrink-0 ${isThisSimulated ? "text-primary" : idx === 0 ? "text-success" : "text-muted-foreground"}`} />
                                  <p className={`text-xs font-semibold ${isThisSimulated ? "text-primary" : idx === 0 ? "text-success-foreground" : "text-foreground"}`}>Voorstel {idx + 1}</p>
                                </div>
                                <Button
                                  variant={isThisSimulated ? "secondary" : "ghost"}
                                  size="sm"
                                  className={`h-7 text-xs gap-1 ${isThisSimulated ? "border-primary/30" : ""}`}
                                  onClick={() => toggleSimulation(key, group, idx, suggestion)}
                                  disabled={selected.size === 0}
                                >
                                  {isThisSimulated ? <><CheckCircle2 className="h-3 w-3" /> Gesimuleerd</> : <><FlaskConical className="h-3 w-3" /> Simuleer</>}
                                </Button>
                              </div>
                              <div className="flex items-center gap-3 pl-6">
                                <Badge variant="outline" className={`text-xs capitalize ${isThisSimulated ? "border-primary/30 text-primary" : idx === 0 ? "border-success-border text-success-foreground" : "border-border text-foreground"}`}>
                                  {suggestion.dayName}
                                </Badge>
                                <span className="text-sm font-medium text-foreground">
                                  {suggestion.startTime.slice(0, 5)} – {suggestion.endTime.slice(0, 5)}
                                </span>
                                <span className={`text-xs font-semibold ${isThisSimulated ? "text-primary" : idx === 0 ? "text-success-foreground" : "text-foreground"}`}>
                                  Optimale groep: {suggestionFit.optimalGroupSize}
                                </span>
                                {excludedCount > 0 && (
                                  <span className="text-xs text-warning-foreground">
                                    ({excludedCount} niet beschikbaar)
                                  </span>
                                )}
                                {(suggestion.alternativesOnDay ?? 0) > 0 && (
                                  <button
                                    className="text-xs text-info font-medium hover:underline cursor-pointer"
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
                            {showAlts && (() => {
                              const alts = getAlternativeWindowsForDay(suggestion.dayName, suggestion.startTime, selected, availByClient, 90) as AvailabilitySuggestion[];
                              return (
                                <div className="ml-6 space-y-1">
                                  {alts.map((alt, altIdx) => {
                                    const isAltSimulated = simulated?.suggestion?.dayName === alt.dayName && simulated?.suggestion?.startTime === alt.startTime;
                                    const altFit = computeSlotFit(selected, alt);
                                    const altExcluded = altFit.excludedClients.length;
                                    return (
                                      <div key={altIdx} className={`rounded-lg border p-2.5 flex items-center justify-between ${isAltSimulated ? "border-primary ring-1 ring-primary/30 bg-primary/5" : "border-border bg-muted/10"}`}>
                                        <div className="flex items-center gap-3">
                                          <CalendarClock className={`h-3.5 w-3.5 shrink-0 ${isAltSimulated ? "text-primary" : "text-muted-foreground"}`} />
                                          <Badge variant="outline" className="text-xs capitalize border-border text-foreground">{alt.dayName}</Badge>
                                          <span className="text-sm font-medium text-foreground">{alt.startTime.slice(0, 5)} – {alt.endTime.slice(0, 5)}</span>
                                          <span className="text-xs font-semibold text-foreground">Groep: {altFit.optimalGroupSize}</span>
                                          {altExcluded > 0 && (
                                            <span className="text-xs text-warning-foreground">({altExcluded} niet beschikbaar)</span>
                                          )}
                                        </div>
                                        <Button
                                          variant={isAltSimulated ? "secondary" : "ghost"}
                                          size="sm"
                                          className={`h-7 text-xs gap-1 ${isAltSimulated ? "border-primary/30" : ""}`}
                                          onClick={() => toggleSimulation(key, group, idx, alt)}
                                          disabled={selected.size === 0}
                                        >
                                          {isAltSimulated ? <><CheckCircle2 className="h-3 w-3" /> Gesimuleerd</> : <><FlaskConical className="h-3 w-3" /> Simuleer</>}
                                        </Button>
                                      </div>
                                    );
                                  })}
                                  {alts.length === 0 && <p className="text-xs text-muted-foreground px-2 py-1">Geen alternatieve momenten gevonden.</p>}
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="w-full">
                        <Button className="w-full" onClick={() => requestCreateGroup(group)} disabled={isCreating || selected.size === 0 || !canCreateDefinitiveGroup}>
                          {isCreating ? "Aanmaken..." : `Groep definitief aanmaken (${selected.size})`}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {!canCreateDefinitiveGroup && <TooltipContent><p className="text-xs">{getBlockReason(isSimulating, isDirty, simulatedGroups.size, activeScenarioId)}</p></TooltipContent>}
                  </Tooltip>
                </TooltipProvider>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Clients without area/age */}
      {(() => {
        const noArea = unassigned.filter((c) => !resolveAreaId(c));
        const noAge = unassigned.filter((c) => !getAgeCategoryPlanning(c.date_of_birth));
        return (
          <>
            {noArea.length > 0 && (
              <Card className="border-warning-border bg-warning-muted/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-warning-foreground">
                    <AlertTriangle className="h-4 w-4 inline mr-1" /> Aanmelders zonder gebied ({noArea.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1">
                    {noArea.map((c) => (
                      <Badge key={c.id} variant="outline" className="text-xs border-warning-border text-warning-foreground cursor-pointer hover:bg-warning-muted" onClick={() => navigate(`/clienten/${c.id}`)}>
                        {c.first_name} {c.last_name}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
            {noAge.length > 0 && (
              <Card className="border-destructive/30 bg-destructive/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-destructive">
                    <AlertTriangle className="h-4 w-4 inline mr-1" /> Aanmelders zonder geboortedatum ({noAge.length})
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1">
                    {noAge.map((c) => (
                      <Badge key={c.id} variant="outline" className="text-xs border-destructive/30 text-destructive cursor-pointer hover:bg-destructive/10" onClick={() => navigate(`/clienten/${c.id}`)}>
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
            <DialogDescription>Selecteer de kolommen die je wilt opnemen in de export. Elke rij bevat één deelnemer per groep/tijdslot.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[50vh] overflow-y-auto">
            {Array.from(new Set(PLANNING_EXPORT_COLUMNS.map(c => c.group))).map(group => {
              const groupCols = PLANNING_EXPORT_COLUMNS.filter(c => c.group === group);
              const allChecked = groupCols.every(c => exportSelected.has(c.key));
              const someChecked = groupCols.some(c => exportSelected.has(c.key));
              return (
                <div key={group} className="space-y-1.5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={allChecked} className={someChecked && !allChecked ? "opacity-60" : ""} onCheckedChange={(checked) => selectExportGroup(group, !!checked)} />
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group}</span>
                  </label>
                  <div className="grid grid-cols-2 gap-1 pl-6">
                    {groupCols.map(col => (
                      <label key={col.key} className="flex items-center gap-2 cursor-pointer py-0.5">
                        <Checkbox checked={exportSelected.has(col.key)} onCheckedChange={() => toggleExportCol(col.key)} />
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
              <Button variant={exportFormat === "xlsx" ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => setExportFormat("xlsx")}>Excel (.xlsx)</Button>
              <Button variant={exportFormat === "csv" ? "default" : "outline"} size="sm" className="h-7 text-xs" onClick={() => setExportFormat("csv")}>CSV</Button>
            </div>
            <Button onClick={handleExportPlanning} disabled={exportSelected.size === 0}>
              <Download className="h-4 w-4" /> Exporteren ({exportSelected.size})
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Definitive create confirmation dialog */}
      <AlertDialog open={confirmCreateOpen} onOpenChange={setConfirmCreateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Definitief programma aanmaken?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Dit maakt direct een <strong>definitief programma</strong> aan.</p>
              <ul className="list-disc list-inside text-sm space-y-1">
                <li>Geselecteerde deelnemers worden gekoppeld en op <strong>'actief'</strong> gezet</li>
                <li>Dit beïnvloedt direct het deelnemersoverzicht, export en rapportage</li>
                <li>Deze actie kan <strong>niet ongedaan</strong> worden gemaakt</li>
              </ul>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setConfirmCreateOpen(false); setConfirmCreateGroup(null); }}>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setConfirmCreateOpen(false); if (confirmCreateGroup) createGroup(confirmCreateGroup); setConfirmCreateGroup(null); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Definitief aanmaken
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Save proforma dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{activeScenarioId ? "Proforma planning bijwerken" : "Opslaan als proforma planning"}</DialogTitle>
            <DialogDescription>Geef de proforma planning een naam en optioneel een beschrijving.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Naam *</Label>
              <Input value={scenarioName} onChange={(e) => setScenarioName(e.target.value)} placeholder="bijv. Kralingen 4-7 Q2" />
            </div>
            <div>
              <Label>Beschrijving</Label>
              <Textarea value={scenarioDescription} onChange={(e) => setScenarioDescription(e.target.value)} placeholder="Optionele toelichting..." rows={2} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={scenarioStatus} onValueChange={setScenarioStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="concept">Proforma concept</SelectItem>
                  <SelectItem value="vastgezet">Proforma vastgezet</SelectItem>
                  <SelectItem value="in_uitwerking">Proforma in uitwerking</SelectItem>
                  <SelectItem value="gecontroleerd">Proforma gecontroleerd</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>Annuleren</Button>
            <Button onClick={handleSaveScenario} disabled={saving}>{saving ? "Opslaan..." : "Opslaan"}</Button>
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
            {(convertResultDialog ?? []).map((result, idx) => (
              <div key={idx} className={`rounded-lg border p-3 ${result.status === "gelukt" ? "border-success-border bg-success-muted" : "border-destructive/30 bg-destructive/5"}`}>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Slot {result.label ?? idx + 1}</span>
                  <Badge variant="outline" className={result.status === "gelukt" ? "border-success-border text-success-foreground" : "border-destructive/30 text-destructive"}>
                    {result.status === "gelukt" ? (result.linked ? "✓ Gekoppeld" : "✓ Omgezet") : "✗ Mislukt"}
                  </Badge>
                </div>
                {result.program_id && (
                  <Button variant="link" size="sm" className="text-xs p-0 h-auto mt-1" onClick={() => { setConvertResultDialog(null); navigate(`/programmas/${result.program_id}`); }}>
                    Bekijk programma →
                  </Button>
                )}
                {result.error && <p className="text-xs text-destructive mt-1">{result.error}</p>}
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
