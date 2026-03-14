import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { clientKeys, programKeys } from "@/lib/queryKeys";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, UserPlus, Clock, XCircle, Upload, Pencil } from "lucide-react";
import ClientImport from "@/components/ClientImport";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { getAgeGroup } from "@/lib/DomainResolver";
import { areaKeys } from "@/lib/queryKeys";

const statusLabels: Record<string, string> = {
  waiting: "Wachtend",
  dropped_out: "Uitgevallen",
};
const statusColors: Record<string, string> = {
  waiting: "bg-warning-muted text-warning-foreground",
  dropped_out: "bg-destructive/10 text-destructive",
};

export default function WaitlistManager({ onEdit }: { onEdit?: (client: any) => void }) {
  const [filterArea, setFilterArea] = useState<string>("all");
  const [importOpen, setImportOpen] = useState(false);
  const qc = useQueryClient();

  const { data: areas = [] } = useQuery({
    queryKey: areaKeys.all,
    queryFn: async () => {
      const { data, error } = await supabase.from("areas").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: waitlistClients = [], isLoading } = useQuery({
    queryKey: clientKeys.waitlist(filterArea),
    queryFn: async () => {
      let query = supabase
        .from("clients")
        .select("id, first_name, last_name, date_of_birth, registration_date, created_at, intake_date, guardian_phone, school_id, waitlist_status, waitlist_area_id, dropout_reason, dropout_action, schools(name), areas:waitlist_area_id(name)")
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
    queryKey: programKeys.available,
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
      // Add to program
      const { error: enrollError } = await supabase.from("program_clients").insert({
        program_id: programId,
        client_id: clientId,
      });
      if (enrollError) throw enrollError;

      // Remove from waitlist
      const { error: updateError } = await supabase
        .from("clients")
        .update({ waitlist_status: null, waitlist_area_id: null, intake_status: "actief" })
        .eq("id", clientId);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      toast.success("Deelnemer toegewezen aan programma");
      qc.invalidateQueries({ queryKey: clientKeys.all });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const [assigningClient, setAssigningClient] = useState<string | null>(null);
  const [selectedProgram, setSelectedProgram] = useState("");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-card-foreground">Wachtlijst</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" /> Importeren
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
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Naam</TableHead>
                <TableHead>Leeftijdsgroep</TableHead>
                <TableHead>School</TableHead>
                <TableHead>Gebied</TableHead>
                <TableHead>Telefoon</TableHead>
                <TableHead>Aanmelddatum</TableHead>
                <TableHead>Intakedatum</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actie</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {waitlistClients.map((client: any) => {
                const ageGroup = getAgeGroup(client.date_of_birth);

                return (
                <TableRow key={client.id}>
                  <TableCell className="font-medium">{client.first_name} {client.last_name}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{ageGroup}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-card-foreground">
                    {client.schools?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-card-foreground">
                    {(client as { areas?: { name: string } }).areas?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-card-foreground">
                    {client.guardian_phone ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {client.registration_date ? format(new Date(client.registration_date), "d MMM yyyy", { locale: nl }) : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {client.intake_date ? format(new Date(client.intake_date), "d MMM yyyy", { locale: nl }) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge className={statusColors[client.waitlist_status] ?? ""}>
                      {client.waitlist_status === "waiting" ? <Clock className="h-3 w-3 mr-1" /> : <XCircle className="h-3 w-3 mr-1" />}
                      {statusLabels[client.waitlist_status] ?? client.waitlist_status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center gap-1 justify-end">
                    {onEdit && (
                      <Button size="sm" variant="ghost" onClick={() => onEdit(client)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
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
                  </div>
                  </TableCell>
                </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <ClientImport open={importOpen} onOpenChange={setImportOpen} mode="waitlist" />
    </div>
  );
}
