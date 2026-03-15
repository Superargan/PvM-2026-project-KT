/**
 * Pure utility functions for GroupComposer.
 * No React, no side effects — just data transformations.
 */

import { Check, AlertTriangle } from "lucide-react";
import { createElement, type ReactNode } from "react";
import {
  calculateAge,
  getAgeCategoryPlanning,
  getMatchType,
  matchSortOrder,
  resolveAreaId,
  getTopAvailabilityOverlaps,
} from "@/lib/clientUtils";
import type { AgeCategory, MatchType } from "@/lib/clientUtils";
import type { AreaRef } from "@/lib/queryShapes";
import type {
  GroupComposerClient,
  ClientWithMatch,
  GroupedClients,
  SimulationEntry,
  TrainerRef,
  AvailabilitySuggestion,
  ExportColumn,
  SlotFitResult,
  ExcludedClient,
} from "./types";
import { MAX_GROUP_SIZE, SUB_GROUP_LABELS, PLANNING_EXPORT_COLUMNS } from "./types";

// ─── Group key ──────────────────────────────────────────────────────

export function getGroupKey(g: GroupedClients): string {
  return g.subGroupCount > 1
    ? `${g.areaId}__${g.ageCategory}__${g.subGroupIndex}`
    : `${g.areaId}__${g.ageCategory}`;
}

// ─── Status info ────────────────────────────────────────────────────

export interface GroupStatusInfo {
  color: string;
  label: string;
  iconType: "check" | "warning";
}

export function getStatusInfo(count: number): GroupStatusInfo {
  if (count >= 7) return { color: "text-success-foreground bg-success-muted border-success-border", label: "Gereed om te starten", iconType: "check" };
  if (count >= 5) return { color: "text-warning-foreground bg-warning-muted border-warning-border", label: `Nog ${7 - count} nodig`, iconType: "warning" };
  return { color: "text-destructive bg-destructive/10 border-destructive/30", label: `Nog ${7 - count} nodig`, iconType: "warning" };
}

// ─── Grouping logic ─────────────────────────────────────────────────

