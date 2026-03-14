import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { MapPin, Plus, Search, Pencil, Trash2, Loader2 } from "lucide-react";
import { getAreaFromAddress, getAreaFromPostcode, extractPostcode, DEFAULT_CITY } from "@/lib/DomainResolver";
import { areaKeys, locationKeys } from "@/lib/queryKeys";

export default function TrainingslocatiesPage() {
  const [search, setSearch] = useState("");
  const [filterAreaId, setFilterAreaId] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState<Record<string, unknown> | null>(null);
  const [selectedArea, setSelectedArea] = useState<string>("");
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string>("");
  const [form, setForm] = useState<{ name: string; address: string; postal_code: string; city: string; notes: string; active: boolean }>({ name: "", address: "", postal_code: "", city: "", notes: "", active: true });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: areas = [] } = useQuery({
    queryKey: areaKeys.withNeighborhoods,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("areas")
        .select("id, name, neighborhoods(id, name)")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: locations = [], isLoading } = useQuery({
    queryKey: locationKeys.list(search),
    queryFn: async () => {
      let query = supabase
        .from("training_locations")
        .select("*, neighborhoods(name, area_id, areas(name)), areas:area_id(name)")
        .order("name");
      if (search.trim()) {
        query = query.or(`name.ilike.%${search}%,address.ilike.%${search}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const filteredNeighborhoods = selectedArea
    ? (areas.find((a) => a.id === selectedArea) as { neighborhoods?: { id: string; name: string }[] } | undefined)?.neighborhoods ?? []
    : [];

  const filteredLocations = locations.filter((loc) => {
    if (filterAreaId === "all") return true;
    const locAreaId = loc.area_id ?? loc.neighborhoods?.area_id;
    return locAreaId === filterAreaId;
  });

  const autoDetectGeo = (postalCode: string) => {
    const pc = extractPostcode(postalCode + " AA");
    if (!pc) return;
    const areaName = getAreaFromPostcode(pc);
    if (!areaName) return;
    const area = areas.find((a) => a.name === areaName);
    if (area) {
      setSelectedArea(area.id);
      if ((area as { neighborhoods?: { id: string }[] }).neighborhoods?.length ?? 0 > 0) {
        setSelectedNeighborhood(((area as { neighborhoods?: { id: string }[] }).neighborhoods ?? [])[0]?.id ?? "");
      } else {
        setSelectedNeighborhood("");
      }
    }
  };

  const resetForm = () => {
    setForm({ name: "", address: "", postal_code: "", city: "", notes: "", active: true });
    setSelectedArea("");
    setSelectedNeighborhood("");
  };

  const handleAdd = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = fd.get("name") as string;
    if (!name.trim()) return;

    setSaving(true);
    const { error } = await supabase.from("training_locations").insert({
      name,
      address: (fd.get("address") as string) || null,
      postal_code: (fd.get("postal_code") as string) || null,
      city: (fd.get("city") as string) || null,
      neighborhood_id: selectedNeighborhood || null,
      area_id: selectedArea || null,
      notes: (fd.get("notes") as string) || null,
      active: true,
    });
    setSaving(false);

    if (error) {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Trainingslocatie toegevoegd" });
      setAddOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: locationKeys.all });
    }
  };

  const openEdit = (loc: typeof locations[number]) => {
    const neighborhoodId = loc.neighborhood_id ?? "";
    let areaId = loc.area_id ?? "";
    if (!areaId && neighborhoodId) {
      const area = areas.find((a) => ((a as { neighborhoods?: { id: string }[] }).neighborhoods ?? []).some((n) => n.id === neighborhoodId));
      if (area) areaId = area.id;
    }
    setSelectedArea(areaId);
    setSelectedNeighborhood(neighborhoodId);
    setForm({
      name: loc.name ?? "",
      address: loc.address ?? "",
      postal_code: loc.postal_code ?? "",
      city: loc.city ?? "",
      notes: loc.notes ?? "",
      active: loc.active ?? true,
    });
    setSelectedLocation(loc);
    setEditOpen(true);
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLocation) return;
    setSaving(true);

    const { error } = await supabase.from("training_locations").update({
      name: form.name,
      address: form.address || null,
      postal_code: form.postal_code || null,
      city: form.city || null,
      neighborhood_id: selectedNeighborhood || null,
      area_id: selectedArea || null,
      notes: form.notes || null,
      active: form.active,
    }).eq("id", selectedLocation.id);

    setSaving(false);
    if (error) {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Trainingslocatie bijgewerkt" });
      setEditOpen(false);
      setSelectedLocation(null);
      queryClient.invalidateQueries({ queryKey: locationKeys.all });
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("training_locations").delete().eq("id", id);
    if (error) {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Trainingslocatie verwijderd" });
      queryClient.invalidateQueries({ queryKey: locationKeys.all });
    }
  };

  const LocationForm = ({ onSubmit, isEdit }: { onSubmit: (e: React.FormEvent<HTMLFormElement>) => void; isEdit: boolean }) => (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <Label>Naam *</Label>
        <Input
          name="name"
          required
          value={isEdit ? form.name : undefined}
          onChange={isEdit ? (e) => setForm({ ...form, name: e.target.value }) : undefined}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Adres</Label>
          <Input
            name="address"
            value={isEdit ? form.address : undefined}
            onChange={isEdit ? (e) => setForm({ ...form, address: e.target.value }) : undefined}
          />
        </div>
        <div>
          <Label>Postcode</Label>
          <Input
            name="postal_code"
            placeholder="bijv. 3011 AB"
            value={isEdit ? form.postal_code : undefined}
            onChange={(e) => {
              if (isEdit) setForm({ ...form, postal_code: e.target.value });
              autoDetectGeo(e.target.value);
            }}
          />
        </div>
      </div>
      <div>
        <Label>Plaats</Label>
        <Input
          name="city"
          defaultValue={isEdit ? form.city : DEFAULT_CITY}
          onChange={isEdit ? (e) => setForm({ ...form, city: e.target.value }) : undefined}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Gebied</Label>
          <Select value={selectedArea} onValueChange={(v) => { setSelectedArea(v); setSelectedNeighborhood(""); }}>
            <SelectTrigger><SelectValue placeholder="Selecteer gebied" /></SelectTrigger>
            <SelectContent className="bg-popover">
              {areas.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Wijk</Label>
          <Select value={selectedNeighborhood} onValueChange={setSelectedNeighborhood} disabled={!selectedArea}>
            <SelectTrigger><SelectValue placeholder="Selecteer wijk" /></SelectTrigger>
            <SelectContent className="bg-popover">
              {filteredNeighborhoods.map((n) => (
                <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <Label>Notitie</Label>
        <Textarea
          name="notes"
          value={isEdit ? form.notes : undefined}
          onChange={isEdit ? (e) => setForm({ ...form, notes: e.target.value }) : undefined}
        />
      </div>
      {isEdit && (
        <div className="flex items-center gap-2">
          <Switch
            checked={form.active}
            onCheckedChange={(v) => setForm({ ...form, active: v })}
          />
          <Label>Actief</Label>
        </div>
      )}
      <Button type="submit" className="w-full" disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
        {isEdit ? "Opslaan" : "Toevoegen"}
      </Button>
    </form>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-foreground">Trainingslocaties</h1>
          <p className="text-sm text-muted-foreground">Beheer trainingslocaties (naast scholen)</p>
        </div>
        <Dialog open={addOpen} onOpenChange={(v) => { setAddOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4" /> Locatie Toevoegen</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nieuwe Trainingslocatie</DialogTitle>
            </DialogHeader>
            <LocationForm onSubmit={handleAdd} isEdit={false} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Zoek op naam of adres..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterAreaId} onValueChange={setFilterAreaId}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Alle gebieden" />
          </SelectTrigger>
          <SelectContent className="bg-popover">
            <SelectItem value="all">Alle gebieden</SelectItem>
            {areas.map((a: any) => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filteredLocations.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card py-16">
          <MapPin className="h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">Geen trainingslocaties gevonden</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Naam</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Adres</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Gebied</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Wijk</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Acties</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredLocations.map((loc: any) => {
                const areaName = loc.areas?.name ?? loc.neighborhoods?.areas?.name ?? "—";
                const neighborhoodName = loc.neighborhoods?.name ?? "—";
                return (
                  <tr key={loc.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium text-foreground">{loc.name}</span>
                      </div>
                      {loc.notes && <p className="text-xs text-muted-foreground mt-0.5 ml-6">{loc.notes}</p>}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {[loc.address, loc.postal_code, loc.city].filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-foreground">{areaName}</td>
                    <td className="px-4 py-3 text-sm text-foreground">{neighborhoodName}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={loc.active ? "border-success-border text-success-foreground" : "border-border text-muted-foreground"}>
                        {loc.active ? "Actief" : "Inactief"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(loc)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(loc.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={(v) => { setEditOpen(v); if (!v) { setSelectedLocation(null); resetForm(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trainingslocatie bewerken</DialogTitle>
          </DialogHeader>
          <LocationForm onSubmit={handleEdit} isEdit={true} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
