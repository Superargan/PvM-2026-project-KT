import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Loader2, Users, UserPlus, X, GraduationCap, Calendar, MapPin, Settings, ClipboardList,
} from "lucide-react";
import ProgramTrainers from "@/components/ProgramTrainers";
import ProgramAttendance from "@/components/ProgramAttendance";

const statusMap: Record<string, { css: string; label: string }> = {
  te_plannen: { css: "status-rood", label: "Te plannen" },
  ingepland: { css: "status-oranje", label: "Ingepland" },
  gestart: { css: "status-groen", label: "Gestart" },
  afgerond: { css: "status-rood", label: "Afgerond" },
};

export default function ProgramDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedClientId, setSelectedClientId] = useState("");

  // Fetch program
  const { data: program, isLoading } = useQuery({
    queryKey: ["program", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("programs")
        .select("*, schools(name), areas(name), neighborhoods(name)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch enrolled clients
  const { data: enrolledClients = [], refetch: refetchEnrolled } = useQuery({
    queryKey: ["program_clients_full", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("program_clients")
        .select("id, client_id, enrolled_at, clients(id, first_name, last_name, date_of_birth, gender, schools(name))")
        .eq("program_id", id!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id,
  });

  // Fetch all clients for adding
  const { data: allClients = [] } = useQuery({
    queryKey: ["all-clients-for-program"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name")
        .order("first_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const enrolledIds = enrolledClients.map((ec: any) => ec.client_id);
  const availableClients = allClients.filter((c: any) => !enrolledIds.includes(c.id));

  // Add participant
  const addMutation = useMutation({
    mutationFn: async () => {
      if (!selectedClientId) return;
      const { error } = await supabase.from("program_clients").insert({
        program_id: id!,
        client_id: selectedClientId,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      setSelectedClientId("");
      refetchEnrolled();
      qc.invalidateQueries({ queryKey: ["programs"] });
      toast({ title: "Deelnemer toegevoegd" });
    },
    onError: (err: any) => toast({ title: "Fout", description: err.message, variant: "destructive" }),
  });

  // Remove participant
  const removeMutation = useMutation({
    mutationFn: async (enrollmentId: string) => {
      const { error } = await supabase.from("program_clients").delete().eq("id", enrollmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      refetchEnrolled();
      qc.invalidateQueries({ queryKey: ["programs"] });
      toast({ title: "Deelnemer verwijderd" });
    },
    onError: (err: any) => toast({ title: "Fout", description: err.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!program) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate("/programmas")}>
          <ArrowLeft className="h-4 w-4" /> Terug
        </Button>
        <p className="text-muted-foreground">Programma niet gevonden.</p>
      </div>
    );
  }

  const status = program.status ?? "te_plannen";
  const statusInfo = statusMap[status] ?? { css: "status-oranje", label: status };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/programmas")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-extrabold text-foreground">{program.name}</h1>
            <span className={`status-indicator ${statusInfo.css}`}>{statusInfo.label}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {program.schools?.name && <>{program.schools.name} • </>}
            {program.areas?.name && <>{program.areas.name}</>}
            {program.neighborhoods?.name && <> — {program.neighborhoods.name}</>}
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Users className="h-3.5 w-3.5" /> Deelnemers</div>
          <p className="text-2xl font-bold text-foreground">{enrolledClients.length}<span className="text-sm font-normal text-muted-foreground">/{program.max_participants ?? 10}</span></p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Calendar className="h-3.5 w-3.5" /> Periode</div>
          <p className="text-sm font-semibold text-foreground">
            {program.start_date ? new Date(program.start_date).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) : "—"}
            {" – "}
            {program.end_date ? new Date(program.end_date).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><MapPin className="h-3.5 w-3.5" /> Gebied</div>
          <p className="text-sm font-semibold text-foreground">
            {program.areas?.name ?? "—"}{program.neighborhoods?.name ? ` — ${program.neighborhoods.name}` : ""}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="deelnemers" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="deelnemers" className="gap-1.5"><Users className="h-3.5 w-3.5" /> Deelnemers</TabsTrigger>
          <TabsTrigger value="trainers" className="gap-1.5"><GraduationCap className="h-3.5 w-3.5" /> Trainers</TabsTrigger>
          <TabsTrigger value="sessies" className="gap-1.5"><ClipboardList className="h-3.5 w-3.5" /> Sessies & Presentie</TabsTrigger>
        </TabsList>

        {/* Deelnemers tab */}
        <TabsContent value="deelnemers" className="space-y-4">
          {/* Add participant */}
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Deelnemer toevoegen</p>
            <div className="flex gap-2">
              <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Selecteer een cliënt" />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  {availableClients.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.first_name} {c.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button disabled={!selectedClientId || addMutation.isPending} onClick={() => addMutation.mutate()}>
                <UserPlus className="h-4 w-4 mr-1" /> Toevoegen
              </Button>
            </div>
          </div>

          {/* Enrolled list */}
          <div className="rounded-xl border border-border bg-card">
            {enrolledClients.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-muted-foreground">
                <Users className="h-8 w-8 mb-2" />
                <p className="text-sm">Nog geen deelnemers ingeschreven</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {enrolledClients.map((ec: any) => {
                  const c = ec.clients;
                  if (!c) return null;
                  return (
                    <div key={ec.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          {c.first_name?.[0]}{c.last_name?.[0]}
                        </div>
                        <div>
                          <button
                            onClick={() => navigate(`/clienten/${c.id}`)}
                            className="text-sm font-medium text-foreground hover:underline"
                          >
                            {c.first_name} {c.last_name}
                          </button>
                          <p className="text-xs text-muted-foreground">
                            {c.schools?.name ?? ""}{c.gender ? ` • ${c.gender}` : ""}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => removeMutation.mutate(ec.id)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Trainers tab */}
        <TabsContent value="trainers">
          <div className="rounded-xl border border-border bg-card p-6">
            <ProgramTrainers programId={id!} />
          </div>
        </TabsContent>

        {/* Sessies tab */}
        <TabsContent value="sessies">
          <div className="rounded-xl border border-border bg-card p-6">
            <ProgramAttendance programId={id!} programName={program.name} inline />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
