import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Trash2, Clock, XCircle, UserPlus, Upload } from "lucide-react";
import ClientImport from "@/components/ClientImport";

function calculateAge(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
  return age;
}

const statusLabels: Record<string, string> = {
  waiting: "Wachtend",
  dropped_out: "Uitgevallen",
};
const statusColors: Record<string, string> = {
  waiting: "bg-amber-100 text-amber-800",
  dropped_out: "bg-red-100 text-red-800",
};

export default function WachtlijstPage() {
  const [filterArea, setFilterArea] = useState<string>("all");
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

  const { data: waitlistClients = [], isLoading } = useQuery({
    queryKey: ["waitlist-clients", filterArea],
    queryFn: async () => {
      let query = supabase
        .from("clients")
        .select("id, first_name, last_name, date_of_birth, school_id, waitlist_status, waitlist_area_id, dropout_reason, dropout_action, intake_date, created_at, schools(name), areas:waitlist_area_id(name)")
        .not("waitlist_status", "is", null);

      if (filterArea !== "all") {
        query = query.eq("waitlist_area_id", filterArea);
      }

      const { data, error } = await query.order("created_at", { ascending: false });
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
      // Delete related records first
      for (const table of ["attendance", "program_clients", "client_assignments", "client_availability", "audit_log"] as const) {
        const col = table === "audit_log" ? "client_id" : "client_id";
        const { error } = await supabase.from(table).delete().in(col, ids);
        if (error) throw error;
      }
      // Delete clients
      const { error } = await supabase.from("clients").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_, ids) => {
      toast.success(`${ids.length} deelnemer(s) verwijderd van de wachtlijst`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["waitlist-clients"] });
      qc.invalidateQueries({ queryKey: ["dashboard-participants"] });
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
    if (selected.size === waitlistClients.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(waitlistClients.map((c: any) => c.id)));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-foreground">Wachtlijst</h1>
          <p className="text-sm text-muted-foreground">Beheer deelnemers op de wachtlijst</p>
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
          <Select value={filterArea} onValueChange={setFilterArea}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter op gebied" />
            </SelectTrigger>
            <SelectContent className="bg-popover">
              <SelectItem value="all">Alle gebieden</SelectItem>
              {areas.map((a: any) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : waitlistClients.length === 0 ? (
        <div className="flex flex-col items-center py-12 text-muted-foreground">
          <Clock className="h-8 w-8 mb-2" />
          <p className="text-sm">Geen deelnemers op de wachtlijst{filterArea !== "all" ? " voor dit gebied" : ""}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={selected.size === waitlistClients.length && waitlistClients.length > 0}
                    onCheckedChange={toggleAll}
                  />
                </TableHead>
                <TableHead>Naam</TableHead>
                <TableHead>Leeftijd</TableHead>
                <TableHead>Gebied</TableHead>
                <TableHead>Inschrijving</TableHead>
                <TableHead>Intake</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actie</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {waitlistClients.map((client: any) => (
                <TableRow key={client.id} className={selected.has(client.id) ? "bg-muted/50" : ""}>
                  <TableCell>
                    <Checkbox
                      checked={selected.has(client.id)}
                      onCheckedChange={() => toggleSelect(client.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <button className="text-primary hover:underline text-left" onClick={() => navigate(`/clienten/${client.id}`)}>
                      {client.first_name} {client.last_name}
                    </button>
                  </TableCell>
                  <TableCell className="text-sm text-card-foreground">{(() => { const age = calculateAge(client.date_of_birth); return age !== null ? `${age} jaar` : "—"; })()}</TableCell>
                  <TableCell>{(client as any).areas?.name ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {client.created_at ? format(new Date(client.created_at), "d MMM yyyy", { locale: nl }) : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {client.intake_date ? format(new Date(client.intake_date), "d MMM yyyy", { locale: nl }) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColors[client.waitlist_status] ?? ""}>
                      {client.waitlist_status === "waiting" ? <Clock className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                      {statusLabels[client.waitlist_status] ?? client.waitlist_status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {assigningClient === client.id ? (
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
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ClientImport open={importOpen} onOpenChange={setImportOpen} mode="waitlist" />
    </div>
  );
}
