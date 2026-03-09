import { Users, Search, Filter, Eye, Plus, Loader2, Download, Upload } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
  const [addOpen, setAddOpen] = useState(false);
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
      toast({ title: "Cliënt toegevoegd" });
      setAddOpen(false);
      refetch();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-foreground">Cliënten</h1>
          <p className="text-sm text-muted-foreground">{clients.length} cliënten in het systeem</p>
        </div>
        <div className="flex gap-2">
          {(["csv", "xlsx"] as const).map((fmt) => (
            <Button key={fmt} variant="outline" size="sm" onClick={() => {
              const rows = clients.map((c: any) => ({
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
              downloadExport(`clienten.${fmt}`, [
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
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4" /> Cliënt Toevoegen</Button>
            </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nieuwe Cliënt</DialogTitle>
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

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Zoek op naam..."
          className="w-full rounded-lg border border-input bg-card py-2.5 pl-10 pr-4 text-sm text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
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
              {clients.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-muted-foreground">Geen cliënten gevonden</td></tr>
              )}
              {clients.map((client: any) => {
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
    </div>
  );
}
