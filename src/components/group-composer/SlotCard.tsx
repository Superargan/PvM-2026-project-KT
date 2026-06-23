import React from "react";
import {
  AlertTriangle,
  Calendar,
  CalendarClock,
  Check,
  CheckCircle2,
  FlaskConical,
  Link2,
  Maximize2,
  Search,
  UserCog,
  Unlink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getAlternativeWindowsForDay } from "@/lib/DomainResolver";
import { buildAvailabilityByClient, buildPrefsByClientMap } from "@/lib/clientUtils";
import type {
  AvailabilitySuggestion,
  ClientWithMatch,
  GroupComposerClient,
  GroupedClients,
  LinkableProgram,
  SimulationEntry,
  TrainerRef,
} from "./types";
import { SUB_GROUP_LABELS } from "./types";
import {
  computeSlotFit,
  getBlockReason,
  getGroupKey,
  getReserveCandidates,
  getStatusInfo,
  trainerLabel,
} from "./utils";

export interface SlotCardProps {
  group: GroupedClients;
  selected: Set<string>;
  isCreating: boolean;
  isExpanded: boolean;
  isSimulating: boolean;
  isDirty: boolean;
  simulatedGroupsSize: number;
  activeScenarioId?: string | null;
  canCreateDefinitiveGroup: boolean;
  simulated: SimulationEntry | undefined;
  showReserve: boolean;
  expandedAlternatives: Set<string>;
  intakeClients: ClientWithMatch[];
  wachtlijstClients: ClientWithMatch[];
  selectedReserves: ClientWithMatch[];
  unselectedReserves: ClientWithMatch[];
  linkedProgramId: string | undefined;
  startDate: string | undefined;
  oudertrainerId: string | undefined;
  kindtrainerId: string | undefined;
  linkablePrograms: LinkableProgram[];
  oudertrainers: TrainerRef[];
  kindtrainers: TrainerRef[];
  waitlistClients: GroupComposerClient[];
  prefsByClient: ReturnType<typeof buildPrefsByClientMap>;
  availByClient: ReturnType<typeof buildAvailabilityByClient>;
  onToggleExpand: () => void;
  onToggleAll: () => void;
  onToggleReserveSearch: () => void;
  onLinkProgram: (programId: string | null) => void;
  onStartDateChange: (date: string) => void;
  onOudertrainerChange: (id: string) => void;
  onKindtrainerChange: (id: string) => void;
  onToggleSimulation: (proposalIdx: number, suggestion: AvailabilitySuggestion | null) => void;
  onToggleAlternativesExpand: (altKey: string) => void;
  onRequestCreateGroup: () => void;
  renderMember: (cm: ClientWithMatch) => React.ReactNode;
  getSuggestions: (clientIds: Set<string>) => AvailabilitySuggestion[];
}

