import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { clientKeys } from "@/lib/queryKeys";
import { findPotentialDuplicates, statusLabels, calculateAge, type DuplicateMatch } from "@/lib/clientUtils";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useMemo } from "react";

interface DuplicateWarningProps {
  firstName: string;
  lastName: string;
  excludeId?: string;
  /** Pre-loaded clients list — if provided, skips the query */
  clients?: any[];
  onNavigate?: (id: string) => void;
}

export default function DuplicateWarning({ firstName, lastName, excludeId, clients: clientsProp, onNavigate }: DuplicateWarningProps) {
  const { data: fetchedClients } = useQuery({
    queryKey: clientKeys.duplicateCheck,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name, date_of_birth, intake_status, schools(name)")
        .eq("archived", false);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !clientsProp,
    staleTime: 30_000,
  });

  const allClients = clientsProp ?? fetchedClients ?? [];

  const matches: DuplicateMatch[] = useMemo(
    () => findPotentialDuplicates(firstName, lastName, allClients, excludeId),
    [firstName, lastName, allClients, excludeId]
  );

  if (matches.length === 0) return null;

  return (
    <div className="rounded-lg border border-warning-border bg-warning-muted p-3 space-y-2">
      <div className="flex items-center gap-2 text-warning-foreground">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <p className="text-sm font-semibold">
          Mogelijke duplica{matches.length === 1 ? "at" : "ten"} gevonden ({matches.length})
        </p>
      </div>
      <div className="space-y-1">
        {matches.map((m) => (
          <div key={m.client.id} className="flex items-center gap-2 text-sm">
            <span
              className={onNavigate ? "text-primary hover:underline cursor-pointer font-medium" : "font-medium"}
              onClick={() => onNavigate?.(m.client.id)}
            >
              {m.client.first_name} {m.client.last_name}
            </span>
            {m.client.date_of_birth && (
              <span className="text-muted-foreground text-xs">
                ({calculateAge(m.client.date_of_birth)} jr)
              </span>
            )}
            <Badge variant="outline" className="text-[10px]">
              {statusLabels[m.client.intake_status ?? "nieuw"] ?? m.client.intake_status}
            </Badge>
            {m.client.schools?.name && (
              <span className="text-muted-foreground text-xs">{m.client.schools.name}</span>
            )}
            {m.matchType === "exact" ? (
              <Badge className="text-[9px] bg-destructive/10 text-destructive border-destructive/30">Exact</Badge>
            ) : (
              <Badge className="text-[9px] bg-warning-muted text-warning-foreground border-warning-border">Lijkt op</Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
