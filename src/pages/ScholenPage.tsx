import { School, Search, Plus, MapPin, Loader2, Upload, Users, Trash2, Pencil, UserPlus, Wand2 } from "lucide-react";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import * as XLSX from "xlsx";
import { getAreaFromAddress } from "@/lib/postcodeMapping";

// ── CSV / Outlook helpers ──────────────────────────────────────────────

/** Parse a CSV string respecting quoted fields. Auto-detects ; or , delimiter. */
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  // Detect delimiter from header
  const header = lines[0];
  const delimiter = header.split(";").length >= header.split(",").length ? ";" : ",";

  const splitRow = (row: string): string[] => {
    const result: string[] = [];
    let cur = "";
    let inQuote = false;
    for (const ch of row) {
      if (ch === '"') {
        inQuote = !inQuote;
      } else if (ch === delimiter && !inQuote) {
        result.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const headers = splitRow(lines[0]);
  return lines.slice(1).map((line) => {
    const vals = splitRow(line);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = vals[i] ?? "";
    });
    return obj;
  });
}

/** Read uploaded file as parsed rows (Excel or CSV). */
async function readFileAsRows(file: File): Promise<Record<string, any>[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "csv") {
    // Try UTF-8 first, fall back to Windows-1252
    let text: string;
    try {
      text = await file.text();
      // If garbled, try Windows-1252
      if (/\ufffd/.test(text)) throw new Error("garbled");
    } catch {
      const buf = await file.arrayBuffer();
      const decoder = new TextDecoder("windows-1252");
      text = decoder.decode(buf);
    }
    return parseCsv(text);
  }
  // Excel
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws);
}

/** Outlook column name mapping → our field keys */
const OUTLOOK_COL_MAP: Record<string, string> = {
  // Name
  "first name": "firstName",
  "voornaam": "firstName",
  "last name": "lastName",
  "achternaam": "lastName",
  "display name": "displayName",
  "weergavenaam": "displayName",
  "naam": "displayName",
  "name": "displayName",
  // Email
  "e-mail address": "email",
  "e-mailadres": "email",
  "email": "email",
  "e-mail": "email",
  "email address": "email",
  // Phone
  "business phone": "phone",
  "home phone": "phone",
  "mobile phone": "phone",
  "primary phone": "phone",
  "telefoon op werk": "phone",
  "mobiele telefoon": "phone",
  "telefoon": "phone",
  "phone": "phone",
  // Function
  "job title": "functionTitle",
  "functie": "functionTitle",
  "function_title": "functionTitle",
  // Company / School
  "company": "company",
  "bedrijf": "company",
  "school": "company",
};

function mapOutlookRow(row: Record<string, any>) {
  const mapped: Record<string, string> = {};
  for (const [col, val] of Object.entries(row)) {
    const key = OUTLOOK_COL_MAP[col.toLowerCase().trim()];
    if (key && val && !mapped[key]) {
      mapped[key] = String(val).trim();
    }
  }
  // Combine firstName + lastName if no displayName
  if (!mapped.displayName && (mapped.firstName || mapped.lastName)) {
    mapped.displayName = [mapped.firstName, mapped.lastName].filter(Boolean).join(" ");
  }
  return mapped;
}

// ── Component ──────────────────────────────────────────────────────────

