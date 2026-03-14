import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Users, ArrowRight, Eye, Star, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { resolveAreaId, getAgeCategoryPlanning, getMissingFields, buildPrefsByClientMap, getMatchType, type AgeCategory } from "@/lib/DomainResolver";
import { clientKeys, areaKeys } from "@/lib/queryKeys";

interface Props {
  onSelectGroup?: (areaId: string, ageCategory: string) => void;
  onViewAvailability?: (areaId: string) => void;
  filterArea?: string;
}

export default function WaitlistOverview({ onSelectGroup, onViewAvailability, filterArea }: Props) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [fixingAreas, setFixingAreas] = useState(false);

  const { data: clients = [] } = useQuery({
    queryKey: clientKeys.waitlistOverview,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name, date_of_birth, dob_estimated, waitlist_area_id, all_areas_flexible, intake_status, school_id, neighborhood_id, neighborhoods:neighborhood_id(id, area_id, areas(id, name)), schools(id, name, neighborhood_id, neighborhoods(id, area_id, areas(id, name)))")
        .eq("archived", false)
        .in("intake_status", ["wachtlijst", "intake_afgerond"]);
      if (error) throw error;
      return data ?? [];
    },
  });

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

  const { data: areas = [] } = useQuery({
    queryKey: areaKeys.all,
    queryFn: async () => {
      const { data, error } = await supabase.from("areas").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const prefsByClient = useMemo(() => buildPrefsByClientMap(allPreferences), [allPreferences]);

  const ageCategories: AgeCategory[] = ["4-7 jaar", "8-12 jaar"];

  // Build matrix: area × age → { intake: client[], wachtlijst: client[], reserveIntake: client[], reserveWachtlijst: client[] }
  const matrix = useMemo(() => {
    const m: Record<string, Record<string, { intake: typeof clients; wachtlijst: typeof clients; reserveIntake: typeof clients; reserveWachtlijst: typeof clients }>> = {};
    let noArea = 0;
    let noDob = 0;
    let outsideRange = 0;
    let estimatedDob = 0;
    const estimatedDobClients: typeof clients = [];

    areas.forEach((a) => {
      m[a.id] = {
        "4-7 jaar": { intake: [], wachtlijst: [], reserveIntake: [], reserveWachtlijst: [] },
        "8-12 jaar": { intake: [], wachtlijst: [], reserveIntake: [], reserveWachtlijst: [] },
      };
    });

    const fixableClients: { clientId: string; areaId: string }[] = [];

    clients.forEach((c) => {
      const primaryAreaId = resolveAreaId(c);
      const age = getAgeCategoryPlanning(c.date_of_birth);
      const isIntake = (c.intake_status ?? "wachtlijst") === "intake_afgerond";
      
      if (!c.date_of_birth) {
        noDob++;
      } else if (!age) {
        outsideRange++;
      }
      if (c.dob_estimated) { estimatedDob++; estimatedDobClients.push(c); }

      if (!c.waitlist_area_id && c.schools?.neighborhoods?.area_id) {
        fixableClients.push({ clientId: c.id, areaId: c.schools.neighborhoods.area_id });
      }

      if (!primaryAreaId) {
        if (age) noArea++;
        return;
      }
      if (!age) return;

      // Primary area
      if (m[primaryAreaId]) {
        if (isIntake) m[primaryAreaId][age].intake.push(c);
        else m[primaryAreaId][age].wachtlijst.push(c);
      }

      // Reserve areas (using preference_order via central helper)
      const prefs = prefsByClient[c.id];
      if (prefs) {
        Object.entries(prefs).forEach(([areaId, _order]) => {
          if (areaId !== primaryAreaId && m[areaId]) {
            if (isIntake) m[areaId][age].reserveIntake.push(c);
            else m[areaId][age].reserveWachtlijst.push(c);
          }
        });
      }

      // Flexible
      if (c.all_areas_flexible) {
        areas.forEach((a) => {
          if (a.id !== primaryAreaId && m[a.id] && !(prefs && prefs[a.id])) {
            if (isIntake) m[a.id][age].reserveIntake.push(c);
            else m[a.id][age].reserveWachtlijst.push(c);
          }
        });
      }
    });

    return { m, noArea, noDob, outsideRange, estimatedDob, estimatedDobClients, fixableClients };
  }, [clients, areas, prefsByClient]);

  const activeAreas = useMemo(() => {
    return areas.filter((a) => {
      // Apply global area filter
      if (filterArea && filterArea !== "alle" && a.id !== filterArea) return false;
      const row = matrix.m[a.id];
      if (!row) return false;
      return ageCategories.some(age => {
        const cell = row[age];
        return cell.intake.length + cell.wachtlijst.length + cell.reserveIntake.length + cell.reserveWachtlijst.length > 0;
      });
    });
  }, [areas, matrix, filterArea]);

  const totals = useMemo(() => {
    const t: Record<string, { intake: number; wachtlijst: number; reserve: number }> = {
      "4-7 jaar": { intake: 0, wachtlijst: 0, reserve: 0 },
      "8-12 jaar": { intake: 0, wachtlijst: 0, reserve: 0 },
    };
    Object.values(matrix.m).forEach(row => {
      ageCategories.forEach(age => {
        const cell = row[age];
        if (!cell) return;
        t[age].intake += cell.intake.length;
        t[age].wachtlijst += cell.wachtlijst.length;
        t[age].reserve += cell.reserveIntake.length + cell.reserveWachtlijst.length;
      });
    });
    return t;
  }, [matrix]);

  // Count totals for summary
  const totalIntake = clients.filter((c) => c.intake_status === "intake_afgerond").length;
  const totalWachtlijst = clients.filter((c) => c.intake_status === "wachtlijst").length;

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Summary */}
        <div className="flex flex-wrap gap-3">
          <Badge variant="outline" className="text-sm px-3 py-1 border-muted-foreground/30">
            <Users className="h-3.5 w-3.5 mr-1.5" />
            {clients.length} totaal
          </Badge>
          <Badge variant="outline" className="text-sm px-3 py-1 border-info-border text-info-foreground">
            {totalIntake} intake afgerond
          </Badge>
          <Badge variant="outline" className="text-sm px-3 py-1 border-warning-border text-warning-foreground">
            {totalWachtlijst} wachtlijst
          </Badge>
          {matrix.noArea > 0 && (
            <Badge variant="outline" className="text-sm px-3 py-1 border-warning-border text-warning-foreground">
              {matrix.noArea} zonder gebied
            </Badge>
          )}
          {matrix.noDob > 0 && (
            <Badge variant="outline" className="text-sm px-3 py-1 border-destructive/30 text-destructive">
              {matrix.noDob} zonder geboortedatum
            </Badge>
          )}
          {matrix.outsideRange > 0 && (
            <Badge variant="outline" className="text-sm px-3 py-1 border-role-border text-role-foreground">
              {matrix.outsideRange} buiten leeftijdsbereik (5-12)
            </Badge>
          )}
          {matrix.estimatedDob > 0 && (
            <Popover>
              <PopoverTrigger className="inline-flex items-center rounded-full border px-3 py-1 text-sm font-semibold border-warning-border text-warning-foreground cursor-pointer hover:bg-warning-muted">
                  ⚠ {matrix.estimatedDob} geschatte geboortedatum
              </PopoverTrigger>
              <PopoverContent className="w-72 max-h-64 overflow-y-auto p-2" align="start">
                <p className="text-xs font-semibold text-muted-foreground mb-2">Geschatte geboortedatum (uit import)</p>
                <div className="space-y-1">
                  {matrix.estimatedDobClients.map((c: any) => (
                    <button
                      key={c.id}
                      className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted/50 transition-colors text-primary hover:underline"
                      onClick={() => navigate(`/clienten/${c.id}`)}
                    >
                      {c.first_name} {c.last_name}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>

        {/* Auto-fix area for clients with school */}
        {matrix.fixableClients.length > 0 && (
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-center justify-between">
            <p className="text-sm text-foreground">
              <strong>{matrix.fixableClients.length}</strong> aanmelder(s) hebben een school maar geen gebied — automatisch koppelen?
            </p>
            <Button
              size="sm"
              disabled={fixingAreas}
              onClick={async () => {
                setFixingAreas(true);
                let fixed = 0;
                for (const { clientId, areaId } of matrix.fixableClients) {
                  const { error } = await supabase
                    .from("clients")
                    .update({ waitlist_area_id: areaId })
                    .eq("id", clientId);
                  if (!error) fixed++;
                }
                toast({ title: `${fixed} aanmelder(s) gebied toegewezen` });
                queryClient.invalidateQueries({ queryKey: clientKeys.all });
                setFixingAreas(false);
              }}
            >
              {fixingAreas ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Gebieden koppelen
            </Button>
          </div>
        )}

        {/* Matrix grid */}
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Gebied
                </th>
                {ageCategories.map(age => (
                  <th key={age} className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {age}
                  </th>
                ))}
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Totaal
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {activeAreas.map((area: any) => {
                const row = matrix.m[area.id];
                const areaTotal = ageCategories.reduce((sum, age) => {
                  const cell = row[age];
                  return sum + cell.intake.length + cell.wachtlijst.length + cell.reserveIntake.length + cell.reserveWachtlijst.length;
                }, 0);

                return (
                  <tr key={area.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-sm font-semibold text-foreground">{area.name}</span>
                    </td>
                    {ageCategories.map(age => {
                      const cell = row[age];
                      const intakeCount = cell.intake.length;
                      const wachtlijstCount = cell.wachtlijst.length;
                      const primaryTotal = intakeCount + wachtlijstCount;
                      const reserveTotal = cell.reserveIntake.length + cell.reserveWachtlijst.length;
                      const total = primaryTotal + reserveTotal;
                      const ready = total >= 7;
                      const partial = total >= 5;

                      return (
                        <td key={age} className="px-4 py-3 text-center">
                          {total > 0 ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => onSelectGroup?.(area.id, age)}
                                  className={`inline-flex flex-col items-center rounded-lg px-3 py-1.5 text-sm font-bold transition-colors min-w-[80px] ${
                                    ready
                                      ? "bg-success-muted text-success-foreground hover:bg-success-muted/80 border border-success-border"
                                      : partial
                                      ? "bg-warning-muted text-warning-foreground hover:bg-warning-muted/80 border border-warning-border"
                                      : "bg-destructive/10 text-destructive hover:bg-destructive/15 border border-destructive/30"
                                  }`}
                                >
                                  <span className="flex items-center gap-1.5">
                                    {intakeCount > 0 && (
                                      <span className="text-info-foreground">{intakeCount}i</span>
                                    )}
                                    {intakeCount > 0 && wachtlijstCount > 0 && (
                                      <span className="text-muted-foreground">+</span>
                                    )}
                                    {wachtlijstCount > 0 && (
                                      <span className="text-warning-foreground">{wachtlijstCount}w</span>
                                    )}
                                    {ready && <ArrowRight className="h-3 w-3" />}
                                  </span>
                                  {reserveTotal > 0 && (
                                    <span className="text-[10px] font-medium opacity-70 flex items-center gap-0.5">
                                      <Star className="h-2.5 w-2.5" />
                                      +{reserveTotal} reserve
                                    </span>
                                  )}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="font-medium">{intakeCount} intake afgerond, {wachtlijstCount} wachtlijst</p>
                                {reserveTotal > 0 && <p>{reserveTotal} reserve/flexibel</p>}
                                {ready && <p className="font-semibold text-success">Groep mogelijk!</p>}
                              </TooltipContent>
                            </Tooltip>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-center">
                      <span className="text-sm font-bold text-foreground">{areaTotal}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1 text-primary hover:text-primary"
                        onClick={() => onViewAvailability?.(area.id)}
                      >
                        <Eye className="h-3 w-3" />
                        Beschikbaarheid
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {activeAreas.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Geen aanmelders op de wachtlijst
                  </td>
                </tr>
              )}
            </tbody>
            {activeAreas.length > 0 && (
              <tfoot>
                <tr className="border-t border-border bg-muted/30">
                  <td className="px-4 py-2 text-xs font-semibold uppercase text-muted-foreground">Totaal</td>
                  {ageCategories.map(age => (
                    <td key={age} className="px-4 py-2 text-center text-sm font-bold text-foreground">
                      <span className="text-info-foreground">{totals[age].intake}i</span>
                      <span className="text-muted-foreground mx-0.5">+</span>
                      <span className="text-warning-foreground">{totals[age].wachtlijst}w</span>
                      {totals[age].reserve > 0 && (
                        <span className="text-xs font-normal text-muted-foreground ml-1">+{totals[age].reserve}</span>
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-center text-sm font-bold text-foreground">
                    {clients.length - matrix.noArea - matrix.noDob - matrix.outsideRange}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <p className="text-xs text-muted-foreground">
          <span className="inline-block w-3 h-3 rounded bg-success-muted border border-success-border mr-1 align-middle" /> ≥7 (gereed)
          <span className="inline-block w-3 h-3 rounded bg-warning-muted border border-warning-border mr-1 ml-3 align-middle" /> 5-6 (bijna)
          <span className="inline-block w-3 h-3 rounded bg-destructive/10 border border-destructive/30 mr-1 ml-3 align-middle" /> &lt;5
          <span className="ml-3"><span className="text-info-foreground font-semibold">i</span>=intake afgerond <span className="text-warning-foreground font-semibold">w</span>=wachtlijst</span>
        </p>
      </div>
    </TooltipProvider>
  );
}
