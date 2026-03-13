import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  format, startOfWeek, endOfWeek, addWeeks, subWeeks,
  startOfMonth, endOfMonth, addMonths, subMonths,
  eachDayOfInterval, parseISO, getDay
} from "date-fns";
import { invalidateAllClientQueries } from "@/lib/queryKeys";
import { nl } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Sun, Moon, Clock, Save, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";

type PeriodMode = "week" | "maand" | "kwartaal";
type Dagdeel = "ochtend" | "middag";

const DAGDELEN: { key: Dagdeel; label: string; icon: React.ReactNode; start: string; end: string }[] = [
  { key: "ochtend", label: "Ochtend", icon: <Sun className="h-3.5 w-3.5" />, start: "09:00", end: "12:30" },
  { key: "middag", label: "Middag", icon: <Moon className="h-3.5 w-3.5" />, start: "13:00", end: "17:00" },
];

const WEEKDAYS = [
  { dow: 1, label: "Maandag", short: "Ma" },
  { dow: 2, label: "Dinsdag", short: "Di" },
  { dow: 3, label: "Woensdag", short: "Wo" },
  { dow: 4, label: "Donderdag", short: "Do" },
  { dow: 5, label: "Vrijdag", short: "Vr" },
  { dow: 6, label: "Zaterdag", short: "Za" },
  { dow: 7, label: "Zondag", short: "Zo" },
];

function jsDayToDow(jsDay: number): number {
  return jsDay === 0 ? 7 : jsDay;
}

interface AvailabilityManagerProps {
  type: "trainer" | "deelnemer";
  fixedPersonId?: string;
}

