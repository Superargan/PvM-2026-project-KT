import { School, Search, Plus, MapPin, Phone, Loader2 } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

export default function ScholenPage() {
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const { toast } = useToast();

  const { data: schools = [], isLoading, refetch } = useQuery({
    queryKey: ["schools", search],
    queryFn: async () => {
      let query = supabase
        .from("schools")
        .select("*, neighborhoods(name, areas(name))")
        .order("name");

      if (search.trim()) {
        query = query.or(`name.ilike.%${search}%,address.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const handleAddSchool = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const { error } = await supabase.from("schools").insert({
      name: form.get("name") as string,
      address: (form.get("address") as string) || null,
      contact_email: (form.get("contact_email") as string) || null,
      contact_phone: (form.get("contact_phone") as string) || null,
      student_count: Number(form.get("student_count")) || 0,
    });

    if (error) {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "School toegevoegd" });
      setAddOpen(false);
      refetch();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-foreground">Scholen</h1>
          <p className="text-sm text-muted-foreground">{schools.length} partnerscholen geregistreerd</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4" /> School Toevoegen</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nieuwe School</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddSchool} className="space-y-4">
              <div><Label>Naam *</Label><Input name="name" required /></div>
              <div><Label>Adres</Label><Input name="address" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>E-mail</Label><Input name="contact_email" type="email" /></div>
                <div><Label>Telefoon</Label><Input name="contact_phone" type="tel" /></div>
              </div>
              <div><Label>Aantal leerlingen</Label><Input name="student_count" type="number" min="0" /></div>
              <Button type="submit" className="w-full">Opslaan</Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Zoek op naam of adres..."
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
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">School</th>
                <th className="hidden px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground md:table-cell">Gebied</th>
                <th className="hidden px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:table-cell">Contact</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Leerlingen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {schools.length === 0 && (
                <tr><td colSpan={4} className="px-5 py-8 text-center text-sm text-muted-foreground">Geen scholen gevonden</td></tr>
              )}
              {schools.map((school: any) => (
                <tr key={school.id} className="transition-colors hover:bg-muted/30">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/20">
                        <School className="h-4 w-4 text-accent" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-card-foreground">{school.name}</p>
                        {school.address && (
                          <p className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MapPin className="h-3 w-3" /> {school.address}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-5 py-4 md:table-cell">
                    {school.neighborhoods ? (
                      <span className="inline-flex items-center rounded-md bg-accent/10 px-2 py-1 text-xs font-medium text-accent">
                        {school.neighborhoods.areas?.name ?? ""} – {school.neighborhoods.name}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="hidden px-5 py-4 lg:table-cell">
                    <p className="text-sm text-card-foreground">{school.contact_email ?? "—"}</p>
                    {school.contact_phone && (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" /> {school.contact_phone}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <span className="font-display text-sm font-bold text-card-foreground">{school.student_count ?? 0}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
