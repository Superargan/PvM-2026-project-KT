import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { clientKeys } from "@/lib/queryKeys";

interface Props {
  clientId: string;
  primaryAreaId?: string | null;
  allAreasFlexible: boolean;
  onAllAreasFlexibleChange: (val: boolean) => void;
  areas: { id: string; name: string }[];
  areaNotes?: string | null;
  onAreaNotesChange?: (val: string) => void;
}

export default function AreaPreferencesEditor({
  clientId,
  primaryAreaId,
  allAreasFlexible,
  onAllAreasFlexibleChange,
  areas,
  areaNotes,
  onAreaNotesChange,
}: Props) {
  const queryClient = useQueryClient();
  const [prefs, setPrefs] = useState<(string | null)[]>([null, null, null]);

  const { data: savedPrefs = [] } = useQuery({
    queryKey: clientKeys.areaPreferences(clientId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_area_preferences")
        .select("id, area_id, preference_order")
        .eq("client_id", clientId)
        .order("preference_order");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!clientId,
  });

  // Populate local state from DB
  useEffect(() => {
    const arr: (string | null)[] = [null, null, null];
    savedPrefs.forEach((p: any) => {
      const idx = (p.preference_order ?? 1) - 1;
      if (idx >= 0 && idx < 3) arr[idx] = p.area_id;
    });
    setPrefs(arr);
  }, [savedPrefs]);

  // Areas already used (primary + chosen reserves)
  const usedIds = new Set<string>();
  if (primaryAreaId) usedIds.add(primaryAreaId);
  prefs.forEach((p) => { if (p) usedIds.add(p); });

  const getAvailableAreas = (index: number) => {
    return areas.filter((a) => {
      if (a.id === primaryAreaId) return false;
      // Allow currently selected value for this slot
      if (a.id === prefs[index]) return true;
      return !usedIds.has(a.id);
    });
  };

  const updatePref = async (index: number, areaId: string | null) => {
    const newPrefs = [...prefs];
    const oldAreaId = newPrefs[index];
    newPrefs[index] = areaId;
    setPrefs(newPrefs);

    // Remove old
    if (oldAreaId) {
      await supabase
        .from("client_area_preferences")
        .delete()
        .eq("client_id", clientId)
        .eq("area_id", oldAreaId);
    }

    // Insert new
    if (areaId) {
      await supabase.from("client_area_preferences").insert({
        client_id: clientId,
        area_id: areaId,
        preference_order: index + 1,
      } as any);
    }

    queryClient.invalidateQueries({ queryKey: clientKeys.areaPreferences(clientId) });
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Reserve-gebieden (tweede keus)
      </p>

      <div className="flex items-center gap-3">
        <Checkbox
          id={`flex-${clientId}`}
          checked={allAreasFlexible}
          onCheckedChange={(v) => onAllAreasFlexibleChange(!!v)}
        />
        <Label htmlFor={`flex-${clientId}`} className="text-sm">
          Flexibel inzetbaar (alle gebieden)
        </Label>
      </div>

      {!allAreasFlexible && (
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((idx) => (
            <div key={idx} className="space-y-1">
              <Label className="text-xs text-muted-foreground">Reserve {idx + 1}</Label>
              <Select
                value={prefs[idx] ?? "none"}
                onValueChange={(v) => updatePref(idx, v === "none" ? null : v)}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Geen" />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="none">Geen</SelectItem>
                  {getAvailableAreas(idx).map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      )}

      {/* Show current preferences as badges */}
      {(allAreasFlexible || prefs.some(Boolean)) && (
        <div className="flex flex-wrap gap-1.5">
          {allAreasFlexible ? (
            <Badge variant="secondary" className="text-xs">Alle gebieden</Badge>
          ) : (
            prefs.filter(Boolean).map((areaId, i) => {
              const area = areas.find((a) => a.id === areaId);
              return (
                <Badge key={i} variant="outline" className="text-xs">
                  Reserve {i + 1}: {area?.name ?? "Onbekend"}
                </Badge>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
