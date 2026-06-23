import React from "react";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { calculateAge, matchColors, statusBadgeStyles } from "@/lib/DomainResolver";
import type { ClientWithMatch } from "./types";

export interface MemberRowProps {
  cm: ClientWithMatch;
  isCheckedHere: boolean;
  isDisabled: boolean;
  isAssignedElsewhere: boolean;
  assignedGroupLabel: string;
  isInProgram: boolean;
  onToggle: () => void;
}

function MemberRowImpl({
  cm,
  isCheckedHere,
  isDisabled,
  isAssignedElsewhere,
  assignedGroupLabel,
  isInProgram,
  onToggle,
}: MemberRowProps) {
  const { client, matchType } = cm;
  const age = calculateAge(client.date_of_birth);
  const statusStyle = statusBadgeStyles[client.intake_status ?? ""] ?? statusBadgeStyles.wachtlijst;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <label
            className={`flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors ${
              isDisabled ? "opacity-50 cursor-not-allowed" : "hover:bg-muted/50 cursor-pointer"
            }`}
          >
            <Checkbox checked={isCheckedHere} onCheckedChange={onToggle} disabled={isDisabled} />
            <span className="text-sm text-foreground truncate">{client.first_name} {client.last_name}</span>
            {isAssignedElsewhere && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 border-warning-border text-warning-foreground gap-0.5">
                <AlertTriangle className="h-2.5 w-2.5" /> Al in {assignedGroupLabel}
              </Badge>
            )}
            {isInProgram && !isAssignedElsewhere && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 border-destructive/40 text-destructive gap-0.5">
                <ShieldAlert className="h-2.5 w-2.5" /> Al ingepland
              </Badge>
            )}
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ml-auto shrink-0 ${statusStyle.className}`}>{statusStyle.label}</Badge>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 shrink-0 ${matchColors[matchType]}`}>{matchType}</Badge>
            {age !== null && <span className="text-xs text-muted-foreground shrink-0">{age}j</span>}
          </label>
        </TooltipTrigger>
        {isAssignedElsewhere && (
          <TooltipContent>
            <p className="text-xs">Al geselecteerd in groep {assignedGroupLabel}. Verwijder eerst de selectie daar.</p>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );
}

export const MemberRow = React.memo(MemberRowImpl);