export function buildGroups(
  waitlistClients: GroupComposerClient[],
  areas: AreaRef[],
  areaMap: Record<string, string>,
  prefsByClient: Record<string, Record<string, number>>,
  simulatedGroups: Map<string, SimulationEntry>,
  simulatedClientIds: Set<string>,
): GroupedClients[] {
  const result: GroupedClients[] = [];

  areas.forEach((area) => {
    const ageCategories: AgeCategory[] = ["4-7 jaar", "8-12 jaar"];
    ageCategories.forEach((ageCategory) => {
      const baseKey = `${area.id}__${ageCategory}`;
      const isSimulated = Array.from(simulatedGroups.keys()).some(k => k.startsWith(baseKey));
      const matchedClients: ClientWithMatch[] = [];

      waitlistClients.forEach((client) => {
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
}

// ─── Unassigned clients ─────────────────────────────────────────────

export function getUnassignedClients(
  waitlistClients: GroupComposerClient[],
  simulatedClientIds: Set<string>,
): GroupComposerClient[] {
  return waitlistClients.filter((c) => {
    if (simulatedClientIds.has(c.id)) return false;
    return !resolveAreaId(c) || !getAgeCategoryPlanning(c.date_of_birth);
  });
}

// ─── Reserve candidates ─────────────────────────────────────────────

export function getReserveCandidates(
  group: GroupedClients,
  waitlistClients: GroupComposerClient[],
  prefsByClient: Record<string, Record<string, number>>,
): ClientWithMatch[] {
  const existingIds = new Set(group.clients.map(cm => cm.client.id));
  const candidates: ClientWithMatch[] = [];

  waitlistClients.forEach((client) => {
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
}

// ─── Trainer helpers ────────────────────────────────────────────────

export function filterTrainersByType(
  trainers: TrainerRef[],
  type: "oudertrainer" | "kindtrainer",
): TrainerRef[] {
  return trainers.filter(
    (t) => !t.trainer_type || t.trainer_type === type || t.trainer_type === "beide"
  );
}

export function trainerLabel(t: TrainerRef): string {
  if (!t.trainer_type) return `${t.name} (type onbekend)`;
  return t.name ?? "";
}

// ─── Export helpers ─────────────────────────────────────────────────

const statusLabelsMap: Record<string, string> = {
  intake_afgerond: "Intake afgerond",
  wachtlijst: "Wachtlijst",
};

export function buildExportRows(
  filteredGroups: GroupedClients[],
  exportSelected: Set<string>,
  getSelectedForGroup: (g: GroupedClients) => Set<string>,
  getSuggestions: (clientIds: Set<string>) => AvailabilitySuggestion[],
  simulatedGroups: Map<string, SimulationEntry>,
  allTrainers: TrainerRef[],
  selectedOudertrainer: Record<string, string>,
  selectedKindtrainer: Record<string, string>,
  selectedStartDate: Record<string, string>,
  areaMap: Record<string, string>,
): { columns: { key: string; label: string }[]; rows: Record<string, string | number>[] } {
  const selected = PLANNING_EXPORT_COLUMNS.filter(c => exportSelected.has(c.key));
  if (selected.length === 0) return { columns: [], rows: [] };

  const columns = selected.map(c => ({ key: c.key, label: c.label }));
  const rows: Record<string, string | number>[] = [];

  for (const group of filteredGroups) {
    const key = getGroupKey(group);
    const groupSelected = getSelectedForGroup(group);
    const suggestions = getSuggestions(groupSelected);
    const simulated = simulatedGroups.get(key);
    const activeSuggestion = simulated?.suggestion ?? suggestions[0] ?? null;

    const groupClients = group.clients.filter(cm => groupSelected.has(cm.client.id));
    if (groupClients.length === 0) continue;

    const oudertrainer = allTrainers.find((t) => t.id === selectedOudertrainer[key]);
    const kindtrainer = allTrainers.find((t) => t.id === selectedKindtrainer[key]);

    for (const cm of groupClients) {
      const { client, matchType } = cm;
      const row: Record<string, string | number> = {};
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
          case "geslacht": row[col.key] = (client as GroupComposerClient & { gender?: string | null }).gender ?? ""; break;
          case "school": row[col.key] = client.schools?.name ?? ""; break;
          case "intake_status": row[col.key] = statusLabelsMap[client.intake_status ?? ""] ?? client.intake_status ?? ""; break;
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

  return { columns, rows };
}

// ─── Snapshot serialization ─────────────────────────────────────────

export function serializeSnapshot(
  simulatedGroups: Map<string, SimulationEntry>,
  selectedClients: Record<string, Set<string>>,
  linkedPrograms: Record<string, string>,
): string {
  return JSON.stringify({
    simulatedGroups: Array.from(simulatedGroups.entries()),
    selectedClients: Object.fromEntries(
      Object.entries(selectedClients).map(([k, v]) => [k, Array.from(v)])
    ),
    linkedPrograms,
  });
}

// ─── Day name abbreviation ──────────────────────────────────────────

export function abbreviateDayName(dayName: string): string | null {
  const map: Record<string, string> = {
    maandag: "ma", dinsdag: "di", woensdag: "wo", donderdag: "do", vrijdag: "vr",
  };
  return map[dayName] ?? dayName;
}

// ─── Block reason ───────────────────────────────────────────────────

export function getBlockReason(
  isSimulating: boolean,
  isDirty: boolean,
  simulatedGroupsSize: number,
  activeScenarioId: string | null | undefined,
): string {
  if (isSimulating) return "Actieve simulatie — sla eerst op als proforma planning";
  if (isDirty) return "Onopgeslagen wijzigingen — sla eerst op";
  if (simulatedGroupsSize > 0) return "Niet-opgeslagen proforma-data aanwezig";
  if (activeScenarioId !== null && activeScenarioId !== undefined) return "Werkend vanuit proforma — gebruik 'Omzetten naar definitieve planning'";
  return "";
}

// ─── Assigned group label ───────────────────────────────────────────

export function buildAssignedGroupLabel(
  assignedTo: string,
  areaMap: Record<string, string>,
): string {
  const parts = assignedTo.split("__");
  const aName = areaMap[parts[0]] ?? "Onbekend";
  const subLabel = parts[2] !== undefined ? ` ${SUB_GROUP_LABELS[parseInt(parts[2])] ?? ""}` : "";
  return `${aName} ${parts[1]}${subLabel}`;
}
