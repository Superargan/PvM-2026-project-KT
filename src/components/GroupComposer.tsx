import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getDay, parseISO } from "date-fns";
import { Users, UserCog, Check, AlertTriangle, CalendarClock, Search, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
  type AgeCategory,
  type MatchType,
} from "@/lib/clientUtils";
import { clientKeys, areaKeys } from "@/lib/queryKeys";

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
}

export default function GroupComposer() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selectedClients, setSelectedClients] = useState<Record<string, Set<string>>>({});
  const [selectedOudertrainer, setSelectedOudertrainer] = useState<Record<string, string>>({});
  const [selectedKindtrainer, setSelectedKindtrainer] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState<string | null>(null);
  const [filterArea, setFilterArea] = useState<string>("alle");
  const [expandedReserve, setExpandedReserve] = useState<Set<string>>(new Set());
  const [selectedStartDate, setSelectedStartDate] = useState<Record<string, string>>({});

  // Fetch waitlist clients
  const { data: waitlistClients = [] } = useQuery({
    queryKey: ["clients", "group-composer"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name, date_of_birth, waitlist_area_id, all_areas_flexible, intake_status, school_id, schools(id, name, neighborhood_id, neighborhoods(id, area_id, areas(id, name)))")
        .eq("archived", false)
        .in("intake_status", ["wachtlijst", "intake_afgerond"]);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch area preferences
  const { data: allPreferences = [] } = useQuery({
    queryKey: ["clients", "group-composer-prefs"],
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
    queryKey: ["group-composer-areas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("areas").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch all client availability
  const { data: allAvailability = [] } = useQuery({
    queryKey: ["clients", "group-composer-avail"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_availability")
        .select("client_id, available_date, start_time, end_time");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Build availability map
  const availByClient = useMemo(() => {
    const m: Record<string, { dayOfWeek: number; dayName: string; startTime: string; endTime: string }[]> = {};
    const dayNames = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
    allAvailability.forEach((a: any) => {
      if (!m[a.client_id]) m[a.client_id] = [];
      const dow = getDay(parseISO(a.available_date));
      m[a.client_id].push({
        dayOfWeek: dow,
        dayName: dayNames[dow],
        startTime: a.start_time ?? "09:00",
        endTime: a.end_time ?? "17:00",
      });
    });
    return m;
  }, [allAvailability]);

  // Find best overlapping timeslot
  const getSuggestion = (clientIds: Set<string>) => {
    if (clientIds.size === 0) return null;
    const dayStats: Record<number, { count: number; dayName: string; starts: string[]; ends: string[] }> = {};
    const dayNames = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
    
    clientIds.forEach((cid) => {
      const avail = availByClient[cid];
      if (!avail) return;
      const seenDays = new Set<number>();
      avail.forEach((a) => {
        if (seenDays.has(a.dayOfWeek)) return;
        seenDays.add(a.dayOfWeek);
        if (!dayStats[a.dayOfWeek]) {
          dayStats[a.dayOfWeek] = { count: 0, dayName: dayNames[a.dayOfWeek], starts: [], ends: [] };
        }
        dayStats[a.dayOfWeek].count++;
        dayStats[a.dayOfWeek].starts.push(a.startTime);
        dayStats[a.dayOfWeek].ends.push(a.endTime);
      });
    });

    const entries = Object.values(dayStats).filter(d => d.count >= 2);
    if (entries.length === 0) return null;
    entries.sort((a, b) => b.count - a.count);
    const best = entries[0];
    const latestStart = best.starts.sort().reverse()[0];
    const earliestEnd = best.ends.sort()[0];
    
    return {
      dayName: best.dayName,
      startTime: latestStart <= earliestEnd ? latestStart : best.starts.sort()[0],
      endTime: latestStart <= earliestEnd ? earliestEnd : best.ends.sort().reverse()[0],
      overlap: best.count,
      total: clientIds.size,
    };
  };

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

  // Preference map: clientId -> { areaId: preferenceOrder }
  const prefsByClient = useMemo(() => {
    const m: Record<string, Record<string, number>> = {};
    allPreferences.forEach((p: any) => {
      if (!m[p.client_id]) m[p.client_id] = {};
      m[p.client_id][p.area_id] = p.preference_order;
    });
    return m;
  }, [allPreferences]);

  const areaMap = useMemo(() => {
    const m: Record<string, string> = {};
    areas.forEach((a: any) => { m[a.id] = a.name; });
    return m;
  }, [areas]);

  // Group clients by area + age category
  const groups: GroupedClients[] = useMemo(() => {
    const map = new Map<string, GroupedClients>();

    areas.forEach((area: any) => {
      const ageCategories: AgeCategory[] = ["5-7 jaar", "8-12 jaar"];
      ageCategories.forEach((ageCategory) => {
        const key = `${area.id}__${ageCategory}`;
        const matchedClients: ClientWithMatch[] = [];

        waitlistClients.forEach((client: any) => {
          const ageCat = getAgeCategoryPlanning(client.date_of_birth);
          if (ageCat !== ageCategory) return;
          const mt = getMatchType(client, area.id, prefsByClient);
          if (!mt) return;
          matchedClients.push({ client, matchType: mt, sortOrder: matchSortOrder[mt] });
        });

        if (matchedClients.length > 0) {
          matchedClients.sort((a, b) => a.sortOrder - b.sortOrder);
          map.set(key, {
            areaId: area.id,
            areaName: areaMap[area.id] ?? "Onbekend gebied",
            ageCategory,
            clients: matchedClients,
          });
        }
      });
    });

    return Array.from(map.values()).sort((a, b) => b.clients.length - a.clients.length);
  }, [waitlistClients, areas, areaMap, prefsByClient]);

  // Clients without area or age
  const unassigned = useMemo(() => {
    return waitlistClients.filter((c: any) => !resolveAreaId(c) || !getAgeCategoryPlanning(c.date_of_birth));
  }, [waitlistClients]);

  const filteredGroups = useMemo(() => {
    if (filterArea === "alle") return groups;
    return groups.filter(g => g.areaId === filterArea);
  }, [groups, filterArea]);

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

  const getGroupKey = (g: GroupedClients) => `${g.areaId}__${g.ageCategory}`;

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

  // Find extra reserve-area candidates not already in a group
  const getReserveCandidates = (group: GroupedClients): ClientWithMatch[] => {
    const existingIds = new Set(group.clients.map(cm => cm.client.id));
    const candidates: ClientWithMatch[] = [];

    waitlistClients.forEach((client: any) => {
      if (existingIds.has(client.id)) return;
      const ageCat = getAgeCategoryPlanning(client.date_of_birth);
      if (ageCat !== group.ageCategory) return;

      // Check if this client has the group's area as a reserve preference
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

      toast({ title: "Groep aangemaakt", description: `${programName} met ${selected.size} aanmelders` });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      navigate(`/programmas/${program.id}`);
    } catch (err: any) {
      toast({ title: "Fout bij aanmaken", description: err.message, variant: "destructive" });
    } finally {
      setCreating(null);
    }
  };

  // Render a client row with status + match badges
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

          return (
            <Card key={key} className="border-border">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base font-bold text-foreground">
                      {group.areaName} · {group.ageCategory}
                    </CardTitle>
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
                {/* Client list split by status */}
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
                    {/* Intake afgerond section */}
                    {intakeClients.length > 0 && (
                      <>
                        <div className="text-[10px] font-semibold text-blue-700 uppercase tracking-wider px-2 pt-1 pb-0.5">
                          Intake afgerond ({intakeClients.length})
                        </div>
                        {intakeClients.map(cm => renderClientRow(cm, group, selected))}
                      </>
                    )}
                    {/* Wachtlijst section */}
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

                {/* Reserve area search button */}
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

                {/* Vermoedelijke startdatum */}
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

                {/* Trainer selection */}
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

                {/* Suggested timeslot */}
                {(() => {
                  const suggestion = getSuggestion(selected);
                  const clientsWithAvail = Array.from(selected).filter(id => availByClient[id]?.length > 0).length;
                  
                  if (clientsWithAvail === 0) {
                    return (
                      <div className="rounded-lg border border-border bg-muted/30 p-3 flex items-center gap-2">
                        <CalendarClock className="h-4 w-4 text-muted-foreground shrink-0" />
                        <p className="text-xs text-muted-foreground">Geen beschikbaarheid ingevuld — voeg beschikbaarheid toe voor een voorstel.</p>
                      </div>
                    );
                  }
                  
                  if (!suggestion) {
                    return (
                      <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 flex items-center gap-2">
                        <CalendarClock className="h-4 w-4 text-amber-600 shrink-0" />
                        <p className="text-xs text-amber-800">Geen overlappend moment gevonden. {clientsWithAvail}/{selected.size} aanmelders hebben beschikbaarheid.</p>
                      </div>
                    );
                  }

                  return (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 space-y-1">
                      <div className="flex items-center gap-2">
                        <CalendarClock className="h-4 w-4 text-emerald-600 shrink-0" />
                        <p className="text-xs font-semibold text-emerald-800">Voorstel trainingsmoment</p>
                      </div>
                      <div className="flex items-center gap-3 pl-6">
                        <Badge variant="outline" className="border-emerald-300 text-emerald-700 text-xs capitalize">
                          {suggestion.dayName}
                        </Badge>
                        <span className="text-sm font-medium text-foreground">
                          {suggestion.startTime.slice(0, 5)} – {suggestion.endTime.slice(0, 5)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ({suggestion.overlap}/{suggestion.total} beschikbaar)
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* Create button */}
                <Button
                  className="w-full"
                  onClick={() => createGroup(group)}
                  disabled={isCreating || selected.size === 0}
                >
                  {isCreating ? "Aanmaken..." : `Groep aanmaken (${selected.size} aanmelders)`}
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
    </div>
  );
}
