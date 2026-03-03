import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X, Plus, UserCheck, UserPlus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ProgramTrainersProps {
  programId: string;
}

export default function ProgramTrainers({ programId }: ProgramTrainersProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addRole, setAddRole] = useState<"trainer" | "invaller">("trainer");
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const { data: assignments = [] } = useQuery({
    queryKey: ["program_staff", programId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("program_staff")
        .select("*, staff(id, name, email)")
        .eq("program_id", programId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: allStaff = [] } = useQuery({
    queryKey: ["staff-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("staff").select("id, name, email").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const assignedIds = assignments.map((a: any) => a.staff_id);
  const availableStaff = allStaff.filter((s: any) => !assignedIds.includes(s.id));

  const mainTrainers = assignments.filter((a: any) => a.role === "trainer");
  const invallers = assignments.filter((a: any) => a.role === "invaller");

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!selectedStaffId) return;
      const { error } = await supabase.from("program_staff").insert({
        program_id: programId,
        staff_id: selectedStaffId,
        role: addRole,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["program_staff", programId] });
      setSelectedStaffId("");
      setShowAdd(false);
      toast({ title: "Trainer gekoppeld" });
    },
    onError: (err: any) => {
      toast({ title: "Fout", description: err.message, variant: "destructive" });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("program_staff").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["program_staff", programId] });
      toast({ title: "Trainer ontkoppeld" });
    },
    onError: (err: any) => {
      toast({ title: "Fout", description: err.message, variant: "destructive" });
    },
  });

  const canAddMain = mainTrainers.length < 2;

  return (
    <div className="space-y-2">
      {/* Main trainers */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <UserCheck className="h-3.5 w-3.5" />
        <span>Vaste trainers ({mainTrainers.length}/2)</span>
      </div>
      {mainTrainers.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {mainTrainers.map((a: any) => (
            <Badge key={a.id} variant="secondary" className="gap-1 pr-1">
              {a.staff?.name ?? "Onbekend"}
              <button
                onClick={() => removeMutation.mutate(a.id)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-xs italic text-muted-foreground">Geen vaste trainers gekoppeld</p>
      )}

      {/* Invallers */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2">
        <UserPlus className="h-3.5 w-3.5" />
        <span>Invallers ({invallers.length})</span>
      </div>
      {invallers.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {invallers.map((a: any) => (
            <Badge key={a.id} variant="outline" className="gap-1 pr-1">
              {a.staff?.name ?? "Onbekend"}
              <button
                onClick={() => removeMutation.mutate(a.id)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-xs italic text-muted-foreground">Geen invallers gekoppeld</p>
      )}

      {/* Add trainer */}
      {showAdd ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-background p-2 mt-2">
          <div className="flex gap-2">
            <Select value={addRole} onValueChange={(v) => setAddRole(v as "trainer" | "invaller")}>
              <SelectTrigger className="w-28 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="trainer" disabled={!canAddMain}>Trainer</SelectItem>
                <SelectItem value="invaller">Invaller</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedStaffId} onValueChange={setSelectedStaffId}>
              <SelectTrigger className="flex-1 h-8 text-xs">
                <SelectValue placeholder="Selecteer trainer" />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                {availableStaff.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.name ?? s.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs flex-1" disabled={!selectedStaffId} onClick={() => addMutation.mutate()}>
              Koppelen
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowAdd(false)}>
              Annuleren
            </Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="ghost" className="h-7 text-xs mt-1 w-full" onClick={() => setShowAdd(true)}>
          <Plus className="h-3 w-3 mr-1" /> Trainer koppelen
        </Button>
      )}
    </div>
  );
}
