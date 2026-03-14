/**
 * Scenario save / validate / convert mutation logic for GroupComposer.
 */

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import { clientKeys, scenarioKeys } from "@/lib/queryKeys";
import {
  buildAvailabilityByClient,
  getAgeCategoryPlanning,
  getMatchType,
  validateScenario,
} from "@/lib/clientUtils";
import type { GroupComposerClient, SimulationEntry, SaveSlotPayload, ConvertResult } from "./types";
import { abbreviateDayName, serializeSnapshot } from "./utils";

interface ScenarioActionsDeps {
  activeScenarioId: string | null | undefined;
  scenarioName: string;
  scenarioDescription: string;
  scenarioStatus: string;
  simulatedGroups: Map<string, SimulationEntry>;
  selectedClients: Record<string, Set<string>>;
  linkedPrograms: Record<string, string>;
  overriddenClientIds: Set<string>;
  waitlistClients: GroupComposerClient[];
  availByClient: ReturnType<typeof buildAvailabilityByClient>;
  prefsByClient: Record<string, Record<string, number>>;
  programClientIds: Set<string>;
  areaIds: Set<string>;
  getCurrentSnapshot: () => string;
  setLastSavedSnapshot: (s: string) => void;
  setLoadedScenarioName: (n: string) => void;
  onSaveScenario?: (id: string) => void;
  setSaveDialogOpen: (v: boolean) => void;
  setSaving: (v: boolean) => void;
  setConverting: (v: boolean) => void;
  setConvertResultDialog: (r: ConvertResult[] | null) => void;
  isDirty: boolean;
}

