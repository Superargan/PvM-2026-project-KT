import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Trash2, Clock, UserPlus, Upload } from "lucide-react";
import ClientImport from "@/components/ClientImport";
import { filterClients, statusLabels, statusStyles } from "@/lib/clientUtils";
import ClientFilters from "@/components/ClientFilters";
import ClientListTable from "@/components/ClientListTable";

export default function WachtlijstPage() {
  const [filterArea, setFilterArea] = useState<string>("all");
  const [filterSchool, setFilterSchool] = useState<string>("all");
  const [filterAge, setFilterAge] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [assigningClient, setAssigningClient] = useState<string | null>(null);
  const [selectedProgram, setSelectedProgram] = useState("");
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: areas = [] } = useQuery({
    queryKey: ["areas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("areas").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: schools = [] } = useQuery({
    queryKey: ["schools-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: waitlistClients = [], isLoading } = useQuery({
    queryKey: ["waitlist-clients"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name, date_of_birth, school_id, waitlist_status, waitlist_area_id, dropout_reason, dropout_action, intake_date, intake_status, registration_date, guardian_phone, guardian_name, created_at, schools(name), areas:waitlist_area_id(name)")
        .not("waitlist_status", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: programs = [] } = useQuery({
    queryKey: ["active-programs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("programs")
        .select("id, name, area_id, areas(name)")
        .in("status", ["te_plannen", "ingepland"])
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const filteredClients = filterClients(waitlistClients, {
    search, area: filterArea, school: filterSchool, age: filterAge, status: filterStatus,
  });

  const assignMutation = useMutation({
    mutationFn: async ({ clientId, programId }: { clientId: string; programId: string }) => {
      const { error: enrollError } = await supabase.from("program_clients").insert({
        program_id: programId,
        client_id: clientId,
      } as any);
      if (enrollError) throw enrollError;

      const { error: updateError } = await supabase
        .from("clients")
        .update({ waitlist_status: null, waitlist_area_id: null, intake_status: "actief" } as any)
        .eq("id", clientId);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      toast.success("Deelnemer toegewezen aan programma");
      qc.invalidateQueries({ queryKey: ["waitlist-clients"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const table of ["attendance", "program_clients", "client_assignments", "client_availability", "audit_log"] as const) {
        const { error } = await supabase.from(table).delete().in("client_id", ids);
        if (error) throw error;
      }
      const { error } = await supabase.from("clients").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_, ids) => {
      toast.success(`${ids.length} deelnemer(s) verwijderd van de wachtlijst`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["waitlist-clients"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filteredClients.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredClients.map((c: any) => c.id)));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-foreground">Wachtlijst</h1>
          <p className="text-sm text-muted-foreground">
            {filteredClients.length !== waitlistClients.length ? `${filteredClients.length} van ${waitlistClients.length}` : waitlistClients.length} deelnemers op de wachtlijst
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm">
                  <Trash2 className="h-4 w-4 mr-1" />
                  Verwijder ({selected.size})
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Wachtlijst items verwijderen?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Je staat op het punt {selected.size} deelnemer(s) volledig te verwijderen. Dit kan niet ongedaan worden gemaakt.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annuleren</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => deleteMutation.mutate(Array.from(selected))}
                  >
                    Verwijderen
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-1" /> Importeren
          </Button>
        </div>
      </div>

      <ClientFilters
        search={search} onSearchChange={setSearch}
        filterArea={filterArea} onFilterAreaChange={setFilterArea}
        filterSchool={filterSchool} onFilterSchoolChange={setFilterSchool}
        filterAge={filterAge} onFilterAgeChange={setFilterAge}
        filterStatus={filterStatus} onFilterStatusChange={setFilterStatus}
        areas={areas} schools={schools}
        totalCount={waitlistClients.length} filteredCount={filteredClients.length}
      />

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : filteredClients.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-muted-foreground">
          <Clock className="h-8 w-8 mb-2" />
          <p className="text-sm">Geen deelnemers op de wachtlijst</p>
        </div>
      ) : (
        <ClientListTable
          clients={filteredClients}
          onNavigate={(id) => navigate(`/clienten/${id}`)}
          showCheckbox
          selected={selected}
          onToggleSelect={toggleSelect}
          onToggleAll={toggleAll}
          renderActions={(client) => (
            assigningClient === client.id ? (
              <div className="flex items-center gap-2 justify-end">
                <Select value={selectedProgram} onValueChange={setSelectedProgram}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Kies programma" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    {programs.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={!selectedProgram || assignMutation.isPending}
                  onClick={() => {
                    assignMutation.mutate({ clientId: client.id, programId: selectedProgram });
                    setAssigningClient(null);
                    setSelectedProgram("");
                  }}
                >
                  <UserPlus className="h-3.5 w-3.5" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setAssigningClient(null); setSelectedProgram(""); }}>
                  Annuleer
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={() => setAssigningClient(client.id)}>
                Toewijzen
              </Button>
            )
          )}
          emptyMessage="Geen deelnemers op de wachtlijst"
        />
      )}

      <ClientImport open={importOpen} onOpenChange={setImportOpen} mode="waitlist" />
    </div>
  );
}