export default function AvailabilityManager({ type, fixedPersonId }: AvailabilityManagerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [periodMode, setPeriodMode] = useState<PeriodMode>("kwartaal");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedPersonId, setSelectedPersonId] = useState<string>(fixedPersonId ?? "");
  const [saving, setSaving] = useState(false);

  // Grid state: { "1-ochtend": true, "3-middag": true, ... }
  const [selections, setSelections] = useState<Record<string, boolean>>({});
  // Custom times override: { "1-ochtend": { start: "09:30", end: "12:00" } }
  const [customTimes, setCustomTimes] = useState<Record<string, { start: string; end: string }>>({});
  // Track dirty state for unsaved changes warning
  const [isDirty, setIsDirty] = useState(false);

  const dateRange = useMemo(() => {
    if (periodMode === "week") {
      return {
        start: startOfWeek(currentDate, { weekStartsOn: 1 }),
        end: endOfWeek(currentDate, { weekStartsOn: 1 }),
      };
    }
    if (periodMode === "kwartaal") {
      const start = startOfMonth(currentDate);
      return { start, end: endOfMonth(addMonths(start, 3)) };
    }
    return {
      start: startOfMonth(currentDate),
      end: endOfMonth(currentDate),
    };
  }, [periodMode, currentDate]);

  const navigatePeriod = (dir: "prev" | "next") => {
    if (isDirty) {
      const ok = window.confirm("Je hebt onopgeslagen wijzigingen. Wil je doorgaan?");
      if (!ok) return;
    }
    if (periodMode === "week") {
      setCurrentDate(dir === "prev" ? subWeeks(currentDate, 1) : addWeeks(currentDate, 1));
    } else if (periodMode === "kwartaal") {
      setCurrentDate(dir === "prev" ? subMonths(currentDate, 4) : addMonths(currentDate, 4));
    } else {
      setCurrentDate(dir === "prev" ? subMonths(currentDate, 1) : addMonths(currentDate, 1));
    }
  };

  // Fetch people
  const { data: trainers = [] } = useQuery({
    queryKey: ["avail-trainers"],
    enabled: type === "trainer",
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

  const { data: clients = [] } = useQuery({
    queryKey: ["clients", "avail"],
    enabled: type === "deelnemer",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name")
        .eq("archived", false)
        .in("intake_status", ["nieuw", "intake_gepland", "intake", "intake_afgerond", "actief", "wachtlijst"])
        .order("first_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const people = type === "trainer" ? trainers : clients;

  // Fetch existing availability for selected person + period
  const { data: existingAvailability = [], refetch: refetchAvail } = useQuery({
    queryKey: ["avail-existing", type, selectedPersonId, dateRange.start.toISOString(), dateRange.end.toISOString()],
    enabled: !!selectedPersonId,
    queryFn: async () => {
      const startStr = format(dateRange.start, "yyyy-MM-dd");
      const endStr = format(dateRange.end, "yyyy-MM-dd");

      if (type === "trainer") {
        const { data, error } = await supabase
          .from("staff_availability")
          .select("id, available_date, start_time, end_time, notes")
          .eq("staff_id", selectedPersonId)
          .gte("available_date", startStr)
          .lte("available_date", endStr);
        if (error) throw error;
        return data ?? [];
      } else {
        const { data, error } = await supabase
          .from("client_availability")
          .select("id, available_date, start_time, end_time, notes")
          .eq("client_id", selectedPersonId)
          .gte("available_date", startStr)
          .lte("available_date", endStr);
        if (error) throw error;
        return data ?? [];
      }
    },
  });

  // Parse existing availability into grid state
  // We aggregate by DOW: if ANY date for that DOW has availability, mark it.
  // For times, we use the most common time or the first encountered.
  const existingGrid = useMemo(() => {
    const grid: Record<string, boolean> = {};
    const times: Record<string, { start: string; end: string }> = {};
    const timeCounts: Record<string, Record<string, number>> = {};

    existingAvailability.forEach((a: any) => {
      const date = parseISO(a.available_date);
      const dow = jsDayToDow(getDay(date));
      if (dow > 7) return;

      const startTime = a.start_time?.slice(0, 5) ?? "09:00";
      const endTime = a.end_time?.slice(0, 5) ?? "17:00";
      const startHour = parseInt(startTime.split(":")[0]);
      const endHour = parseInt(endTime.split(":")[0]);
      const endMin = parseInt(endTime.split(":")[1] ?? "0");

      if (startHour < 13 && (endHour < 13 || (endHour === 13 && endMin === 0))) {
        const key = `${dow}-ochtend`;
        grid[key] = true;
        const timeKey = `${startTime}-${endTime}`;
        if (!timeCounts[key]) timeCounts[key] = {};
        timeCounts[key][timeKey] = (timeCounts[key][timeKey] ?? 0) + 1;
      } else if (startHour >= 13) {
        const key = `${dow}-middag`;
        grid[key] = true;
        const timeKey = `${startTime}-${endTime}`;
        if (!timeCounts[key]) timeCounts[key] = {};
        timeCounts[key][timeKey] = (timeCounts[key][timeKey] ?? 0) + 1;
      } else {
        // Spans both
        const mKey = `${dow}-ochtend`;
        const aKey = `${dow}-middag`;
        grid[mKey] = true;
        grid[aKey] = true;
        const mTimeKey = `${startTime}-12:30`;
        if (!timeCounts[mKey]) timeCounts[mKey] = {};
        timeCounts[mKey][mTimeKey] = (timeCounts[mKey][mTimeKey] ?? 0) + 1;
        const aTimeKey = `13:00-${endTime}`;
        if (!timeCounts[aKey]) timeCounts[aKey] = {};
        timeCounts[aKey][aTimeKey] = (timeCounts[aKey][aTimeKey] ?? 0) + 1;
      }
    });

    // Pick most common time for each cell
    for (const key of Object.keys(timeCounts)) {
      const counts = timeCounts[key];
      let best = "";
      let bestCount = 0;
      for (const [tk, cnt] of Object.entries(counts)) {
        if (cnt > bestCount) { best = tk; bestCount = cnt; }
      }
      if (best) {
        const [s, e] = best.split("-");
        times[key] = { start: s, end: e };
      }
    }

    return { grid, times };
  }, [existingAvailability]);

  // Load existing into state when data changes
  const loadExisting = useCallback(() => {
    setSelections(existingGrid.grid);
    setCustomTimes(existingGrid.times);
    setIsDirty(false);
  }, [existingGrid]);

  useEffect(() => {
    if (selectedPersonId) {
      loadExisting();
    }
  }, [selectedPersonId, loadExisting]);

  const toggleCell = (dow: number, dagdeel: Dagdeel) => {
    const key = `${dow}-${dagdeel}`;
    setSelections(prev => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
        setCustomTimes(ct => {
          const nct = { ...ct };
          delete nct[key];
          return nct;
        });
      } else {
        next[key] = true;
      }
      return next;
    });
    setIsDirty(true);
  };

  const toggleFullDay = (dow: number) => {
    const morningKey = `${dow}-ochtend`;
    const middagKey = `${dow}-middag`;
    const bothSelected = selections[morningKey] && selections[middagKey];
    setSelections(prev => ({
      ...prev,
      [morningKey]: !bothSelected,
      [middagKey]: !bothSelected,
    }));
    setIsDirty(true);
  };

  const toggleFullDagdeel = (dagdeel: Dagdeel) => {
    const allSelected = WEEKDAYS.every(w => selections[`${w.dow}-${dagdeel}`]);
    const updates: Record<string, boolean> = {};
    WEEKDAYS.forEach(w => {
      updates[`${w.dow}-${dagdeel}`] = !allSelected;
    });
    setSelections(prev => ({ ...prev, ...updates }));
    setIsDirty(true);
  };

  const updateCustomTime = (cellKey: string, field: "start" | "end", value: string) => {
    const dagdeel = cellKey.includes("ochtend") ? DAGDELEN[0] : DAGDELEN[1];
    setCustomTimes(prev => ({
      ...prev,
      [cellKey]: {
        start: field === "start" ? value : (prev[cellKey]?.start ?? dagdeel.start),
        end: field === "end" ? value : (prev[cellKey]?.end ?? dagdeel.end),
      }
    }));
    setIsDirty(true);
  };

  // Save
  const saveAvailability = async () => {
    if (!selectedPersonId) return;
    setSaving(true);

    try {
      const allDays = eachDayOfInterval(dateRange);
      const startStr = format(dateRange.start, "yyyy-MM-dd");
      const endStr = format(dateRange.end, "yyyy-MM-dd");

      // Delete existing
      if (type === "trainer") {
        const { error: delError } = await supabase
          .from("staff_availability")
          .delete()
          .eq("staff_id", selectedPersonId)
          .gte("available_date", startStr)
          .lte("available_date", endStr);
        if (delError) throw delError;
      } else {
        const { error: delError } = await supabase
          .from("client_availability")
          .delete()
          .eq("client_id", selectedPersonId)
          .gte("available_date", startStr)
          .lte("available_date", endStr);
        if (delError) throw delError;
      }

      // Build one row per date (merge ochtend+middag into a single daily window)
      const dailyAvailability: Record<string, { available_date: string; start_time: string; end_time: string }> = {};

      allDays.forEach((day) => {
        const dow = jsDayToDow(getDay(day));
        if (dow > 7) return;
        const dateStr = format(day, "yyyy-MM-dd");

        let mergedStart: string | null = null;
        let mergedEnd: string | null = null;

        DAGDELEN.forEach((dagdeel) => {
          const key = `${dow}-${dagdeel.key}`;
          if (!selections[key]) return;

          const times = customTimes[key] ?? { start: dagdeel.start, end: dagdeel.end };
          const normalizedStart = times.start <= times.end ? times.start : times.end;
          const normalizedEnd = times.start <= times.end ? times.end : times.start;

          if (!mergedStart || normalizedStart < mergedStart) mergedStart = normalizedStart;
          if (!mergedEnd || normalizedEnd > mergedEnd) mergedEnd = normalizedEnd;
        });

        if (mergedStart && mergedEnd) {
          dailyAvailability[dateStr] = {
            available_date: dateStr,
            start_time: mergedStart,
            end_time: mergedEnd,
          };
        }
      });

      const rowsToSave = Object.values(dailyAvailability);

      // Batch write in chunks of 500
      if (rowsToSave.length > 0) {
        const chunkSize = 500;
        for (let i = 0; i < rowsToSave.length; i += chunkSize) {
          const chunk = rowsToSave.slice(i, i + chunkSize);
          if (type === "trainer") {
            const rows = chunk.map((r) => ({ ...r, staff_id: selectedPersonId }));
            const { error } = await supabase.from("staff_availability").insert(rows);
            if (error) throw error;
          } else {
            const rows = chunk.map((r) => ({ ...r, client_id: selectedPersonId }));
            const { error } = await supabase
              .from("client_availability")
              .upsert(rows, { onConflict: "client_id,available_date" });
            if (error) throw error;
          }
        }
      }

      toast({ title: "Beschikbaarheid opgeslagen", description: `${rowsToSave.length} dagen opgeslagen` });
      setIsDirty(false);
      refetchAvail();
      // Centralized invalidation — SSOT: all client-related queries + planning queries
      invalidateAllClientQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ["planning-availability"] });
      queryClient.invalidateQueries({ queryKey: ["planning-client-availability"] });
    } catch (err: any) {
      toast({ title: "Fout bij opslaan", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const selectedCount = Object.values(selections).filter(Boolean).length;

  const personLabel = (p: any) => {
    if (type === "trainer") return p.name;
    return `${p.first_name} ${p.last_name}`;
  };

  const periodLabel = periodMode === "week" ? "deze week" : periodMode === "maand" ? "deze maand" : "komende 4 maanden";

  return (
    <div className="space-y-4">
      {/* Person + Period selection */}
      <div className="flex flex-wrap items-end gap-3">
        {!fixedPersonId && (
          <div className="space-y-1.5 min-w-[200px]">
            <Label>{type === "trainer" ? "Trainer" : "Deelnemer"}</Label>
            <Select value={selectedPersonId} onValueChange={(v) => { setSelectedPersonId(v); setSelections({}); setCustomTimes({}); setIsDirty(false); }}>
              <SelectTrigger><SelectValue placeholder={`Selecteer ${type}...`} /></SelectTrigger>
              <SelectContent className="bg-popover max-h-60">
                {people.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{personLabel(p)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Periode</Label>
          <Select value={periodMode} onValueChange={(v) => setPeriodMode(v as PeriodMode)}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-popover">
              <SelectItem value="week">Week</SelectItem>
              <SelectItem value="maand">Maand</SelectItem>
              <SelectItem value="kwartaal">4 Maanden</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" onClick={() => navigatePeriod("prev")}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
            Vandaag
          </Button>
          <Button variant="outline" size="icon" onClick={() => navigatePeriod("next")}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <span className="text-sm font-semibold text-foreground capitalize">
          {periodMode === "week"
            ? `${format(dateRange.start, "d MMM", { locale: nl })} – ${format(dateRange.end, "d MMM yyyy", { locale: nl })}`
            : periodMode === "kwartaal"
              ? `${format(dateRange.start, "MMM yyyy", { locale: nl })} – ${format(dateRange.end, "MMM yyyy", { locale: nl })}`
              : format(currentDate, "MMMM yyyy", { locale: nl })}
        </span>
      </div>

      {!selectedPersonId && !fixedPersonId ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            Selecteer een {type} om beschikbaarheid in te vullen.
          </p>
        </div>
      ) : (
        <>
          {/* Availability grid */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-foreground">
                Wekelijks patroon
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Stel het weekpatroon in — dit wordt toegepast op alle weken in de geselecteerde periode ({periodLabel}).
                Klik op een cel om aan/uit te zetten. Gebruik de klok-knop om tijden aan te passen.
              </p>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <th className="p-2 text-left text-xs font-semibold text-muted-foreground w-24"></th>
                      {WEEKDAYS.map(w => (
                        <th key={w.dow} className="p-1 text-center">
                          <button
                            className="text-xs font-bold text-foreground hover:text-primary transition-colors px-2 py-1 rounded hover:bg-muted"
                            onClick={() => toggleFullDay(w.dow)}
                            title={`${w.label} hele dag aan/uit`}
                          >
                            {w.short}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {DAGDELEN.map(dagdeel => (
                      <tr key={dagdeel.key}>
                        <td className="p-1">
                          <button
                            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded hover:bg-muted"
                            onClick={() => toggleFullDagdeel(dagdeel.key)}
                            title={`Alle ${dagdeel.label.toLowerCase()}en aan/uit`}
                          >
                            {dagdeel.icon}
                            {dagdeel.label}
                            <span className="text-[10px] text-muted-foreground/70">
                              ({dagdeel.start}–{dagdeel.end})
                            </span>
                          </button>
                        </td>
                        {WEEKDAYS.map(w => {
                          const cellKey = `${w.dow}-${dagdeel.key}`;
                          const isSelected = !!selections[cellKey];
                          const times = customTimes[cellKey] ?? { start: dagdeel.start, end: dagdeel.end };
                          const isDefaultTime = times.start === dagdeel.start && times.end === dagdeel.end;

                          return (
                            <td key={w.dow} className="p-1">
                              <div
                                className={`relative rounded-lg border-2 transition-all min-h-[56px] flex flex-col items-center justify-center gap-0.5 ${
                                  isSelected
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border bg-muted/30 text-muted-foreground hover:border-muted-foreground/50 cursor-pointer"
                                }`}
                                onClick={() => {
                                  if (!isSelected) toggleCell(w.dow, dagdeel.key);
                                }}
                              >
                                {isSelected ? (
                                  <>
                                    <span className={`text-[10px] font-semibold ${!isDefaultTime ? "text-foreground" : ""}`}>
                                      {times.start}–{times.end}
                                    </span>
                                    <div className="flex items-center gap-1">
                                      {/* Time edit popover */}
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <button
                                            className="text-[9px] underline opacity-70 hover:opacity-100 flex items-center gap-0.5"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <Clock className="h-2.5 w-2.5" /> Wijzig
                                          </button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-44 p-3 space-y-2" align="center" side="bottom">
                                          <div className="space-y-1">
                                            <Label className="text-[10px]">Van</Label>
                                            <Input
                                              type="time"
                                              value={times.start}
                                              className="h-7 text-xs"
                                              onChange={(e) => updateCustomTime(cellKey, "start", e.target.value)}
                                            />
                                          </div>
                                          <div className="space-y-1">
                                            <Label className="text-[10px]">Tot</Label>
                                            <Input
                                              type="time"
                                              value={times.end}
                                              className="h-7 text-xs"
                                              onChange={(e) => updateCustomTime(cellKey, "end", e.target.value)}
                                            />
                                          </div>
                                        </PopoverContent>
                                      </Popover>
                                      {/* Remove button */}
                                      <button
                                        className="text-[9px] opacity-50 hover:opacity-100 hover:text-destructive"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleCell(w.dow, dagdeel.key);
                                        }}
                                        title="Verwijder"
                                      >
                                        <X className="h-2.5 w-2.5" />
                                      </button>
                                    </div>
                                  </>
                                ) : (
                                  <span className="text-[10px]">—</span>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          {selectedCount > 0 && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              <strong className="text-foreground">{selectedCount}</strong> dagdelen geselecteerd per week.
              {periodMode === "kwartaal" && " Dit patroon wordt toegepast op alle ~17 weken in de komende 4 maanden."}
              {periodMode === "maand" && " Dit patroon wordt toegepast op alle ~4 weken in deze maand."}
              {isDirty && <span className="text-amber-600 ml-2">• Onopgeslagen wijzigingen</span>}
            </div>
          )}

          {/* Save */}
          <Button onClick={saveAvailability} disabled={saving || !isDirty} className="w-full sm:w-auto">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Beschikbaarheid opslaan voor {periodLabel}
          </Button>
        </>
      )}
    </div>
  );
}
