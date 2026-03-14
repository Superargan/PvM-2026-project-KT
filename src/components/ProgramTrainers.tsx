import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { programKeys, staffKeys } from "@/lib/queryKeys";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X, Plus, UserCheck, UserPlus, CalendarDays, ArrowLeftRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ProgramTrainersProps {
  programId: string;
}

export default function ProgramTrainers({ programId }: ProgramTrainersProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addRole, setAddRole] = useState<"trainer" | "invaller">("trainer");
  const [selectedStaffId, setSelectedStaffId] = useState("");
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [replacesStaffId, setReplacesStaffId] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const { data: assignments = [] } = useQuery({
    queryKey: programKeys.staff(programId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("program_staff")
        .select("*, staff:staff!program_staff_staff_id_fkey(id, name, email)")
        .eq("program_id", programId);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch sessions for invaller selection
  const { data: sessions = [] } = useQuery({
    queryKey: ["program_sessions", programId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("program_sessions")
        .select("*")
        .eq("program_id", programId)
        .order("session_number");
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

  const mainTrainers = assignments.filter((a: any) => a.role === "trainer" || a.role === "oudertrainer" || a.role === "kindtrainer");
  const invallers = assignments.filter((a: any) => a.role === "invaller");

  // For invallers, don't filter out already assigned staff (they can sub on different sessions)
  const availableStaffForRole = addRole === "trainer"
    ? allStaff.filter((s: any) => !assignments.filter((a: any) => a.role === "trainer").map((a: any) => a.staff_id).includes(s.id))
    : allStaff;

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!selectedStaffId) return;
      const insertData: any = {
        program_id: programId,
        staff_id: selectedStaffId,
        role: addRole,
      };
      if (addRole === "invaller") {
        if (!selectedSessionId) throw new Error("Selecteer een bijeenkomst");
        if (!replacesStaffId) throw new Error("Selecteer voor welke trainer wordt ingevallen");
        insertData.session_id = selectedSessionId;
        insertData.replaces_staff_id = replacesStaffId;
      }
      const { error } = await supabase.from("program_staff").insert(insertData as any);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["program_staff", programId] });
      setSelectedStaffId("");
      setSelectedSessionId("");
      setReplacesStaffId("");
      setShowAdd(false);
      toast({ title: "Trainer gekoppeld" });
    },
    onError: (err: any) => {
      const msg = err.message?.includes("unique") || err.message?.includes("duplicate")
        ? "Deze trainer is al gekoppeld aan dit programma"
        : err.message;
      toast({ title: "Fout", description: msg, variant: "destructive" });
    },
  });

  const toggleRoleMutation = useMutation({
    mutationFn: async ({ id, currentRole }: { id: string; currentRole: string }) => {
      const newRole = currentRole === "oudertrainer" ? "kindtrainer" : "oudertrainer";
      const { error } = await supabase.from("program_staff").update({ role: newRole }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["program_staff", programId] });
      toast({ title: "Rol gewijzigd" });
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

  const canAddMain = true;

  // Helper to get staff name by id
  const getStaffName = (staffId: string) => {
    const s = allStaff.find((st: any) => st.id === staffId);
    return s?.name ?? "Onbekend";
  };

  // Helper to get session label
  const getSessionLabel = (sessionId: string) => {
    const s = sessions.find((ses: any) => ses.id === sessionId);
    if (!s) return "";
    const dateStr = s.session_date
      ? new Date(s.session_date).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })
      : "";
    return `#${s.session_number}${dateStr ? ` (${dateStr})` : ""}`;
  };

  return (
    <div className="space-y-2">
      {/* Main trainers */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <UserCheck className="h-3.5 w-3.5" />
        <span>Vaste trainers ({mainTrainers.length})</span>
      </div>
      {mainTrainers.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {mainTrainers.map((a: any) => (
            <Badge key={a.id} variant="secondary" className="gap-1 pr-1">
              {a.staff?.name ?? "Onbekend"}
              {(a.role === "oudertrainer" || a.role === "kindtrainer") && (
                <span className="text-muted-foreground text-[10px] ml-0.5">({a.role === "oudertrainer" ? "ouder" : "kind"})</span>
              )}
              <button
                onClick={() => toggleRoleMutation.mutate({ id: a.id, currentRole: a.role })}
                className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
                title={`Wijzig naar ${a.role === "oudertrainer" ? "kindtrainer" : "oudertrainer"}`}
              >
                <ArrowLeftRight className="h-3 w-3" />
              </button>
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
            <Badge key={a.id} variant="outline" className="gap-1 pr-1 text-xs">
              {a.staff?.name ?? "Onbekend"}
              {a.session_id && (
                <span className="text-muted-foreground ml-1">
                  {getSessionLabel(a.session_id)}
                </span>
              )}
              {a.replaces_staff_id && (
                <span className="text-muted-foreground ml-1">
                  → {getStaffName(a.replaces_staff_id)}
                </span>
              )}
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
            <Select value={addRole} onValueChange={(v) => { setAddRole(v as "trainer" | "invaller"); setSelectedSessionId(""); setReplacesStaffId(""); }}>
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
                {availableStaffForRole.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.name ?? s.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Extra fields for invaller */}
          {addRole === "invaller" && (
            <div className="flex gap-2">
              <Select value={selectedSessionId} onValueChange={setSelectedSessionId}>
                <SelectTrigger className="flex-1 h-8 text-xs">
                  <SelectValue placeholder="Bijeenkomst" />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  {sessions.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>
                      #{s.session_number}
                      {s.session_date
                        ? ` — ${new Date(s.session_date).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}`
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={replacesStaffId} onValueChange={setReplacesStaffId}>
                <SelectTrigger className="flex-1 h-8 text-xs">
                  <SelectValue placeholder="Vervangt trainer" />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  {mainTrainers.map((a: any) => (
                    <SelectItem key={a.staff_id} value={a.staff_id}>
                      {a.staff?.name ?? "Onbekend"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 text-xs flex-1"
              disabled={!selectedStaffId || (addRole === "invaller" && (!selectedSessionId || !replacesStaffId))}
              onClick={() => addMutation.mutate()}
            >
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