export default function ScholenPage() {
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [contactUploadOpen, setContactUploadOpen] = useState(false);
  const [contactDialogOpen, setContactDialogOpen] = useState(false);
  const [selectedSchool, setSelectedSchool] = useState<any>(null);
  const [editingReferrer, setEditingReferrer] = useState<any>(null);
  const [selectedArea, setSelectedArea] = useState<string>("");
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

  // Auto-detect neighborhood from address postcode
  const autoDetectNeighborhood = (address: string) => {
    const areaName = getAreaFromAddress(address);
    if (!areaName) return;
    const area = areas.find((a: any) => a.name === areaName);
    if (area) {
      setSelectedArea(area.id);
      if (area.neighborhoods?.length > 0) {
        setSelectedNeighborhood(area.neighborhoods[0].id);
      } else {
        setSelectedNeighborhood("");
      }
    }
  };

  // Neighborhoods filtered by selected area
  const filteredNeighborhoods = selectedArea
    ? (areas.find((a: any) => a.id === selectedArea) as any)?.neighborhoods ?? []
    : [];

  const handleAddSchool = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const address = (form.get("address") as string) || "";

    // Auto-detect neighborhood if not manually selected
    let neighborhoodId = selectedNeighborhood || null;
    if (!neighborhoodId && address) {
      const areaName = getAreaFromAddress(address);
      if (areaName) {
        const area = areas.find((a: any) => a.name === areaName);
        if (area && area.neighborhoods?.length > 0) {
          neighborhoodId = area.neighborhoods[0].id;
        }
      }
    }

    const { error } = await supabase.from("schools").insert({
      name: form.get("name") as string,
      address: address || null,
      contact_email: (form.get("contact_email") as string) || null,
      contact_phone: (form.get("contact_phone") as string) || null,
      student_count: Number(form.get("student_count")) || 0,
      neighborhood_id: neighborhoodId,
    });

    if (error) {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "School toegevoegd" });
      setSelectedArea("");
      setSelectedNeighborhood("");
      refetch();
    }
  };

  // ── Bulk-assign schools to neighborhoods based on postcode ──
  const bulkAssignMutation = useMutation({
    mutationFn: async () => {
      let assigned = 0;
      for (const school of schools as any[]) {
        if (!school.address) continue;
        const areaName = getAreaFromAddress(school.address);
        if (!areaName) continue;
        const area = areas.find((a: any) => a.name === areaName);
        if (!area || !area.neighborhoods?.length) continue;
        const neighborhoodId = area.neighborhoods[0].id;
        const { error } = await supabase
          .from("schools")
          .update({ neighborhood_id: neighborhoodId })
          .eq("id", school.id);
        if (!error) assigned++;
      }
      return assigned;
    },
    onSuccess: (count) => {
      toast({ title: `${count} scholen gekoppeld aan een gebied` });
      queryClient.invalidateQueries({ queryKey: ["schools"] });
    },
    onError: (err: any) => {
      toast({ title: "Fout bij koppelen", description: err.message, variant: "destructive" });
    },
  });

  // ── School file upload (Excel + CSV) ──

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const rows = await readFileAsRows(file);
      if (rows.length === 0) throw new Error("Bestand is leeg");

      const mapped = rows.map((r) => ({
        name: r["naam"] || r["Naam"] || r["name"] || r["School"] || r["school"] || "",
        address: r["adres"] || r["Adres"] || r["address"] || r["Address"] || null,
        contact_email: r["email"] || r["Email"] || r["E-mail"] || r["e-mail"] || null,
        contact_phone: r["telefoon"] || r["Telefoon"] || r["phone"] || r["Phone"] || null,
        student_count: Number(r["leerlingen"] || r["Leerlingen"] || r["student_count"] || r["Aantal leerlingen"] || 0) || 0,
      })).filter((s) => s.name);

      if (mapped.length === 0) throw new Error("Geen geldige scholen gevonden. Zorg dat er een kolom 'Naam' is.");

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

  const handleSchoolFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
  };

  // ── Contact person file upload (Excel + CSV + Outlook) ──

  const contactUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const rows = await readFileAsRows(file);
      if (rows.length === 0) throw new Error("Bestand is leeg");

      // Build school lookup (case-insensitive)
      const schoolLookup = new Map<string, string>();
      schools.forEach((s: any) => {
        schoolLookup.set(s.name.toLowerCase(), s.id);
      });

      const toInsert: any[] = [];
      const unmatched: string[] = [];

      for (const row of rows) {
        const m = mapOutlookRow(row);
        const name = m.displayName;
        if (!name) continue;

        let schoolId: string | null = null;
        if (m.company) {
          schoolId = schoolLookup.get(m.company.toLowerCase()) ?? null;
          if (!schoolId) {
            unmatched.push(`${name} (${m.company})`);
          }
        }

        toInsert.push({
          name,
          email: m.email || null,
          phone: m.phone || null,
          function_title: m.functionTitle || null,
          school_id: schoolId,
        });
      }

      if (toInsert.length === 0) throw new Error("Geen geldige contactpersonen gevonden.");

      for (let i = 0; i < toInsert.length; i += 50) {
        const chunk = toInsert.slice(i, i + 50);
        const { error } = await supabase.from("referrers").insert(chunk);
        if (error) throw error;
      }

      return { imported: toInsert.length, unmatched };
    },
    onSuccess: ({ imported, unmatched }) => {
      const desc = unmatched.length > 0
        ? `${unmatched.length} contactpersonen konden niet aan een school worden gekoppeld.`
        : undefined;
      toast({ title: `${imported} contactpersonen geïmporteerd`, description: desc });
      setContactUploadOpen(false);
      queryClient.invalidateQueries({ queryKey: ["schools"] });
    },
    onError: (err: any) => {
      toast({ title: "Import mislukt", description: err.message, variant: "destructive" });
    },
  });

  const handleContactFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) contactUploadMutation.mutate(file);
  };

  // ── Contact person CRUD ──

  const handleAddReferrer = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const payload = {
      name: form.get("ref_name") as string,
      function_title: (form.get("ref_function") as string) || null,
      email: (form.get("ref_email") as string) || null,
      phone: (form.get("ref_phone") as string) || null,
      school_id: selectedSchool?.id,
    };

    const { error } = editingReferrer
      ? await supabase.from("referrers").update(payload).eq("id", editingReferrer.id)
      : await supabase.from("referrers").insert(payload);

    if (error) {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editingReferrer ? "Contactpersoon bijgewerkt" : "Contactpersoon toegevoegd" });
      setEditingReferrer(null);
      refetch();
    }
  };

  const handleDeleteReferrer = async (id: string) => {
    const { error } = await supabase.from("referrers").delete().eq("id", id);
    if (error) {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Contactpersoon verwijderd" });
      refetch();
    }
  };

  // Flatten areas → neighborhoods for select
  const neighborhoodOptions = areas.flatMap((area: any) =>
    (area.neighborhoods ?? []).map((n: any) => ({
      id: n.id,
      label: `${area.name} – ${n.name}`,
    }))
  );

  // Get current referrers for selected school
  const selectedSchoolReferrers = selectedSchool
    ? (schools.find((s: any) => s.id === selectedSchool.id) as any)?.referrers ?? []
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-foreground">Scholen</h1>
          <p className="text-sm text-muted-foreground">{schools.length} partnerscholen geregistreerd</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* Bulk assign areas */}
          <Button
            variant="outline"
            onClick={() => bulkAssignMutation.mutate()}
            disabled={bulkAssignMutation.isPending}
          >
            <Wand2 className="h-4 w-4" />
            {bulkAssignMutation.isPending ? "Bezig..." : "Gebieden Toewijzen"}
          </Button>
          {/* Contact upload dialog */}
          <Dialog open={contactUploadOpen} onOpenChange={setContactUploadOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><Users className="h-4 w-4" /> Contactpersonen Importeren</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Contactpersonen Importeren</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Upload een Excel (.xlsx/.xls) of CSV-bestand, bijvoorbeeld een Outlook-export.
                  Het systeem herkent automatisch kolomnamen zoals <strong>First Name</strong>, <strong>Last Name</strong>, <strong>E-mail Address</strong>, <strong>Company</strong>, etc.
                </p>
                <p className="text-sm text-muted-foreground">
                  Het <strong>Company/Bedrijf</strong>-veld wordt gebruikt om contactpersonen aan een bestaande school te koppelen.
                </p>
                <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-border p-8">
                  <label className="flex cursor-pointer flex-col items-center gap-2 text-center">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">
                      {contactUploadMutation.isPending ? "Bezig met importeren..." : "Klik om bestand te kiezen"}
                    </span>
                    <span className="text-xs text-muted-foreground">.xlsx, .xls of .csv</span>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={handleContactFileUpload}
                      disabled={contactUploadMutation.isPending}
                    />
                  </label>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* School upload dialog */}
          <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><Upload className="h-4 w-4" /> Scholen Importeren</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Scholen Importeren</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Upload een Excel (.xlsx/.xls) of CSV-bestand. Zorg dat er minimaal een kolom <strong>Naam</strong> is.
                  Optionele kolommen: Adres, Email, Telefoon, Leerlingen.
                </p>
                <div className="flex items-center justify-center rounded-lg border-2 border-dashed border-border p-8">
                  <label className="flex cursor-pointer flex-col items-center gap-2 text-center">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">
                      {uploadMutation.isPending ? "Bezig met importeren..." : "Klik om bestand te kiezen"}
                    </span>
                    <span className="text-xs text-muted-foreground">.xlsx, .xls of .csv</span>
                    <input
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={handleSchoolFileUpload}
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
                <div><Label>Adres</Label><Input name="address" onBlur={(e) => autoDetectNeighborhood(e.target.value)} /></div>
                <div>
                  <Label>Gebied</Label>
                  <Select value={selectedArea} onValueChange={(val) => { setSelectedArea(val); setSelectedNeighborhood(""); }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecteer een gebied..." />
                    </SelectTrigger>
                    <SelectContent>
                      {areas.map((a: any) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Wijk</Label>
                  <Select value={selectedNeighborhood} onValueChange={setSelectedNeighborhood} disabled={!selectedArea}>
                    <SelectTrigger>
                      <SelectValue placeholder={selectedArea ? "Selecteer een wijk..." : "Kies eerst een gebied"} />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredNeighborhoods.map((n: any) => (
                        <SelectItem key={n.id} value={n.id}>{n.name}</SelectItem>
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
                <th className="hidden px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground md:table-cell">Wijk</th>
                <th className="hidden px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:table-cell">Contactpersonen</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Leerlingen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {schools.length === 0 && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-muted-foreground">Geen scholen gevonden</td></tr>
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
                    {school.neighborhoods?.areas?.name ? (
                      <span className="inline-flex items-center rounded-md bg-accent/10 px-2 py-1 text-xs font-medium text-accent">
                        {school.neighborhoods.areas.name}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="hidden px-5 py-4 md:table-cell">
                    {school.neighborhoods?.name ? (
                      <span className="inline-flex items-center rounded-md bg-accent/10 px-2 py-1 text-xs font-medium text-accent">
                        {school.neighborhoods.name}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="hidden px-5 py-4 lg:table-cell">
                    <div className="flex items-center gap-2">
                      {school.referrers && school.referrers.length > 0 ? (
                        <div className="space-y-1 flex-1">
                          {school.referrers.slice(0, 2).map((ref: any) => (
                            <div key={ref.id} className="text-xs">
                              <span className="font-medium text-card-foreground">{ref.name}</span>
                              {ref.function_title && (
                                <span className="ml-1 text-muted-foreground">({ref.function_title})</span>
                              )}
                            </div>
                          ))}
                          {school.referrers.length > 2 && (
                            <span className="text-xs text-muted-foreground">+{school.referrers.length - 2} meer</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground flex-1">—</span>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        onClick={() => {
                          setSelectedSchool(school);
                          setEditingReferrer(null);
                          setContactDialogOpen(true);
                        }}
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
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

      {/* Contact person management dialog */}
      <Dialog open={contactDialogOpen} onOpenChange={(open) => {
        setContactDialogOpen(open);
        if (!open) { setEditingReferrer(null); setSelectedSchool(null); }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Contactpersonen – {selectedSchool?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Existing referrers */}
            {selectedSchoolReferrers.length > 0 ? (
              <div className="space-y-2">
                {selectedSchoolReferrers.map((ref: any) => (
                  <div key={ref.id} className="flex items-start justify-between gap-2 rounded-lg border border-border p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-card-foreground">{ref.name}</p>
                      {ref.function_title && <p className="text-xs text-muted-foreground">{ref.function_title}</p>}
                      {ref.email && <p className="text-xs text-muted-foreground">{ref.email}</p>}
                      {ref.phone && <p className="text-xs text-muted-foreground">{ref.phone}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingReferrer(ref)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteReferrer(ref.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Nog geen contactpersonen.</p>
            )}

            {/* Add / Edit form */}
            <form onSubmit={handleAddReferrer} className="space-y-3 rounded-lg border border-border p-4 bg-muted/30">
              <p className="text-sm font-medium text-card-foreground">
                {editingReferrer ? "Contactpersoon bewerken" : "Contactpersoon toevoegen"}
              </p>
              <div><Label>Naam *</Label><Input name="ref_name" required defaultValue={editingReferrer?.name ?? ""} key={editingReferrer?.id ?? "new"} /></div>
              <div><Label>Functie</Label><Input name="ref_function" defaultValue={editingReferrer?.function_title ?? ""} key={`fn-${editingReferrer?.id ?? "new"}`} placeholder="bijv. IB-er, Directeur" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>E-mail</Label><Input name="ref_email" type="email" defaultValue={editingReferrer?.email ?? ""} key={`em-${editingReferrer?.id ?? "new"}`} /></div>
                <div><Label>Telefoon</Label><Input name="ref_phone" type="tel" defaultValue={editingReferrer?.phone ?? ""} key={`ph-${editingReferrer?.id ?? "new"}`} /></div>
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm">{editingReferrer ? "Bijwerken" : "Toevoegen"}</Button>
                {editingReferrer && (
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditingReferrer(null)}>Annuleren</Button>
                )}
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
