import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { differenceInYears, parseISO } from "date-fns";
import { Users, UserCog, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";

type AgeCategory = "5-7 jaar" | "8-12 jaar";

interface GroupedClients {
  areaId: string;
  areaName: string;
  ageCategory: AgeCategory;
  clients: any[];
}

function calculateAge(dob: string | null): number | null {
  if (!dob) return null;
  return differenceInYears(new Date(), parseISO(dob));
}

function getAgeCategory(dob: string | null): AgeCategory | null {
  const age = calculateAge(dob);
  if (age === null) return null;
  if (age >= 5 && age <= 7) return "5-7 jaar";
  if (age >= 8 && age <= 12) return "8-12 jaar";
  return null;
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

  // Fetch waitlist clients with school -> neighborhood -> area joins
  const { data: waitlistClients = [] } = useQuery({
    queryKey: ["group-composer-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name, date_of_birth, waitlist_area_id, school_id, schools(id, name, neighborhood_id, neighborhoods(id, area_id, areas(id, name)))")
        .eq("archived", false)
        .eq("intake_status", "wachtlijst");
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

  // Fetch all active trainers
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

  // Area map for resolving names
  const areaMap = useMemo(() => {
    const m: Record<string, string> = {};
    areas.forEach((a: any) => { m[a.id] = a.name; });
    return m;
  }, [areas]);

  // Resolve area for a client
  const resolveAreaId = (client: any): string | null => {
    if (client.waitlist_area_id) return client.waitlist_area_id;
    const areaId = (client as any).schools?.neighborhoods?.area_id;
    if (areaId) return areaId;
    return null;
  };

  // Group clients by area + age category
  const groups: GroupedClients[] = useMemo(() => {
    const map = new Map<string, GroupedClients>();

    waitlistClients.forEach((client: any) => {
      const areaId = resolveAreaId(client);
      const ageCategory = getAgeCategory(client.date_of_birth);
      if (!areaId || !ageCategory) return;

      const key = `${areaId}__${ageCategory}`;
      if (!map.has(key)) {
        map.set(key, {
          areaId,
          areaName: areaMap[areaId] ?? "Onbekend gebied",
          ageCategory,
          clients: [],
        });
      }
      map.get(key)!.clients.push(client);
    });

    // Sort: largest groups first
    return Array.from(map.values()).sort((a, b) => b.clients.length - a.clients.length);
  }, [waitlistClients, areaMap]);

  // Clients without area or age
  const unassigned = useMemo(() => {
    return waitlistClients.filter((c: any) => !resolveAreaId(c) || !getAgeCategory(c.date_of_birth));
  }, [waitlistClients]);

  // Filtered groups
  const filteredGroups = useMemo(() => {
    if (filterArea === "alle") return groups;
    return groups.filter(g => g.areaId === filterArea);
  }, [groups, filterArea]);

  // Trainer lists
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

  // Selection helpers
  const getGroupKey = (g: GroupedClients) => `${g.areaId}__${g.ageCategory}`;

  const getSelectedForGroup = (g: GroupedClients): Set<string> => {
    const key = getGroupKey(g);
    if (!selectedClients[key]) {
      // Default: all selected
      return new Set(g.clients.map((c: any) => c.id));
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
      setSelectedClients(prev => ({ ...prev, [key]: new Set(g.clients.map((c: any) => c.id)) }));
    }
  };

  // Status color/icon
  const getStatusInfo = (count: number) => {
    if (count >= 7) return { color: "text-emerald-700 bg-emerald-50 border-emerald-200", label: "Gereed om te starten", icon: <Check className="h-4 w-4" /> };
    if (count >= 5) return { color: "text-amber-700 bg-amber-50 border-amber-200", label: `Nog ${7 - count} nodig`, icon: <AlertTriangle className="h-4 w-4" /> };
    return { color: "text-red-700 bg-red-50 border-red-200", label: `Nog ${7 - count} nodig`, icon: <AlertTriangle className="h-4 w-4" /> };
  };

  // Create group action
  const createGroup = async (g: GroupedClients) => {
    const key = getGroupKey(g);
    const selected = getSelectedForGroup(g);
    const oudertrainerId = selectedOudertrainer[key];
    const kindtrainerId = selectedKindtrainer[key];

    if (selected.size === 0) {
      toast({ title: "Selecteer minimaal 1 deelnemer", variant: "destructive" });
      return;
    }

    setCreating(key);

    try {
      // 1. Create program
      const programName = `${g.areaName} – ${g.ageCategory}`;
      const { data: program, error: progErr } = await supabase
        .from("programs")
        .insert({
          name: programName,
          area_id: g.areaId,
          age_category: g.ageCategory,
          status: "gepland",
          max_participants: selected.size,
        })
        .select("id")
        .single();

      if (progErr) throw progErr;

      // 2. Insert program_clients
      const clientInserts = Array.from(selected).map(clientId => ({
        program_id: program.id,
        client_id: clientId,
      }));
      const { error: clientErr } = await supabase.from("program_clients").insert(clientInserts);
      if (clientErr) throw clientErr;

      // 3. Insert program_staff
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

      // 4. Update client intake_status to 'actief'
      const { error: updateErr } = await supabase
        .from("clients")
        .update({ intake_status: "actief" })
        .in("id", Array.from(selected));
      if (updateErr) throw updateErr;

      toast({ title: "Groep aangemaakt", description: `${programName} met ${selected.size} deelnemers` });
      queryClient.invalidateQueries({ queryKey: ["group-composer-clients"] });
      navigate(`/programmas/${program.id}`);
    } catch (err: any) {
      toast({ title: "Fout bij aanmaken", description: err.message, variant: "destructive" });
    } finally {
      setCreating(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Stel automatisch groepen samen op basis van leeftijd en gebied. Minimaal 7 deelnemers per groep (max 14).
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
          {waitlistClients.length} op wachtlijst
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
            Geen wachtlijst-deelnemers gevonden die gegroepeerd kunnen worden.
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

          return (
            <Card key={key} className="border-border">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base font-bold text-foreground">
                      {group.areaName} · {group.ageCategory}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {group.clients.length} deelnemer{group.clients.length !== 1 ? "s" : ""} op wachtlijst
                    </p>
                  </div>
                  <Badge className={`${status.color} gap-1`}>
                    {status.icon}
                    {selected.size >= 7 ? `${selected.size} geselecteerd ✓` : status.label}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Client checkboxes */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Deelnemers</span>
                    <button
                      className="text-xs text-primary hover:underline"
                      onClick={() => toggleAll(group)}
                    >
                      {selected.size === group.clients.length ? "Deselecteer alles" : "Selecteer alles"}
                    </button>
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                    {group.clients.map((client: any) => {
                      const age = calculateAge(client.date_of_birth);
                      return (
                        <label
                          key={client.id}
                          className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50 cursor-pointer transition-colors"
                        >
                          <Checkbox
                            checked={selected.has(client.id)}
                            onCheckedChange={() => toggleClient(group, client.id)}
                          />
                          <span className="text-sm text-foreground">
                            {client.first_name} {client.last_name}
                          </span>
                          {age !== null && (
                            <span className="text-xs text-muted-foreground ml-auto">{age} jaar</span>
                          )}
                        </label>
                      );
                    })}
                  </div>
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

                {/* Create button */}
                <Button
                  className="w-full"
                  onClick={() => createGroup(group)}
                  disabled={isCreating || selected.size === 0}
                >
                  {isCreating ? "Aanmaken..." : `Groep aanmaken (${selected.size} deelnemers)`}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Unassigned clients */}
      {unassigned.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-amber-800">
              <AlertTriangle className="h-4 w-4 inline mr-1" />
              Deelnemers zonder gebied of geboortedatum ({unassigned.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1">
              {unassigned.map((c: any) => (
                <Badge
                  key={c.id}
                  variant="outline"
                  className="text-xs border-amber-300 text-amber-700 cursor-pointer hover:bg-amber-100"
                  onClick={() => navigate(`/clienten/${c.id}`)}
                 >
                  {c.first_name} {c.last_name}
                  {!c.date_of_birth ? " (geen geb.datum)" : !getAgeCategory(c.date_of_birth) ? ` (${calculateAge(c.date_of_birth)} jaar)` : ""}
                  {!resolveAreaId(c) ? " (geen gebied)" : ""}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