function SlotCardImpl(props: SlotCardProps) {
  const {
    group,
    selected,
    isCreating,
    isExpanded,
    isSimulating,
    isDirty,
    simulatedGroupsSize,
    activeScenarioId,
    canCreateDefinitiveGroup,
    simulated,
    showReserve,
    expandedAlternatives,
    intakeClients,
    wachtlijstClients,
    selectedReserves,
    unselectedReserves,
    linkedProgramId,
    startDate,
    oudertrainerId,
    kindtrainerId,
    linkablePrograms,
    oudertrainers,
    kindtrainers,
    waitlistClients,
    prefsByClient,
    availByClient,
    onToggleExpand,
    onToggleAll,
    onToggleReserveSearch,
    onLinkProgram,
    onStartDateChange,
    onOudertrainerChange,
    onKindtrainerChange,
    onToggleSimulation,
    onToggleAlternativesExpand,
    onRequestCreateGroup,
    renderMember,
    getSuggestions,
  } = props;

  const key = getGroupKey(group);
  const isGroupSimulated = simulated !== undefined;
  const activeSuggestion = simulated?.suggestion ?? null;
  const slotFit = computeSlotFit(selected, activeSuggestion);
  const hasSlotFit = activeSuggestion !== null && slotFit.optimalGroupSize > 0;
  const effectiveSize = hasSlotFit ? slotFit.optimalGroupSize : selected.size;
  const status = getStatusInfo(effectiveSize);
  const StatusIcon = status.iconType === "check" ? Check : AlertTriangle;

  const selectedProg = linkedProgramId ? linkablePrograms.find((p) => p.id === linkedProgramId) : null;
  const matchingProgs = linkablePrograms.filter((p) => p.area_id === group.areaId && (!p.age_category || p.age_category === group.ageCategory));
  const otherProgs = linkablePrograms.filter((p) => p.area_id !== group.areaId || (p.age_category && p.age_category !== group.ageCategory));

  const suggestions = getSuggestions(selected);
  const clientsWithAvail = Array.from(selected).filter(id => availByClient[id]?.length > 0).length;

  return (
    <Card className={`min-h-[220px] flex flex-col border-border ${isExpanded ? "col-span-2" : ""} ${isGroupSimulated ? "ring-2 ring-primary/40 bg-primary/[0.02]" : ""}`}>
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
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onToggleExpand}>
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              <span className="text-info-foreground">{intakeClients.length} intake afgerond</span>
              {wachtlijstClients.length > 0 && <span className="text-warning-foreground ml-1">· {wachtlijstClients.length} wachtlijst</span>}
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
      <CardContent className="flex-1 space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Aanmelders</span>
            <button className="text-xs text-primary hover:underline" onClick={onToggleAll}>
              {selected.size === group.clients.length ? "Deselecteer alles" : "Selecteer alles"}
            </button>
          </div>
          <div className="max-h-72 overflow-y-auto space-y-0.5 pr-1">
            {intakeClients.length > 0 && (
              <>
                <div className="text-[10px] font-semibold text-info-foreground uppercase tracking-wider px-2 pt-1 pb-0.5">Intake afgerond ({intakeClients.length})</div>
                {intakeClients.map(cm => <React.Fragment key={cm.client.id}>{renderMember(cm)}</React.Fragment>)}
              </>
            )}
            {wachtlijstClients.length > 0 && (
              <>
                <div className="text-[10px] font-semibold text-warning-foreground uppercase tracking-wider px-2 pt-2 pb-0.5">Wachtlijst ({wachtlijstClients.length})</div>
                {wachtlijstClients.map(cm => <React.Fragment key={cm.client.id}>{renderMember(cm)}</React.Fragment>)}
              </>
            )}
            {selectedReserves.length > 0 && (
              <>
                <div className="text-[10px] font-semibold text-role-foreground uppercase tracking-wider px-2 pt-2 pb-0.5 flex items-center gap-1">
                  <Search className="h-2.5 w-2.5" /> Uit reservegebied ({selectedReserves.length})
                </div>
                {selectedReserves.map(cm => <React.Fragment key={cm.client.id}>{renderMember(cm)}</React.Fragment>)}
              </>
            )}
          </div>
        </div>

        <Button variant="outline" size="sm" className="w-full text-xs gap-1.5" onClick={onToggleReserveSearch}>
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
                {unselectedReserves.map(cm => <React.Fragment key={cm.client.id}>{renderMember(cm)}</React.Fragment>)}
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
                      <CommandItem value="__nieuw_programma__" onSelect={() => onLinkProgram(null)}>
                        <span className="text-muted-foreground">Nieuw programma aanmaken</span>
                      </CommandItem>
                    </CommandGroup>
                    {matchingProgs.length > 0 && (
                      <CommandGroup heading="Matching programma's">
                        {matchingProgs.map((p) => (
                          <CommandItem key={p.id} value={`${p.name} ${p.training_number ?? ''} ${p.status}`} onSelect={() => onLinkProgram(p.id)}>
                            <Check className={`mr-1 h-3 w-3 ${linkedProgramId === p.id ? "opacity-100" : "opacity-0"}`} />
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
                            <CommandItem key={p.id} value={`${p.name} ${p.training_number ?? ''} ${p.areas?.name ?? ''} ${p.age_category ?? ''} ${p.status}`} onSelect={() => onLinkProgram(p.id)}>
                              <Check className={`mr-1 h-3 w-3 ${linkedProgramId === p.id ? "opacity-100" : "opacity-0"}`} />
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
            {linkedProgramId && (
              <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => onLinkProgram(null)}>
                <Unlink className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            )}
          </div>
          {linkedProgramId && (
            <p className="text-[10px] text-info-foreground flex items-center gap-1">
              <Link2 className="h-3 w-3" /> Deelnemers worden bij omzetting <strong>toegevoegd</strong> aan dit programma
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
            <Calendar className="h-3 w-3" /> Vermoedelijke startdatum
          </label>
          <Input type="date" className="h-9 text-xs" value={startDate ?? ""} onChange={(e) => onStartDateChange(e.target.value)} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <UserCog className="h-3 w-3" /> Oudertrainer
            </label>
            <Select value={oudertrainerId ?? ""} onValueChange={onOudertrainerChange}>
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
            <Select value={kindtrainerId ?? ""} onValueChange={onKindtrainerChange}>
              <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Selecteer..." /></SelectTrigger>
              <SelectContent className="bg-popover">
                {kindtrainers.map((t) => <SelectItem key={t.id} value={t.id}>{trainerLabel(t)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Availability suggestions */}
        {clientsWithAvail === 0 ? (
          <div className="rounded-lg border border-border bg-muted/30 p-3 flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-muted-foreground shrink-0" />
            <p className="text-xs text-muted-foreground">Geen beschikbaarheid ingevuld — voeg beschikbaarheid toe voor een voorstel.</p>
          </div>
        ) : suggestions.length === 0 ? (
          <div className="rounded-lg border border-warning-border bg-warning-muted/50 p-3 flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-warning shrink-0" />
            <p className="text-xs text-warning-foreground">Geen overlappend moment gevonden. {clientsWithAvail}/{selected.size} aanmelders hebben beschikbaarheid.</p>
          </div>
        ) : (
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
                        onClick={() => onToggleSimulation(idx, suggestion)}
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
                    </div>
                    {excludedCount > 0 && (
                      <div className="pl-6 flex flex-wrap gap-1 pt-1">
                        <span className="text-[10px] font-semibold text-warning-foreground uppercase tracking-wider">Niet beschikbaar:</span>
                        {suggestionFit.excludedClients.map(exc => {
                          const client = [...group.clients.map(cm => cm.client), ...getReserveCandidates(group, waitlistClients, prefsByClient).map(cm => cm.client)]
                            .find(c => c.id === exc.clientId);
                          return client ? (
                            <Badge key={exc.clientId} variant="outline" className="text-[10px] px-1.5 py-0 border-warning-border text-warning-foreground">
                              {client.first_name} {client.last_name}
                            </Badge>
                          ) : null;
                        })}
                      </div>
                    )}
                    {(suggestion.alternativesOnDay ?? 0) > 0 && (
                      <div className="pl-6 pt-0.5">
                        <button
                          className="text-xs text-info font-medium hover:underline cursor-pointer"
                          onClick={() => onToggleAlternativesExpand(altKey)}
                        >
                          {showAlts ? "Verberg" : `+${suggestion.alternativesOnDay}`} {suggestion.alternativesOnDay === 1 ? "ander moment" : "andere momenten"} op {suggestion.dayName}
                        </button>
                      </div>
                    )}
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
                            <div key={altIdx} className={`rounded-lg border p-2.5 space-y-1 ${isAltSimulated ? "border-primary ring-1 ring-primary/30 bg-primary/5" : "border-border bg-muted/10"}`}>
                              <div className="flex items-center justify-between">
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
                                  onClick={() => onToggleSimulation(idx, alt)}
                                  disabled={selected.size === 0}
                                >
                                  {isAltSimulated ? <><CheckCircle2 className="h-3 w-3" /> Gesimuleerd</> : <><FlaskConical className="h-3 w-3" /> Simuleer</>}
                                </Button>
                              </div>
                              {altExcluded > 0 && (
                                <div className="pl-5 flex flex-wrap gap-1">
                                  <span className="text-[10px] font-semibold text-warning-foreground uppercase tracking-wider">Niet beschikbaar:</span>
                                  {altFit.excludedClients.map(exc => {
                                    const client = [...group.clients.map(cm => cm.client), ...getReserveCandidates(group, waitlistClients, prefsByClient).map(cm => cm.client)]
                                      .find(c => c.id === exc.clientId);
                                    return client ? (
                                      <Badge key={exc.clientId} variant="outline" className="text-[10px] px-1.5 py-0 border-warning-border text-warning-foreground">
                                        {client.first_name} {client.last_name}
                                      </Badge>
                                    ) : null;
                                  })}
                                </div>
                              )}
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
        )}

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="w-full">
                <Button className="w-full" onClick={onRequestCreateGroup} disabled={isCreating || selected.size === 0 || !canCreateDefinitiveGroup}>
                  {isCreating ? "Aanmaken..." : `Groep definitief aanmaken (${effectiveSize})`}
                </Button>
              </span>
            </TooltipTrigger>
            {!canCreateDefinitiveGroup && <TooltipContent><p className="text-xs">{getBlockReason(isSimulating, isDirty, simulatedGroupsSize, activeScenarioId)}</p></TooltipContent>}
          </Tooltip>
        </TooltipProvider>
      </CardContent>
    </Card>
  );
}

export const SlotCard = React.memo(SlotCardImpl);