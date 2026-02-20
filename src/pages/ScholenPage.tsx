import { School, Search, Plus, MapPin, Phone, Loader2, Upload, Users, Trash2 } from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";

export default function ScholenPage() {
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch areas with neighborhoods
  const { data: areas = [] } = useQuery({
    queryKey: ["areas-with-neighborhoods"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("areas")
        .select("id, name, neighborhoods(id, name)")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: schools = [], isLoading, refetch } = useQuery({
    queryKey: ["schools", search],
    queryFn: async () => {
      let query = supabase
        .from("schools")
        .select("*, neighborhoods(name, areas(name)), referrers(id, name, function_title, email, phone)")
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
      neighborhood_id: selectedNeighborhood || null,
    });

    if (error) {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "School toegevoegd" });
      setAddOpen(false);
      setSelectedNeighborhood("");
      refetch();
    }
  };

  // Excel / file upload
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(ws);

      if (rows.length === 0) throw new Error("Bestand is leeg");

      // Map common column names
      const mapped = rows.map((r) => ({
        name: r["naam"] || r["Naam"] || r["name"] || r["School"] || r["school"] || "",
        address: r["adres"] || r["Adres"] || r["address"] || r["Address"] || null,
        contact_email: r["email"] || r["Email"] || r["E-mail"] || r["e-mail"] || null,
        contact_phone: r["telefoon"] || r["Telefoon"] || r["phone"] || r["Phone"] || null,
        student_count: Number(r["leerlingen"] || r["Leerlingen"] || r["student_count"] || r["Aantal leerlingen"] || 0) || 0,
      })).filter((s) => s.name);

      if (mapped.length === 0) throw new Error("Geen geldige scholen gevonden. Zorg dat er een kolom 'naam' of 'Naam' is.");

      // Batch insert in chunks of 50
      for (let i = 0; i < mapped.length; i += 50) {
        const chunk = mapped.slice(i, i + 50);
        const { error } = await supabase.from("schools").insert(chunk);
        if (error) throw error;
      }

      return mapped.length;
    },
    onSuccess: (count) => {
      toast({ title: `${count} scholen geïmporteerd` });
      setUploadOpen(false);
      queryClient.invalidateQueries({ queryKey: ["schools"] });
    },
    onError: (err: any) => {
      toast({ title: "Import mislukt", description: err.message, variant: "destructive" });
    },
  });

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
  };

  // Flatten areas → neighborhoods for select
  const neighborhoodOptions = areas.flatMap((area: any) =>
    (area.neighborhoods ?? []).map((n: any) => ({
      id: n.id,
      label: `${area.name} – ${n.name}`,
    }))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-foreground">Scholen</h1>
          <p className="text-sm text-muted-foreground">{schools.length} partnerscholen geregistreerd</p>
        </div>
        <div className="flex gap-2">
          {/* Upload dialog */}
          <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><Upload className="h-4 w-4" /> Importeren</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Scholen Importeren</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Upload een Excel (.xlsx) of oudere Excel (.xls) bestand. Zorg dat er minimaal een kolom <strong>Naam</strong> is.
                  Optionele kolommen: Adres, Email, Telefoon, Leerlingen.
                </p>
                <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-border p-8">
                  <label className="flex cursor-pointer flex-col items-center gap-2 text-center">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">
                      {uploadMutation.isPending ? "Bezig met importeren..." : "Klik om bestand te kiezen"}
                    </span>
                    <span className="text-xs text-muted-foreground">.xlsx of .xls</span>
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      className="hidden"
                      onChange={handleFileUpload}
                      disabled={uploadMutation.isPending}
                    />
                  </label>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Add school dialog */}
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
                <div>
                  <Label>Gebied / Wijk</Label>
                  <Select value={selectedNeighborhood} onValueChange={setSelectedNeighborhood}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecteer een wijk..." />
                    </SelectTrigger>
                    <SelectContent>
                      {neighborhoodOptions.map((n: any) => (
                        <SelectItem key={n.id} value={n.id}>{n.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
                <th className="hidden px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:table-cell">Contactpersonen</th>
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
                    {school.referrers && school.referrers.length > 0 ? (
                      <div className="space-y-1">
                        {school.referrers.map((ref: any) => (
                          <div key={ref.id} className="text-xs">
                            <span className="font-medium text-card-foreground">{ref.name}</span>
                            {ref.function_title && (
                              <span className="ml-1 text-muted-foreground">({ref.function_title})</span>
                            )}
                            {ref.email && (
                              <span className="ml-1 text-muted-foreground">· {ref.email}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
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
