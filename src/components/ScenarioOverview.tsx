import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { scenarioKeys } from "@/lib/queryKeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { FileText, RefreshCw, Trash2, FolderOpen, AlertTriangle, CheckCircle2, XCircle, HelpCircle } from "lucide-react";
import { formatDistanceToNow, differenceInHours, parseISO } from "date-fns";
import { nl } from "date-fns/locale";

interface ScenarioOverviewProps {
  onLoadScenario: (scenarioId: string) => void;
  hasActiveSimulation: boolean;
  onRequestSaveFirst: () => Promise<boolean>;
}

const statusColors: Record<string, string> = {
  concept: "bg-muted text-muted-foreground border-border",
  vastgezet: "bg-blue-100 text-blue-800 border-blue-300",
  in_uitwerking: "bg-amber-100 text-amber-800 border-amber-300",
  gecontroleerd: "bg-emerald-100 text-emerald-800 border-emerald-300",
  gedeeltelijk_omgezet: "bg-orange-100 text-orange-800 border-orange-300",
  definitief: "bg-emerald-200 text-emerald-900 border-emerald-400",
};

const statusLabels: Record<string, string> = {
  concept: "Concept",
  vastgezet: "Vastgezet",
  in_uitwerking: "In uitwerking",
  gecontroleerd: "Gecontroleerd",
  gedeeltelijk_omgezet: "Gedeeltelijk omgezet",
  definitief: "Definitief",
};

const validationColors: Record<string, string> = {
  geldig: "bg-emerald-100 text-emerald-800 border-emerald-300",
  aandacht_vereist: "bg-amber-100 text-amber-800 border-amber-300",
  ongeldig: "bg-red-100 text-red-800 border-red-300",
  niet_gevalideerd: "bg-muted text-muted-foreground border-border",
};

const validationLabels: Record<string, string> = {
  geldig: "Geldig",
  aandacht_vereist: "Aandacht vereist",
  ongeldig: "Ongeldig",
  niet_gevalideerd: "Niet gevalideerd",
};

const validationIcons: Record<string, any> = {
  geldig: CheckCircle2,
  aandacht_vereist: AlertTriangle,
  ongeldig: XCircle,
  niet_gevalideerd: HelpCircle,
};

const conversionStatusLabels: Record<string, string> = {
  niet_geprobeerd: "—",
  gelukt: "✓ Omgezet",
  mislukt: "✗ Mislukt",
};

