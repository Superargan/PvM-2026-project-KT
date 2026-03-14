import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { staffKeys } from "@/lib/queryKeys";
import { Badge } from "@/components/ui/badge";
import { CalendarCheck, CalendarClock, Loader2 } from "lucide-react";

export default function TrainerTrainings({ staffId }: { staffId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: staffKeys.trainerTrainings(staffId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("program_staff")
        .select("id, role, programs(id, name, status, start_date, end_date, areas(name))")
        .eq("staff_id", staffId);
      if (error) throw error;

      const now = new Date().toISOString().split("T")[0];
      const unique = new Map<string, any>();
      (data ?? []).forEach((ps: any) => {
        if (ps.programs && !unique.has(ps.programs.id)) {
          unique.set(ps.programs.id, ps.programs);
        }
      });

      const all = Array.from(unique.values());
      const past = all.filter((p: any) => p.status === "afgerond" || (p.end_date && p.end_date < now));
      const upcoming = all.filter((p: any) => !past.includes(p));

      return { past, upcoming };
    },
    enabled: !!staffId,
  });

  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (!data) return null;

  return (
    <div className="space-y-3">
      {data.upcoming.length > 0 && (
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-1.5">
            <CalendarClock className="h-3.5 w-3.5" /> Geplande trainingen ({data.upcoming.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {data.upcoming.map((p: any) => (
              <Badge key={p.id} variant="outline" className="text-[10px] border-primary/30 text-primary">
                {p.name}
              </Badge>
            ))}
          </div>
        </div>
      )}
      {data.past.length > 0 && (
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground mb-1.5">
            <CalendarCheck className="h-3.5 w-3.5" /> Gerealiseerde trainingen ({data.past.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {data.past.map((p: any) => (
              <Badge key={p.id} variant="secondary" className="text-[10px]">
                {p.name}
              </Badge>
            ))}
          </div>
        </div>
      )}
      {data.upcoming.length === 0 && data.past.length === 0 && (
        <p className="text-xs text-muted-foreground">Geen trainingen gekoppeld</p>
      )}
    </div>
  );
}