export function useScenarioActions(deps: ScenarioActionsDeps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleSaveScenario = useCallback(async (): Promise<boolean> => {
    if (!deps.scenarioName.trim()) {
      toast({ title: "Vul een naam in", variant: "destructive" });
      return false;
    }

    deps.setSaving(true);
    try {
      const slots: SaveSlotPayload[] = [];
      deps.simulatedGroups.forEach((val, groupKey) => {
        const [areaId, ageCategory] = groupKey.split("__");
        const members = Array.from(deps.selectedClients[groupKey] ?? []).map(clientId => ({
          client_id: clientId,
          has_override: deps.overriddenClientIds.has(clientId),
        }));

        slots.push({
          area_id: areaId,
          age_category: ageCategory || null,
          label: null,
          mode: val.suggestion ? "manual" : "proposal",
          proposal_idx: val.suggestion ? null : val.proposalIdx,
          day_name: val.suggestion?.dayName ? abbreviateDayName(val.suggestion.dayName) : null,
          start_time: val.suggestion?.startTime ?? null,
          end_time: val.suggestion?.endTime ?? null,
          confirmed: false,
          notes: null,
          linked_program_id: deps.linkedPrograms[groupKey] ?? null,
          members,
        });
      });

      const { data, error } = await supabase.rpc("save_scenario", {
        p_scenario_id: deps.activeScenarioId ?? null,
        p_name: deps.scenarioName,
        p_description: deps.scenarioDescription || null,
        p_status: deps.scenarioStatus,
        p_slots: slots as unknown as Json,
      });

      if (error) throw error;

      const savedId = data as string;
      toast({ title: deps.activeScenarioId ? "Proforma planning bijgewerkt" : "Proforma planning opgeslagen" });
      queryClient.invalidateQueries({ queryKey: scenarioKeys.all });

      deps.setLastSavedSnapshot(deps.getCurrentSnapshot());
      deps.setLoadedScenarioName(deps.scenarioName);
      deps.onSaveScenario?.(savedId);
      deps.setSaveDialogOpen(false);
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ title: "Fout bij opslaan", description: message, variant: "destructive" });
      return false;
    } finally {
      deps.setSaving(false);
    }
  }, [deps, toast, queryClient]);

  const buildClientsMap = useCallback((): Record<string, GroupComposerClient> => {
    const map: Record<string, GroupComposerClient> = {};
    deps.waitlistClients.forEach((c) => { map[c.id] = c; });
    return map;
  }, [deps.waitlistClients]);

  const fetchMissingClients = useCallback(async (
    allMemberClientIds: string[],
    clientsMap: Record<string, GroupComposerClient>,
  ) => {
    const missingIds = allMemberClientIds.filter((id) => !clientsMap[id]);
    if (missingIds.length > 0) {
      const { data: extraClients } = await supabase
        .from("clients")
        .select("id, first_name, last_name, date_of_birth, waitlist_area_id, all_areas_flexible, intake_status, school_id, neighborhood_id")
        .in("id", missingIds);
      (extraClients ?? []).forEach((c) => {
        clientsMap[c.id] = c as unknown as GroupComposerClient;
      });
    }
  }, []);

  const handleValidate = useCallback(async () => {
    if (!deps.activeScenarioId) return;

    const { data: scenario, error } = await supabase
      .from("simulation_scenarios")
      .select(`
        id,
        simulation_scenario_slots (
          id, area_id, age_category, mode, proposal_idx, day_name, start_time, end_time,
          simulation_scenario_members (client_id, has_override)
        )
      `)
      .eq("id", deps.activeScenarioId)
      .single();

    if (error || !scenario) {
      toast({ title: "Scenario niet gevonden", variant: "destructive" });
      return;
    }

    const slots = scenario.simulation_scenario_slots ?? [];
    const clientsMap = buildClientsMap();

    const allMemberClientIds = slots.flatMap((s) =>
      (s.simulation_scenario_members ?? []).map((m) => m.client_id)
    );
    await fetchMissingClients(allMemberClientIds, clientsMap);

    const membersBySlot: Record<string, { client_id: string; has_override: boolean }[]> = {};
    slots.forEach((s) => {
      membersBySlot[s.id] = (s.simulation_scenario_members ?? []).map((m) => ({
        client_id: m.client_id,
        has_override: m.has_override,
      }));
    });

    const validation = validateScenario(
      slots,
      membersBySlot,
      clientsMap,
      deps.availByClient,
      deps.prefsByClient,
      deps.programClientIds,
      deps.overriddenClientIds,
      deps.areaIds,
    );

    await supabase
      .from("simulation_scenarios")
      .update({
        validation_status: validation.status,
        validation_details: validation as unknown as Json,
        last_validated_at: new Date().toISOString(),
      })
      .eq("id", deps.activeScenarioId);

    queryClient.invalidateQueries({ queryKey: scenarioKeys.all });
    toast({
      title: `Validatie: ${validation.status === "geldig" ? "Geldig ✓" : validation.status === "aandacht_vereist" ? "Aandacht vereist ⚠" : "Ongeldig ✗"}`,
    });
  }, [deps, toast, queryClient, buildClientsMap, fetchMissingClients]);

  const handleConvert = useCallback(async () => {
    if (!deps.activeScenarioId) {
      toast({ title: "Sla eerst het scenario op", variant: "destructive" });
      return;
    }
    if (deps.isDirty) {
      toast({ title: "Sla eerst op", description: "Er zijn onopgeslagen wijzigingen.", variant: "destructive" });
      return;
    }

    deps.setConverting(true);
    try {
      const { data: scenario, error: fetchErr } = await supabase
        .from("simulation_scenarios")
        .select(`
          id, validation_status,
          simulation_scenario_slots (
            id, area_id, age_category, mode, proposal_idx, day_name, start_time, end_time, confirmed,
            simulation_scenario_members (client_id, has_override)
          )
        `)
        .eq("id", deps.activeScenarioId)
        .single();

      if (fetchErr || !scenario) throw fetchErr ?? new Error("Scenario niet gevonden");

      const slots = scenario.simulation_scenario_slots ?? [];
      const clientsMap = buildClientsMap();

      const allMemberClientIds = slots.flatMap((s) =>
        (s.simulation_scenario_members ?? []).map((m) => m.client_id)
      );
      await fetchMissingClients(allMemberClientIds, clientsMap);

      const membersBySlot: Record<string, { client_id: string; has_override: boolean }[]> = {};
      slots.forEach((s) => {
        membersBySlot[s.id] = (s.simulation_scenario_members ?? []).map((m) => ({
          client_id: m.client_id,
          has_override: m.has_override,
        }));
      });

      const validation = validateScenario(
        slots,
        membersBySlot,
        clientsMap,
        deps.availByClient,
        deps.prefsByClient,
        deps.programClientIds,
        deps.overriddenClientIds,
        deps.areaIds,
      );

      await supabase
        .from("simulation_scenarios")
        .update({
          validation_status: validation.status,
          validation_details: validation as unknown as Record<string, unknown>,
          last_validated_at: new Date().toISOString(),
        })
        .eq("id", deps.activeScenarioId);

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

      const { data: results, error: convertErr } = await supabase.rpc("convert_scenario_to_planning", {
        p_scenario_id: deps.activeScenarioId,
      });

      if (convertErr) throw convertErr;

      deps.setConvertResultDialog(results as unknown as ConvertResult[]);
      queryClient.invalidateQueries({ queryKey: scenarioKeys.all });
      queryClient.invalidateQueries({ queryKey: clientKeys.all });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      toast({ title: "Fout bij omzetten", description: message, variant: "destructive" });
    } finally {
      deps.setConverting(false);
    }
  }, [deps, toast, queryClient, buildClientsMap, fetchMissingClients]);

  return { handleSaveScenario, handleValidate, handleConvert };
}
