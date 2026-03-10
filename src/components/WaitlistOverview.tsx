import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { differenceInYears, parseISO } from "date-fns";
import { Users, ArrowRight, Eye, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type AgeCategory = "5-7 jaar" | "8-12 jaar";

function getAgeCategory(dob: string | null): AgeCategory | null {
  if (!dob) return null;
  const age = differenceInYears(new Date(), parseISO(dob));
  if (age >= 5 && age <= 7) return "5-7 jaar";
  if (age >= 8 && age <= 12) return "8-12 jaar";
  return null;
}

interface Props {
  onSelectGroup?: (areaId: string, ageCategory: string) => void;
  onViewAvailability?: (areaId: string) => void;
}

export default function WaitlistOverview({ onSelectGroup, onViewAvailability }: Props) {
  const navigate = useNavigate();

  const { data: clients = [] } = useQuery({
    queryKey: ["clients", "waitlist-overview"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name, date_of_birth, waitlist_area_id, all_areas_flexible, school_id, schools(id, name, neighborhood_id, neighborhoods(id, area_id, areas(id, name)))")
        .eq("archived", false)
        .in("intake_status", ["wachtlijst", "intake_afgerond"]);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch area preferences for all waitlist clients
  const { data: allPreferences = [] } = useQuery({
    queryKey: ["clients", "waitlist-overview-prefs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_area_preferences")
        .select("client_id, area_id, preference_order");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: areas = [] } = useQuery({
    queryKey: ["waitlist-overview-areas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("areas").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Build a map: clientId -> set of reserve area IDs
  const prefsByClient = useMemo(() => {
    const m: Record<string, Set<string>> = {};
    allPreferences.forEach((p: any) => {
      if (!m[p.client_id]) m[p.client_id] = new Set();
      m[p.client_id].add(p.area_id);
    });
    return m;
  }, [allPreferences]);

  const resolveAreaId = (client: any): string | null => {
    if (client.waitlist_area_id) return client.waitlist_area_id;
    return (client as any).schools?.neighborhoods?.area_id ?? null;
  };

  const ageCategories: AgeCategory[] = ["5-7 jaar", "8-12 jaar"];

  // Build matrix: area × age → { primary: client[], reserve: client[] }
  const matrix = useMemo(() => {
    const m: Record<string, Record<string, { primary: any[]; reserve: any[] }>> = {};
    let noArea = 0;
    let noAge = 0;

    areas.forEach((a: any) => {
      m[a.id] = {
        "5-7 jaar": { primary: [], reserve: [] },
        "8-12 jaar": { primary: [], reserve: [] },
      };
    });

    clients.forEach((c: any) => {
      const primaryAreaId = resolveAreaId(c);
      const age = getAgeCategory(c.date_of_birth);
      if (!age) { noAge++; return; }

      // Primary area
      if (primaryAreaId && m[primaryAreaId]) {
        m[primaryAreaId][age].primary.push(c);
      } else if (!primaryAreaId) {
        noArea++;
      }

      // Reserve areas
      const reserveAreas = prefsByClient[c.id];
      if (reserveAreas) {
        reserveAreas.forEach((areaId) => {
          if (areaId !== primaryAreaId && m[areaId]) {
            m[areaId][age].reserve.push(c);
          }
        });
      }

      // All areas flexible
      if ((c as any).all_areas_flexible) {
        areas.forEach((a: any) => {
          if (a.id !== primaryAreaId && m[a.id] && !reserveAreas?.has(a.id)) {
            m[a.id][age].reserve.push(c);
          }
        });
      }
    });

    return { m, noArea, noAge };
  }, [clients, areas, prefsByClient]);

  // Only show areas that have at least 1 waitlist client (primary or reserve)
  const activeAreas = useMemo(() => {
    return areas.filter((a: any) => {
      const row = matrix.m[a.id];
      if (!row) return false;
      return ageCategories.some(age => {
        const cell = row[age];
        return cell.primary.length > 0 || cell.reserve.length > 0;
      });
    });
  }, [areas, matrix]);

  const totals = useMemo(() => {
    const t: Record<string, { primary: number; reserve: number }> = {
      "5-7 jaar": { primary: 0, reserve: 0 },
      "8-12 jaar": { primary: 0, reserve: 0 },
    };
    Object.values(matrix.m).forEach(row => {
      ageCategories.forEach(age => {
        t[age].primary += row[age]?.primary.length ?? 0;
        t[age].reserve += row[age]?.reserve.length ?? 0;
      });
    });
    return t;
  }, [matrix]);

  return (
    <TooltipProvider>
      <div className="space-y-4">
        {/* Summary */}
        <div className="flex flex-wrap gap-3">
          <Badge variant="outline" className="text-sm px-3 py-1 border-muted-foreground/30">
            <Users className="h-3.5 w-3.5 mr-1.5" />
            {clients.length} totaal op wachtlijst
          </Badge>
          {ageCategories.map(age => (
            <Badge key={age} variant="outline" className="text-sm px-3 py-1 border-primary/30 text-primary">
              {age}: {totals[age].primary}
              {totals[age].reserve > 0 && (
                <span className="text-muted-foreground ml-1">(+{totals[age].reserve} reserve)</span>
              )}
            </Badge>
          ))}
          {(matrix.noArea > 0 || matrix.noAge > 0) && (
            <Badge variant="outline" className="text-sm px-3 py-1 border-destructive/30 text-destructive">
              {matrix.noArea + matrix.noAge} zonder gebied/leeftijd
            </Badge>
          )}
        </div>

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
                  return sum + cell.primary.length + cell.reserve.length;
                }, 0);

                return (
                  <tr key={area.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-sm font-semibold text-foreground">{area.name}</span>
                    </td>
                    {ageCategories.map(age => {
                      const cell = row[age];
                      const primary = cell.primary.length;
                      const reserve = cell.reserve.length;
                      const total = primary + reserve;
                      const ready = total >= 7;
                      const partial = total >= 5;

                      return (
                        <td key={age} className="px-4 py-3 text-center">
                          {total > 0 ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => onSelectGroup?.(area.id, age)}
                                  className={`inline-flex flex-col items-center rounded-lg px-3 py-1.5 text-sm font-bold transition-colors min-w-[60px] ${
                                    ready
                                      ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-300"
                                      : partial
                                      ? "bg-amber-100 text-amber-800 hover:bg-amber-200 border border-amber-300"
                                      : "bg-red-100 text-red-800 hover:bg-red-200 border border-red-300"
                                  }`}
                                >
                                  <span className="flex items-center gap-1">
                                    {primary}
                                    {ready && <ArrowRight className="h-3 w-3" />}
                                  </span>
                                  {reserve > 0 && (
                                    <span className="text-[10px] font-medium opacity-70 flex items-center gap-0.5">
                                      <Star className="h-2.5 w-2.5" />
                                      +{reserve} reserve
                                    </span>
                                  )}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{primary} primair{reserve > 0 ? `, ${reserve} reserve/flexibel` : ""}</p>
                                {ready && <p className="font-semibold text-emerald-600">Groep mogelijk!</p>}
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
                    Geen deelnemers op de wachtlijst
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
                      {totals[age].primary}
                      {totals[age].reserve > 0 && (
                        <span className="text-xs font-normal text-muted-foreground ml-1">+{totals[age].reserve}</span>
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-center text-sm font-bold text-foreground">
                    {clients.length - matrix.noArea - matrix.noAge}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <p className="text-xs text-muted-foreground">
          <span className="inline-block w-3 h-3 rounded bg-emerald-200 border border-emerald-300 mr-1 align-middle" /> ≥7 deelnemers (gereed)
          <span className="inline-block w-3 h-3 rounded bg-amber-200 border border-amber-300 mr-1 ml-3 align-middle" /> 5-6 deelnemers (bijna gereed)
          <span className="inline-block w-3 h-3 rounded bg-red-200 border border-red-300 mr-1 ml-3 align-middle" /> &lt;5 deelnemers
          <span className="ml-3">Getallen: <strong>primair</strong> <span className="opacity-60">+reserve</span></span>
        </p>
      </div>
    </TooltipProvider>
  );
}
