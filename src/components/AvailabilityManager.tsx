import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  format, startOfWeek, endOfWeek, addWeeks, subWeeks,
  startOfMonth, endOfMonth, addMonths, subMonths,
  eachDayOfInterval, parseISO, getDay
} from "date-fns";
import { nl } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Sun, Moon, Clock, Save, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";

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

// Convert JS getDay (0=Sun) to our dow (1=Mon..5=Fri)
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

  const [periodMode, setPeriodMode] = useState<PeriodMode>("week");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedPersonId, setSelectedPersonId] = useState<string>(fixedPersonId ?? "");
  const [saving, setSaving] = useState(false);

  // Grid state: { "1-ochtend": true, "3-middag": true, ... }
  const [selections, setSelections] = useState<Record<string, boolean>>({});
  // Custom times override: { "1-ochtend": { start: "09:30", end: "12:00" } }
  const [customTimes, setCustomTimes] = useState<Record<string, { start: string; end: string }>>({});
  // Track which cells have custom time editing open
  const [editingTime, setEditingTime] = useState<string | null>(null);

  const dateRange = useMemo(() => {
    if (periodMode === "week") {
      return {
        start: startOfWeek(currentDate, { weekStartsOn: 1 }),
        end: endOfWeek(currentDate, { weekStartsOn: 1 }),
      };
    }
    return {
      start: startOfMonth(currentDate),
      end: endOfMonth(currentDate),
    };
  }, [periodMode, currentDate]);

  const navigatePeriod = (dir: "prev" | "next") => {
    if (periodMode === "week") {
      setCurrentDate(dir === "prev" ? subWeeks(currentDate, 1) : addWeeks(currentDate, 1));
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
    queryKey: ["avail-clients"],
    enabled: type === "deelnemer",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name")
        .eq("archived", false)
        .in("intake_status", ["nieuw", "intake_gepland", "intake", "actief", "wachtlijst"])
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

  // Parse existing availability into grid state when person/period changes
  const existingGrid = useMemo(() => {
    const grid: Record<string, boolean> = {};
    const times: Record<string, { start: string; end: string }> = {};

    existingAvailability.forEach((a: any) => {
      const date = parseISO(a.available_date);
      const dow = jsDayToDow(getDay(date));
      if (dow > 7) return;

      const startTime = a.start_time?.slice(0, 5) ?? "09:00";
      const endTime = a.end_time?.slice(0, 5) ?? "17:00";

      // Determine which dagdeel(en) this covers
      const startHour = parseInt(startTime.split(":")[0]);
      const endHour = parseInt(endTime.split(":")[0]);

      if (startHour < 13 && endHour <= 13) {
        // Morning only
        grid[`${dow}-ochtend`] = true;
        times[`${dow}-ochtend`] = { start: startTime, end: endTime };
      } else if (startHour >= 13) {
        // Afternoon only
        grid[`${dow}-middag`] = true;
        times[`${dow}-middag`] = { start: startTime, end: endTime };
      } else {
        // Full day or spanning both
        grid[`${dow}-ochtend`] = true;
        grid[`${dow}-middag`] = true;
        times[`${dow}-ochtend`] = { start: startTime, end: "12:30" };
        times[`${dow}-middag`] = { start: "13:00", end: endTime };
      }
    });

    return { grid, times };
  }, [existingAvailability]);

  // Load existing into state when person changes
  const loadExisting = useCallback(() => {
    setSelections(existingGrid.grid);
    setCustomTimes(existingGrid.times);
    setEditingTime(null);
  }, [existingGrid]);

  // Auto-load when existing data changes
  useMemo(() => {
    if (selectedPersonId) {
      loadExisting();
    }
  }, [existingGrid, selectedPersonId]);

  const toggleCell = (dow: number, dagdeel: Dagdeel) => {
    const key = `${dow}-${dagdeel}`;
    setSelections(prev => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
        // Also remove custom times
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
  };

  const toggleFullDagdeel = (dagdeel: Dagdeel) => {
    const allSelected = WEEKDAYS.every(w => selections[`${w.dow}-${dagdeel}`]);
    const updates: Record<string, boolean> = {};
    WEEKDAYS.forEach(w => {
      updates[`${w.dow}-${dagdeel}`] = !allSelected;
    });
    setSelections(prev => ({ ...prev, ...updates }));
  };

  // Save: generate date records for each selected day/dagdeel in the period
  const saveAvailability = async () => {
    if (!selectedPersonId) return;
    setSaving(true);

    try {
      const allDays = eachDayOfInterval(dateRange);

      // First, delete existing availability in the period for this person
      const startStr = format(dateRange.start, "yyyy-MM-dd");
      const endStr = format(dateRange.end, "yyyy-MM-dd");

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

      // Build inserts grouped by type
      const inserts: any[] = [];

      allDays.forEach(day => {
        const dow = jsDayToDow(getDay(day));
        if (dow > 7) return;
        const dateStr = format(day, "yyyy-MM-dd");

        DAGDELEN.forEach(dagdeel => {
          const key = `${dow}-${dagdeel.key}`;
          if (!selections[key]) return;
          const times = customTimes[key] ?? { start: dagdeel.start, end: dagdeel.end };
          inserts.push({
            available_date: dateStr,
            start_time: times.start,
            end_time: times.end,
          });
        });
      });

      if (inserts.length > 0) {
        if (type === "trainer") {
          const rows = inserts.map(i => ({ ...i, staff_id: selectedPersonId }));
          const { error: insertError } = await supabase.from("staff_availability").insert(rows);
          if (insertError) throw insertError;
        } else {
          const rows = inserts.map(i => ({ ...i, client_id: selectedPersonId }));
          const { error: insertError } = await supabase.from("client_availability").insert(rows);
          if (insertError) throw insertError;
        }
      }

      toast({ title: "Beschikbaarheid opgeslagen", description: `${inserts.length} tijdslots opgeslagen` });
      refetchAvail();
      queryClient.invalidateQueries({ queryKey: ["planning-availability"] });
      queryClient.invalidateQueries({ queryKey: ["planning-client-availability"] });
    } catch (err: any) {
      toast({ title: "Fout", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Count unavailable days (weekdays without any selection)
  const unavailableDays = useMemo(() => {
    const allDays = eachDayOfInterval(dateRange);
    const weekdaysInPeriod = allDays.filter(d => {
      const dow = jsDayToDow(getDay(d));
      return dow >= 1 && dow <= 7;
    });

    const unavailable: Date[] = [];
    weekdaysInPeriod.forEach(day => {
      const dow = jsDayToDow(getDay(day));
      const hasAny = DAGDELEN.some(dd => selections[`${dow}-${dd.key}`]);
      if (!hasAny) unavailable.push(day);
    });

    return unavailable;
  }, [dateRange, selections]);

  const personLabel = (p: any) => {
    if (type === "trainer") return p.name;
    return `${p.first_name} ${p.last_name}`;
  };

  return (
    <div className="space-y-4">
      {/* Person + Period selection */}
      <div className="flex flex-wrap items-end gap-3">
        {!fixedPersonId && (
          <div className="space-y-1.5 min-w-[200px]">
            <Label>{type === "trainer" ? "Trainer" : "Deelnemer"}</Label>
            <Select value={selectedPersonId} onValueChange={(v) => { setSelectedPersonId(v); setSelections({}); setCustomTimes({}); }}>
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
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-popover">
              <SelectItem value="week">Week</SelectItem>
              <SelectItem value="maand">Maand</SelectItem>
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
                Beschikbaarheid per dag
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Klik op een cel om beschikbaarheid aan/uit te zetten. Klik op een dagkop voor de hele dag, of op Ochtend/Middag voor alle dagen.
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
                          const hasCustomTime = !!customTimes[cellKey];
                          const isEditing = editingTime === cellKey;
                          const times = customTimes[cellKey] ?? { start: dagdeel.start, end: dagdeel.end };

                          return (
                            <td key={w.dow} className="p-1">
                              <div
                                className={`relative rounded-lg border-2 transition-all cursor-pointer min-h-[56px] flex flex-col items-center justify-center gap-0.5 ${
                                  isSelected
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border bg-muted/30 text-muted-foreground hover:border-muted-foreground/50"
                                }`}
                                onClick={() => toggleCell(w.dow, dagdeel.key)}
                              >
                                {isSelected && (
                                  <>
                                    <span className="text-[10px] font-semibold">
                                      {times.start}–{times.end}
                                    </span>
                                    <button
                                      className="text-[9px] underline opacity-70 hover:opacity-100"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setEditingTime(isEditing ? null : cellKey);
                                      }}
                                    >
                                      <Clock className="h-2.5 w-2.5 inline" /> Wijzig
                                    </button>
                                  </>
                                )}
                                {!isSelected && (
                                  <span className="text-[10px]">—</span>
                                )}
                              </div>

                              {/* Custom time editor */}
                              {isEditing && isSelected && (
                                <div className="absolute z-10 mt-1 p-2 bg-popover border border-border rounded-lg shadow-lg space-y-2 min-w-[140px]"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="space-y-1">
                                    <Label className="text-[10px]">Van</Label>
                                    <Input
                                      type="time"
                                      value={times.start}
                                      className="h-7 text-xs"
                                      onChange={(e) => setCustomTimes(prev => ({
                                        ...prev,
                                        [cellKey]: { ...times, start: e.target.value }
                                      }))}
                                    />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-[10px]">Tot</Label>
                                    <Input
                                      type="time"
                                      value={times.end}
                                      className="h-7 text-xs"
                                      onChange={(e) => setCustomTimes(prev => ({
                                        ...prev,
                                        [cellKey]: { ...times, end: e.target.value }
                                      }))}
                                    />
                                  </div>
                                  <Button size="sm" variant="outline" className="w-full h-6 text-[10px]" onClick={() => setEditingTime(null)}>
                                    OK
                                  </Button>
                                </div>
                              )}
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

          {/* Unavailability summary */}
          {unavailableDays.length > 0 && (
            <Card className="border-amber-200 bg-amber-50/30">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-semibold text-amber-800 flex items-center gap-1">
                  <X className="h-3.5 w-3.5" />
                  Niet beschikbaar ({unavailableDays.length} werkdag{unavailableDays.length !== 1 ? "en" : ""})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1">
                  {unavailableDays.slice(0, 20).map(day => (
                    <Badge key={day.toISOString()} variant="outline" className="text-[10px] border-amber-300 text-amber-700">
                      {format(day, "EEE d MMM", { locale: nl })}
                    </Badge>
                  ))}
                  {unavailableDays.length > 20 && (
                    <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700">
                      +{unavailableDays.length - 20} meer
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Save */}
          <Button onClick={saveAvailability} disabled={saving} className="w-full sm:w-auto">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Beschikbaarheid opslaan voor {periodMode === "week" ? "deze week" : "deze maand"}
          </Button>
        </>
      )}
    </div>
  );
}
