import { memo } from "react";
import {
  AlertTriangle,
  ShieldAlert,
  RefreshCw,
  MapPinOff,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getResolvedAreaName } from "@/lib/DomainResolver";
import type { PlanningClientRow } from "@/lib/queryShapes";

export type WarningFilter =
  | "noAvail"
  | "unusable"
  | "stale"
  | "noArea"
  | "overridden";

export interface WarningCounts {
  noAvail: number;
  unusableAvail: number;
  staleCoverage: number;
  noArea: number;
  overridden: number;
  noAvailIds: string[];
  unusableAvailIds: string[];
  staleCoverageIds: string[];
  noAreaIds: string[];
  overriddenIds: string[];
}

type Color = "warning" | "destructive" | "info" | "role";

const colorMap: Record<Color, string> = {
  warning:
    "bg-warning-muted text-warning-foreground border-warning-border hover:bg-warning-muted/80",
  destructive:
    "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/15",
  info: "bg-info-muted text-info-foreground border-info-border hover:bg-info-muted/80",
  role: "bg-role-muted text-role-foreground border-role-border hover:bg-role-muted/80",
};

interface WarningButtonProps {
  count: number;
  label: string;
  icon: LucideIcon;
  color: Color;
  onClick?: () => void;
}

const WarningButtonInner = ({ count, label, icon: Icon, color, onClick }: WarningButtonProps) => {
  if (count === 0) return null;
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${colorMap[color]}`}
    >
      <Icon className="h-3.5 w-3.5" />
      <span>{count}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
};

export const WarningButton = memo(WarningButtonInner);

interface WarningBarProps {
  counts: WarningCounts;
  onSelect: (filter: WarningFilter) => void;
}

const WarningBarInner = ({ counts, onSelect }: WarningBarProps) => (
  <div className="flex flex-wrap gap-2">
    <WarningButton
      count={counts.noAvail}
      label="Beschikbaarheid nog doorgeven"
      icon={AlertTriangle}
      color="warning"
      onClick={() => onSelect("noAvail")}
    />
    <WarningButton
      count={counts.unusableAvail}
      label="Onbruikbare beschikbaarheid"
      icon={ShieldAlert}
      color="destructive"
      onClick={() => onSelect("unusable")}
    />
    <WarningButton
      count={counts.staleCoverage}
      label="Beschikbaarheid actualiseren"
      icon={RefreshCw}
      color="warning"
      onClick={() => onSelect("stale")}
    />
    <WarningButton
      count={counts.noArea}
      label="Geen gebied"
      icon={MapPinOff}
      color="info"
      onClick={() => onSelect("noArea")}
    />
    <WarningButton
      count={counts.overridden}
      label="Overruled (admin)"
      icon={ShieldCheck}
      color="role"
      onClick={() => onSelect("overridden")}
    />
  </div>
);

export const WarningBar = memo(WarningBarInner);

const WARNING_TITLES: Record<WarningFilter, string> = {
  noAvail: "Beschikbaarheid nog doorgeven",
  unusable: "Onbruikbare beschikbaarheid",
  stale: "Beschikbaarheid actualiseren",
  noArea: "Geen gebied",
  overridden: "Overruled (admin)",
};

interface WarningDetailDialogProps {
  filter: WarningFilter | null;
  counts: WarningCounts;
  clientsById: Map<string, PlanningClientRow>;
  onClose: () => void;
  onSelectClient: (id: string) => void;
}

const WarningDetailDialogInner = ({
  filter,
  counts,
  clientsById,
  onClose,
  onSelectClient,
}: WarningDetailDialogProps) => {
  const ids =
    filter === "noAvail"
      ? counts.noAvailIds
      : filter === "unusable"
      ? counts.unusableAvailIds
      : filter === "stale"
      ? counts.staleCoverageIds
      : filter === "noArea"
      ? counts.noAreaIds
      : filter === "overridden"
      ? counts.overriddenIds
      : [];

  return (
    <Dialog open={filter !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{filter ? WARNING_TITLES[filter] : ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          {ids.map((id) => {
            const c = clientsById.get(id);
            if (!c) return null;
            const areaName = getResolvedAreaName(c);
            return (
              <button
                key={id}
                className="w-full flex items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-muted/50 transition-colors"
                onClick={() => onSelectClient(id)}
              >
                <span className="text-sm font-medium text-foreground truncate">
                  {c.first_name} {c.last_name}
                </span>
                <span className="text-xs text-muted-foreground ml-auto shrink-0">
                  {areaName !== "—" ? areaName : "Geen gebied"}
                </span>
                <Badge variant="outline" className="text-[10px] shrink-0">
                  {c.intake_status ?? "—"}
                </Badge>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export const WarningDetailDialog = memo(WarningDetailDialogInner);