export default function ScenarioOverview({ onLoadScenario, hasActiveSimulation, onRequestSaveFirst }: ScenarioOverviewProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [workstateDialogScenarioId, setWorkstateDialogScenarioId] = useState<string | null>(null);
  const [expandedValidation, setExpandedValidation] = useState<string | null>(null);

  const { data: scenarios = [], isLoading } = useQuery({
    queryKey: scenarioKeys.all,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("simulation_scenarios")
        .select(`
          id, name, description, status, validation_status, last_validated_at, created_at, updated_at,
          simulation_scenario_slots (
            id, conversion_status, converted_program_id, conversion_error, label, confirmed
          )
        `)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Get member counts per scenario via separate query
  const scenarioIds = scenarios.map((s: any) => s.id);
  const { data: memberCounts = {} } = useQuery({
    queryKey: [...scenarioKeys.all, "member-counts", scenarioIds],
    enabled: scenarioIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("simulation_scenario_members")
        .select("scenario_slot_id, simulation_scenario_slots!inner(scenario_id)");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((m: any) => {
        const sid = m.simulation_scenario_slots?.scenario_id;
        if (sid) counts[sid] = (counts[sid] ?? 0) + 1;
      });
      return counts;
    },
  });

  const handleOpenScenario = async (scenarioId: string) => {
    if (hasActiveSimulation) {
      setWorkstateDialogScenarioId(scenarioId);
    } else {
      onLoadScenario(scenarioId);
    }
  };

  const handleWorkstateChoice = async (choice: "save" | "discard" | "cancel") => {
    const targetId = workstateDialogScenarioId;
    setWorkstateDialogScenarioId(null);

    if (choice === "cancel") return;

    if (choice === "save") {
      const saved = await onRequestSaveFirst();
      if (!saved) return;
    }

    if (targetId) {
      onLoadScenario(targetId);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase
      .from("simulation_scenarios")
      .delete()
      .eq("id", deleteId);

    if (error) {
      toast({ title: "Fout bij verwijderen", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Scenario verwijderd" });
      queryClient.invalidateQueries({ queryKey: scenarioKeys.all });
    }
    setDeleteId(null);
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-4">Scenario's laden...</div>;
  }

  if (scenarios.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-6 text-center">
          <FileText className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">Nog geen opgeslagen scenario's.</p>
          <p className="text-xs text-muted-foreground mt-1">Stel een groep samen en sla op als scenario.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <FileText className="h-4 w-4" />
          Opgeslagen scenario's ({scenarios.length})
        </h3>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Naam</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Validatie</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Slots</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Leden</th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Bijgewerkt</th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Acties</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {scenarios.map((scenario: any) => {
              const slots = scenario.simulation_scenario_slots ?? [];
              const isStale = scenario.last_validated_at &&
                differenceInHours(new Date(), parseISO(scenario.last_validated_at)) > 24;
              const ValidationIcon = validationIcons[scenario.validation_status] ?? HelpCircle;

              return (
                <tr key={scenario.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-3 py-2">
                    <p className="text-sm font-semibold text-foreground">{scenario.name}</p>
                    {scenario.description && (
                      <p className="text-xs text-muted-foreground truncate max-w-xs">{scenario.description}</p>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className={`text-[10px] ${statusColors[scenario.status] ?? ""}`}>
                      {statusLabels[scenario.status] ?? scenario.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className={`text-[10px] gap-0.5 ${validationColors[scenario.validation_status] ?? ""}`}>
                              <ValidationIcon className="h-3 w-3" />
                              {validationLabels[scenario.validation_status] ?? scenario.validation_status}
                            </Badge>
                            {isStale && (
                              <Badge variant="outline" className="text-[9px] border-amber-300 text-amber-700 gap-0.5">
                                <AlertTriangle className="h-2.5 w-2.5" />
                                &gt;24u
                              </Badge>
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p className="text-xs">
                            {scenario.last_validated_at
                              ? `Laatst gevalideerd: ${formatDistanceToNow(parseISO(scenario.last_validated_at), { locale: nl, addSuffix: true })}`
                              : "Nog niet gevalideerd"}
                            {isStale && " — hervalidatie aanbevolen"}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-foreground">{slots.length}</span>
                      {slots.some((s: any) => s.conversion_status === "gelukt") && (
                        <Badge variant="outline" className="text-[9px] border-emerald-300 text-emerald-700">
                          {slots.filter((s: any) => s.conversion_status === "gelukt").length}✓
                        </Badge>
                      )}
                      {slots.some((s: any) => s.conversion_status === "mislukt") && (
                        <Badge variant="outline" className="text-[9px] border-red-300 text-red-700">
                          {slots.filter((s: any) => s.conversion_status === "mislukt").length}✗
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-sm text-foreground">{(memberCounts as any)[scenario.id] ?? 0}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(parseISO(scenario.updated_at), { locale: nl, addSuffix: true })}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1 justify-end">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleOpenScenario(scenario.id)}
                        title="Openen"
                      >
                        <FolderOpen className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setDeleteId(scenario.id)}
                        title="Verwijderen"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteId !== null} onOpenChange={(open) => { if (!open) setDeleteId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scenario verwijderen?</DialogTitle>
            <DialogDescription>
              Dit verwijdert het scenario inclusief alle slots en leden. Deze actie kan niet ongedaan worden gemaakt.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>Annuleren</Button>
            <Button variant="destructive" onClick={handleDelete}>Verwijderen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Workstate protection dialog (T07-T10) */}
      <Dialog open={workstateDialogScenarioId !== null} onOpenChange={(open) => { if (!open) setWorkstateDialogScenarioId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Actieve simulatie gevonden</DialogTitle>
            <DialogDescription>
              Er staat al een losse simulatie open. Wat wil je doen?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Button onClick={() => handleWorkstateChoice("save")} className="w-full">
              Opslaan als scenario en doorgaan
            </Button>
            <Button variant="outline" onClick={() => handleWorkstateChoice("discard")} className="w-full">
              Verwerpen en scenario laden
            </Button>
            <Button variant="ghost" onClick={() => handleWorkstateChoice("cancel")} className="w-full">
              Annuleren
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
