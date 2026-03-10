import { Users, Search, Filter, Eye, Plus, Loader2, Download, Upload, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { downloadExport, ExportColumn } from "@/lib/csvExport";
import ClientImport from "@/components/ClientImport";

function calculateAge(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
  return age;
}

const statusStyles: Record<string, string> = {
  nieuw: "status-rood",
  intake_gepland: "status-oranje",
  intake: "status-oranje",
  actief: "status-groen",
  wachtlijst: "status-oranje",
  niet_deelnemen: "status-rood",
  afgerond: "status-groen",
};

const statusLabels: Record<string, string> = {
  nieuw: "Nieuw",
  intake_gepland: "Intake gepland",
  intake: "Intake",
  actief: "Actief",
  wachtlijst: "Wachtlijst",
  niet_deelnemen: "Niet deelnemen",
  afgerond: "Afgerond",
};

export default function ClientenPage() {
  const [search, setSearch] = useState("");
  const [filterArea, setFilterArea] = useState<string>("all");
  const [filterSchool, setFilterSchool] = useState<string>("all");
  const [filterAge, setFilterAge] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const { data: clients = [], isLoading, refetch } = useQuery({
    queryKey: ["clients", search],
    queryFn: async () => {
      let query = supabase
        .from("clients")
        .select("*, schools(name)")
        .eq("archived", false)
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
    queryKey: ["areas-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("areas").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const hasFilters = filterArea !== "all" || filterSchool !== "all" || filterAge !== "all";

  const filteredClients = clients.filter((c: any) => {
    if (filterArea !== "all" && c.waitlist_area_id !== filterArea) return false;
    if (filterSchool !== "all") {
      if (filterSchool === "none") { if (c.school_id) return false; }
      else if (c.school_id !== filterSchool) return false;
    }
    if (filterAge !== "all") {
      const age = calculateAge(c.date_of_birth);
      if (filterAge === "5-7" && (age === null || age < 5 || age > 7)) return false;
      if (filterAge === "8-12" && (age === null || age < 8 || age > 12)) return false;
      if (filterAge === "other" && age !== null && age >= 5 && age <= 12) return false;
    }
    return true;
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
            {hasFilters ? `${filteredClients.length} van ${clients.length}` : clients.length} deelnemers
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
                avg: c.consent_data_processing ?? false,
                whatsapp: c.whatsapp_consent ?? false,
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
                { key: "avg", label: "AVG-toestemming" },
                { key: "whatsapp", label: "WhatsApp-toestemming" },
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
                <div><Label>Voornaam *</Label><Input name="first_name" required /></div>
                <div><Label>Achternaam *</Label><Input name="last_name" required /></div>
              </div>
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

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Zoek op naam..."
            className="w-full rounded-lg border border-input bg-card py-2.5 pl-10 pr-4 text-sm text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <Select value={filterArea} onValueChange={setFilterArea}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Gebied" />
          </SelectTrigger>
          <SelectContent className="bg-popover">
            <SelectItem value="all">Alle gebieden</SelectItem>
            {areas.map((a: any) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterSchool} onValueChange={setFilterSchool}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="School" />
          </SelectTrigger>
          <SelectContent className="bg-popover">
            <SelectItem value="all">Alle scholen</SelectItem>
            <SelectItem value="none">Geen school</SelectItem>
            {schools.map((s: any) => (
              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterAge} onValueChange={setFilterAge}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Leeftijd" />
          </SelectTrigger>
          <SelectContent className="bg-popover">
            <SelectItem value="all">Alle leeftijden</SelectItem>
            <SelectItem value="5-7">5-7 jaar</SelectItem>
            <SelectItem value="8-12">8-12 jaar</SelectItem>
            <SelectItem value="other">Overig</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterArea("all"); setFilterSchool("all"); setFilterAge("all"); }}>
            <X className="h-3.5 w-3.5 mr-1" /> Wis filters
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Naam</th>
                <th className="hidden px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:table-cell">Leeftijd</th>
                <th className="hidden px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground md:table-cell">School</th>
                <th className="hidden px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:table-cell">Ouder/Verzorger</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredClients.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-muted-foreground">Geen deelnemers gevonden</td></tr>
              )}
              {filteredClients.map((client: any) => {
                const age = calculateAge(client.date_of_birth);
                const status = client.intake_status ?? "nieuw";
                return (
                   <tr key={client.id} className="transition-colors hover:bg-muted/30 cursor-pointer" onClick={() => navigate(`/clienten/${client.id}`)}>
                     <td className="px-5 py-4">
                       <p className="text-sm font-semibold text-primary hover:underline">{client.first_name} {client.last_name}</p>
                       <p className="text-xs text-muted-foreground sm:hidden">{age !== null ? `${age} jaar` : "—"}</p>
                     </td>
                    <td className="hidden px-5 py-4 sm:table-cell">
                      <span className="text-sm text-card-foreground">{age !== null ? `${age} jaar` : "—"}</span>
                    </td>
                    <td className="hidden px-5 py-4 md:table-cell">
                      <span className="text-sm text-card-foreground">{client.schools?.name ?? "—"}</span>
                    </td>
                    <td className="hidden px-5 py-4 lg:table-cell">
                      <span className="text-sm text-card-foreground">{client.guardian_name ?? "—"}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`status-indicator ${statusStyles[status] ?? "status-rood"}`}>
                        {statusLabels[status] ?? status}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ClientImport open={importOpen} onOpenChange={setImportOpen} onComplete={() => refetch()} />
    </div>
  );
}
