import { Users, Plus, Loader2, Download, Upload, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { downloadExport } from "@/lib/csvExport";
import ClientImport from "@/components/ClientImport";
import { calculateAge, statusLabels, filterClients } from "@/lib/clientUtils";
import { areaKeys } from "@/lib/queryKeys";
import ClientFilters from "@/components/ClientFilters";
import ClientListTable from "@/components/ClientListTable";
import DuplicateWarning from "@/components/DuplicateWarning";

export default function ClientenPage() {
  const [searchParams] = useSearchParams();
  const initialSchool = searchParams.get("school") ?? "all";
  const [search, setSearch] = useState("");
  const [filterArea, setFilterArea] = useState<string>("all");
  const [filterSchool, setFilterSchool] = useState<string>(initialSchool);
  const [filterAge, setFilterAge] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [addFirstName, setAddFirstName] = useState("");
  const [addLastName, setAddLastName] = useState("");
  const { toast } = useToast();
  const navigate = useNavigate();

  const { data: clients = [], isLoading, refetch } = useQuery({
    queryKey: ["clients", "list", search],
    queryFn: async () => {
      let query = supabase
        .from("clients")
        .select("*, neighborhoods:neighborhood_id(id, area_id, areas(id, name)), schools(id, name, neighborhood_id, neighborhoods(id, area_id, areas(id, name)))")
        .eq("archived", false)
        .in("intake_status", ["actief", "training_afgerond", "tussentijds_gestopt"])
        .order("created_at", { ascending: false });

      if (search.trim()) {
        query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,guardian_name.ilike.%${search}%`);
      }

      const { data, error } = await query;
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

  const { data: areas = [] } = useQuery({
    queryKey: areaKeys.all,
    queryFn: async () => {
      const { data, error } = await supabase.from("areas").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const filteredClients = filterClients(clients, {
    area: filterArea, school: filterSchool, age: filterAge, status: filterStatus,
  });

  const handleAddClient = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const { error } = await supabase.from("clients").insert({
      first_name: form.get("first_name") as string,
      last_name: form.get("last_name") as string,
      date_of_birth: (form.get("date_of_birth") as string) || null,
      guardian_name: (form.get("guardian_name") as string) || null,
      guardian_phone: (form.get("guardian_phone") as string) || null,
      guardian_email: (form.get("guardian_email") as string) || null,
    });

    if (error) {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Deelnemer toegevoegd" });
      setAddOpen(false);
      refetch();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-foreground">Deelnemers</h1>
          <p className="text-sm text-muted-foreground">
            {filteredClients.length !== clients.length ? `${filteredClients.length} van ${clients.length}` : clients.length} deelnemers (status: actief, afgerond of gestopt)
          </p>
        </div>
        <div className="flex gap-2">
          {(["csv", "xlsx"] as const).map((fmt) => (
            <Button key={fmt} variant="outline" size="sm" onClick={() => {
              const rows = filteredClients.map((c: any) => ({
                voornaam: c.first_name,
                achternaam: c.last_name,
                leeftijd: calculateAge(c.date_of_birth) ?? "",
                school: c.schools?.name ?? "",
                ouder: c.guardian_name ?? "",
                telefoon: c.guardian_phone ?? "",
                email: c.guardian_email ?? "",
                status: statusLabels[c.intake_status ?? "nieuw"] ?? c.intake_status ?? "",
              }));
              downloadExport(`deelnemers.${fmt}`, [
                { key: "voornaam", label: "Voornaam" },
                { key: "achternaam", label: "Achternaam" },
                { key: "leeftijd", label: "Leeftijd" },
                { key: "school", label: "School" },
                { key: "ouder", label: "Ouder/Verzorger" },
                { key: "telefoon", label: "Telefoon" },
                { key: "email", label: "E-mail" },
                { key: "status", label: "Status" },
              ], rows, fmt);
            }}>
              <Download className="h-4 w-4" /> {fmt.toUpperCase()}
            </Button>
          ))}
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" /> Importeren
          </Button>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4" /> Deelnemer Toevoegen</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nieuwe Deelnemer</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddClient} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Voornaam *</Label><Input name="first_name" required value={addFirstName} onChange={(e) => setAddFirstName(e.target.value)} /></div>
                  <div><Label>Achternaam *</Label><Input name="last_name" required value={addLastName} onChange={(e) => setAddLastName(e.target.value)} /></div>
                </div>
                <DuplicateWarning firstName={addFirstName} lastName={addLastName} onNavigate={(id) => { setAddOpen(false); navigate(`/clienten/${id}`); }} />
                <div><Label>Geboortedatum</Label><Input name="date_of_birth" type="date" /></div>
                <div><Label>Naam ouder/verzorger</Label><Input name="guardian_name" /></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><Label>Telefoon ouder</Label><Input name="guardian_phone" type="tel" /></div>
                  <div><Label>E-mail ouder</Label><Input name="guardian_email" type="email" /></div>
                </div>
                <Button type="submit" className="w-full">Opslaan</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <ClientFilters
        search={search} onSearchChange={setSearch}
        filterArea={filterArea} onFilterAreaChange={setFilterArea}
        filterSchool={filterSchool} onFilterSchoolChange={setFilterSchool}
        filterAge={filterAge} onFilterAgeChange={setFilterAge}
        filterStatus={filterStatus} onFilterStatusChange={setFilterStatus}
        areas={areas} schools={schools}
        availableStatuses={["actief", "training_afgerond", "tussentijds_gestopt"]}
        totalCount={clients.length} filteredCount={filteredClients.length}
      />

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <ClientListTable
          clients={filteredClients}
          onNavigate={(id) => navigate(`/clienten/${id}`)}
          emptyMessage="Geen deelnemers gevonden"
        />
      )}

      <ClientImport open={importOpen} onOpenChange={setImportOpen} onComplete={() => refetch()} />
    </div>
  );
}
