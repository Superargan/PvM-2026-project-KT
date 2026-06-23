import { useState, useMemo, useCallback, useEffect, useImperativeHandle, forwardRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users, AlertTriangle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import {
  getAgeCategoryPlanning,
  getMatchType,
  getTopAvailabilityOverlaps,
  resolveAreaId,
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
  buildGroups,
  getUnassignedClients,
  getReserveCandidates,
  filterTrainersByType,
  buildExportRows,
  serializeSnapshot,
  getBlockReason,
  buildAssignedGroupLabel,
  computeSlotFit,
} from "./group-composer/utils";
import { MemberRow } from "./group-composer/MemberRow";
import { SlotCard } from "./group-composer/SlotCard";
import { ComposerHeader } from "./group-composer/ComposerHeader";
import { SaveScenarioDialog } from "./group-composer/SaveScenarioDialog";

// Re-export handle type for consumers
export type { GroupComposerHandle } from "./group-composer/types";

const GroupComposer = forwardRef<GroupComposerHandle, GroupComposerProps>(function GroupComposer({ activeScenarioId, onSaveScenario, onClearScenario, onLoadScenario, filterArea: externalFilterArea, onFilterAreaChange, filterAgeCategory, preLinkedProgramId, onDirtyChange }, ref) {
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

  // Push dirty-state changes to parent — replaces polling-based detection.
  useEffect(() => {
    onDirtyChange?.(hasUnsavedWork);
  }, [hasUnsavedWork, onDirtyChange]);

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
        // Deactivating simulation — restore all group clients to selection
        next.delete(key);
        setSelectedClients(sc => ({
          ...sc,
          [key]: new Set(group.clients.map(cm => cm.client.id)),
        }));
      } else {
        // Activating simulation — auto-deselect clients that don't fit the slot
        const currentSelected = selectedClients[key] ?? new Set(group.clients.map(cm => cm.client.id));
        const slotFit = computeSlotFit(currentSelected, suggestion);

        if (slotFit.excludedClients.length > 0) {
          const eligibleSet = new Set(slotFit.eligibleClientIds);
          setSelectedClients(sc => ({ ...sc, [key]: eligibleSet }));

          const excludedNames = slotFit.excludedClients
            .map(exc => {
              const c = group.clients.find(cm => cm.client.id === exc.clientId)?.client;
              return c ? `${c.first_name} ${c.last_name}` : null;
            })
            .filter(Boolean);

          toast({
            title: `${excludedNames.length} deelnemer(s) uitgevinkt`,
            description: `Niet beschikbaar op dit slot: ${excludedNames.join(", ")}. Ze blijven zichtbaar en kunnen elders worden ingedeeld.`,
          });
        } else if (!selectedClients[key]) {
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
    const { client } = cm;
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
      <MemberRow
        key={client.id}
        cm={cm}
        isCheckedHere={isCheckedHere}
        isDisabled={isDisabled}
        isAssignedElsewhere={isAssignedElsewhere}
        assignedGroupLabel={assignedGroupLabel}
        isInProgram={isInProgram}
        onToggle={() => toggleClient(group, client.id)}
      />
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
          <ComposerHeader
            loadedScenarioName={loadedScenarioName}
            loadedProformaNumber={loadedProformaNumber}
            simulatedGroups={simulatedGroups}
            simulatedClientIdsCount={simulatedClientIds.size}
            isDirty={isDirty}
            activeScenarioId={activeScenarioId}
            converting={converting}
            impactedCount={impactedCount}
            otherGroupsCount={otherGroupsInSameArea.length}
            affectedAreasCount={affectedAreas.size}
            areaMap={areaMap}
            onOpenSaveDialog={() => setSaveDialogOpen(true)}
            onValidate={handleValidate}
            onConvert={handleConvert}
            onReset={resetSimulation}
          />
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
          const simulated = simulatedGroups.get(key);

          return (
            <SlotCard
              key={key}
              group={group}
              selected={selected}
              isCreating={isCreating}
              isExpanded={expandedCard === key}
              isSimulating={isSimulating}
              isDirty={isDirty}
              simulatedGroupsSize={simulatedGroups.size}
              activeScenarioId={activeScenarioId}
              canCreateDefinitiveGroup={canCreateDefinitiveGroup}
              simulated={simulated}
              showReserve={showReserve}
              expandedAlternatives={expandedAlternatives}
              intakeClients={intakeClients}
              wachtlijstClients={wachtlijstClients_}
              selectedReserves={selectedReserves}
              unselectedReserves={unselectedReserves}
              linkedProgramId={linkedPrograms[key]}
              startDate={selectedStartDate[key]}
              oudertrainerId={selectedOudertrainer[key]}
              kindtrainerId={selectedKindtrainer[key]}
              linkablePrograms={linkablePrograms}
              oudertrainers={oudertrainers}
              kindtrainers={kindtrainers}
              waitlistClients={waitlistClients}
              prefsByClient={prefsByClient}
              availByClient={availByClient}
              onToggleExpand={() => setExpandedCard(expandedCard === key ? null : key)}
              onToggleAll={() => toggleAll(group)}
              onToggleReserveSearch={() => toggleReserveSearch(key)}
              onLinkProgram={(programId) => setLinkedPrograms(prev => {
                const next = { ...prev };
                if (programId === null) delete next[key]; else next[key] = programId;
                return next;
              })}
              onStartDateChange={(date) => setSelectedStartDate(prev => ({ ...prev, [key]: date }))}
              onOudertrainerChange={(id) => setSelectedOudertrainer(prev => ({ ...prev, [key]: id }))}
              onKindtrainerChange={(id) => setSelectedKindtrainer(prev => ({ ...prev, [key]: id }))}
              onToggleSimulation={(proposalIdx, suggestion) => toggleSimulation(key, group, proposalIdx, suggestion)}
              onToggleAlternativesExpand={(altKey) => setExpandedAlternatives(prev => {
                const next = new Set(prev);
                if (next.has(altKey)) next.delete(altKey); else next.add(altKey);
                return next;
              })}
              onRequestCreateGroup={() => requestCreateGroup(group)}
              renderMember={(cm) => renderClientRow(cm, group, selected)}
              getSuggestions={getSuggestions}
            />
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
      <SaveScenarioDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        activeScenarioId={activeScenarioId}
        scenarioName={scenarioName}
        onScenarioNameChange={setScenarioName}
        scenarioDescription={scenarioDescription}
        onScenarioDescriptionChange={setScenarioDescription}
        scenarioStatus={scenarioStatus}
        onScenarioStatusChange={setScenarioStatus}
        saving={saving}
        onSave={handleSaveScenario}
      />

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
