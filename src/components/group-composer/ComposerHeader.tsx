import { AlertTriangle, CheckCircle2, FlaskConical, RotateCcw, Save, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { SimulationEntry } from "./types";

export interface ComposerHeaderProps {
  loadedScenarioName: string | null;
  loadedProformaNumber: string | null;
  simulatedGroups: Map<string, SimulationEntry>;
  simulatedClientIdsCount: number;
  isDirty: boolean;
  activeScenarioId?: string | null;
  converting: boolean;
  impactedCount: number;
  otherGroupsCount: number;
  affectedAreasCount: number;
  areaMap: Record<string, string>;
  onOpenSaveDialog: () => void;
  onValidate: () => void;
  onConvert: () => void;
  onReset: () => void;
}

export function ComposerHeader({
  loadedScenarioName,
  loadedProformaNumber,
  simulatedGroups,
  simulatedClientIdsCount,
  isDirty,
  activeScenarioId,
  converting,
  impactedCount,
  otherGroupsCount,
  affectedAreasCount,
  areaMap,
  onOpenSaveDialog,
  onValidate,
  onConvert,
  onReset,
}: ComposerHeaderProps) {
  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-foreground">
            {loadedScenarioName ? `Proforma planning: ${loadedScenarioName}` : "Simulatie (niet opgeslagen)"}
            {" — "}{simulatedGroups.size} voorstel(len), {simulatedClientIdsCount} deelnemers
          </span>
          {loadedProformaNumber && (
            <Badge variant="outline" className="text-[10px] border-primary/40 text-primary font-mono">{loadedProformaNumber}</Badge>
          )}
          {isDirty && (
            <Badge variant="outline" className="text-[10px] border-warning-border text-warning-foreground gap-0.5">
              <AlertTriangle className="h-2.5 w-2.5" /> Wijzigingen niet opgeslagen
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={onOpenSaveDialog} className="gap-1.5">
            <Save className="h-3 w-3" /> Opslaan als proforma
          </Button>
          {activeScenarioId && (
            <>
              <Button variant="outline" size="sm" onClick={onValidate} className="gap-1.5">
                <CheckCircle2 className="h-3 w-3" /> Hervalideren
              </Button>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>
                      <Button variant="default" size="sm" onClick={onConvert} disabled={isDirty || converting} className="gap-1.5">
                        <Upload className="h-3 w-3" /> {converting ? "Omzetten..." : "Omzetten naar definitieve planning"}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {isDirty && <TooltipContent><p className="text-xs">Sla eerst op voordat je kunt omzetten</p></TooltipContent>}
                </Tooltip>
              </TooltipProvider>
            </>
          )}
          <Button variant="outline" size="sm" onClick={onReset} className="gap-1.5">
            <RotateCcw className="h-3 w-3" /> Reset
          </Button>
        </div>
      </div>
      {impactedCount > 0 && (
        <p className="text-xs text-muted-foreground pl-6">
          ↳ {impactedCount} deelnemer(s) weggevallen uit {otherGroupsCount} andere groep(en) in {affectedAreasCount === 1 ? "hetzelfde gebied" : `${affectedAreasCount} gebieden`}
        </p>
      )}
      <div className="flex flex-wrap gap-1.5 pl-6">
        {Array.from(simulatedGroups.entries()).map(([simKey, val]) => {
          const parts = simKey.split("__");
          const areaName = areaMap[parts[0]] ?? "Onbekend";
          return (
            <Badge key={simKey} variant="outline" className="text-xs border-primary/30 text-primary gap-1">
              <CheckCircle2 className="h-3 w-3" />
              {areaName} · {parts[1]} — Voorstel {val.proposalIdx + 1}
              {val.suggestion && <span className="text-muted-foreground">({val.suggestion.dayName} {val.suggestion.startTime?.slice(0,5)})</span>}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}