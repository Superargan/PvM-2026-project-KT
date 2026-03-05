import { ClipboardList, Search, Pencil, Loader2, ExternalLink, Clock } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import WaitlistManager from "@/components/WaitlistManager";

const editSchema = z.object({
  first_name: z.string().trim().min(1, "Voornaam is verplicht").max(100),
  last_name: z.string().trim().min(1, "Achternaam is verplicht").max(100),
  date_of_birth: z.string().optional(),
  gender: z.string().optional(),
  school_id: z.string().optional(),
  class_group: z.string().max(50).optional(),
  guardian_name: z.string().max(200).optional(),
  guardian_phone: z.string().max(20).optional(),
  guardian_phone_alt: z.string().max(20).optional(),
  guardian_email: z.string().email("Ongeldig e-mailadres").max(255).optional().or(z.literal("")),
  postal_code: z.string().max(10).optional(),
  address: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  referral_reason: z.string().max(2000).optional(),
  goals: z.string().max(2000).optional(),
  intake_notes: z.string().max(5000).optional(),
  intake_status: z.string().optional(),
  intake_date: z.string().optional(),
  consent_data_processing: z.boolean().optional(),
  whatsapp_consent: z.boolean().optional(),
  notes: z.string().max(5000).optional(),
});

type EditForm = z.infer<typeof editSchema>;

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
  intake: "status-oranje",
  actief: "status-groen",
  wachtlijst: "status-oranje",
  afgerond: "status-groen",
};

const statusLabels: Record<string, string> = {
  nieuw: "Nieuw",
  intake: "Intake",
  actief: "Actief",
  wachtlijst: "Wachtlijst",
  afgerond: "Afgerond",
};

export default function AanmeldingenPage() {
  const [activeTab, setActiveTab] = useState("lijst");
  const [search, setSearch] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editClient, setEditClient] = useState<any>(null);
  const [form, setForm] = useState<Partial<EditForm>>({});
  const [errors, setErrors] = useState<Partial<Record<keyof EditForm, string>>>({});
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const { data: clients = [], isLoading, refetch } = useQuery({
    queryKey: ["aanmeldingen", search],
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

  const openEdit = (client: any) => {
    setEditClient(client);
    setForm({
      first_name: client.first_name ?? "",
      last_name: client.last_name ?? "",
      date_of_birth: client.date_of_birth ?? "",
      gender: client.gender ?? "",
      school_id: client.school_id ?? "",
      class_group: client.class_group ?? "",
      guardian_name: client.guardian_name ?? "",
      guardian_phone: client.guardian_phone ?? "",
      guardian_phone_alt: client.guardian_phone_alt ?? "",
      guardian_email: client.guardian_email ?? "",
      postal_code: client.postal_code ?? "",
      address: client.address ?? "",
      city: client.city ?? "",
      referral_reason: client.referral_reason ?? "",
      goals: client.goals ?? "",
      intake_notes: client.intake_notes ?? "",
      intake_status: client.intake_status ?? "nieuw",
      intake_date: client.intake_date ?? "",
      consent_data_processing: client.consent_data_processing ?? false,
      whatsapp_consent: client.whatsapp_consent ?? false,
      notes: client.notes ?? "",
    });
    setErrors({});
    setEditOpen(true);
  };

  const updateField = (field: keyof EditForm, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = editSchema.safeParse(form);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof EditForm, string>> = {};
      result.error.errors.forEach((err) => {
        const field = err.path[0] as keyof EditForm;
        if (!fieldErrors[field]) fieldErrors[field] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    setSaving(true);
    const updateData: any = { ...result.data };
    // Clean empty strings to null
    for (const key of Object.keys(updateData)) {
      if (updateData[key] === "") updateData[key] = null;
    }

    const { error } = await supabase.from("clients").update(updateData).eq("id", editClient.id);
    setSaving(false);

    if (error) {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Aanmelding bijgewerkt" });
      setEditOpen(false);
      refetch();
    }
  };

  // Handle putting client on waitlist
  const handleWaitlist = async (clientId: string, waitlistStatus: string, areaId?: string) => {
    const updateData: any = { waitlist_status: waitlistStatus || null };
    if (areaId) updateData.waitlist_area_id = areaId;
    if (!waitlistStatus) { updateData.waitlist_area_id = null; }

    const { error } = await supabase.from("clients").update(updateData).eq("id", clientId);
    if (error) {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    } else {
      toast({ title: waitlistStatus ? "Op wachtlijst geplaatst" : "Van wachtlijst verwijderd" });
      refetch();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-foreground">Aanmeldingen</h1>
          <p className="text-sm text-muted-foreground">{clients.length} aanmeldingen in het systeem</p>
        </div>
        <Button variant="outline" onClick={() => navigate("/aanmelden")}>
          <ExternalLink className="h-4 w-4" /> Aanmeldformulier openen
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="lijst">Aanmeldingen</TabsTrigger>
          <TabsTrigger value="wachtlijst" className="gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Wachtlijst
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lijst" className="space-y-4">
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
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actie</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {clients.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-muted-foreground">Geen aanmeldingen gevonden</td></tr>
              )}
              {clients.map((client: any) => {
                const age = calculateAge(client.date_of_birth);
                const status = client.intake_status ?? "nieuw";
                return (
                  <tr key={client.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-5 py-4">
                      <p className="text-sm font-semibold text-primary hover:underline cursor-pointer" onClick={() => navigate(`/clienten/${client.id}`)}>{client.first_name} {client.last_name}</p>
                      <p className="text-xs text-muted-foreground sm:hidden">{age !== null ? `${age} jaar` : "—"}</p>
                    </td>
                    <td className="hidden px-5 py-4 sm:table-cell">
                      <span className="text-sm text-card-foreground">{age !== null ? `${age} jaar` : "—"}</span>
                    </td>
                    <td className="hidden px-5 py-4 md:table-cell">
                      <span className="text-sm text-card-foreground">{client.schools?.name ?? <span className="text-destructive text-xs">Niet gekoppeld</span>}</span>
                    </td>
                    <td className="hidden px-5 py-4 lg:table-cell">
                      <span className="text-sm text-card-foreground">{client.guardian_name ?? "—"}</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`status-indicator ${statusStyles[status] ?? "status-rood"}`}>
                        {statusLabels[status] ?? status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(client)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
        </TabsContent>

        <TabsContent value="wachtlijst">
          <div className="rounded-xl border border-border bg-card p-6">
            <WaitlistManager />
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit dialog – full form */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Aanmelding bewerken</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-5">
            {/* Kind */}
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kindgegevens</p>
            <div className="grid grid-cols-2 gap-4">
              <FieldWrapper label="Voornaam *" error={errors.first_name}>
                <Input value={form.first_name ?? ""} onChange={(e) => updateField("first_name", e.target.value)} />
              </FieldWrapper>
              <FieldWrapper label="Achternaam *" error={errors.last_name}>
                <Input value={form.last_name ?? ""} onChange={(e) => updateField("last_name", e.target.value)} />
              </FieldWrapper>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <FieldWrapper label="Geboortedatum" error={errors.date_of_birth}>
                <Input type="date" value={form.date_of_birth ?? ""} onChange={(e) => updateField("date_of_birth", e.target.value)} max={new Date().toISOString().split("T")[0]} />
              </FieldWrapper>
              <FieldWrapper label="Geslacht" error={errors.gender}>
                <Select value={form.gender ?? ""} onValueChange={(v) => updateField("gender", v)}>
                  <SelectTrigger><SelectValue placeholder="Kies" /></SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="jongen">Jongen</SelectItem>
                    <SelectItem value="meisje">Meisje</SelectItem>
                    <SelectItem value="anders">Anders</SelectItem>
                  </SelectContent>
                </Select>
              </FieldWrapper>
              <FieldWrapper label="Klas/groep" error={errors.class_group}>
                <Input value={form.class_group ?? ""} onChange={(e) => updateField("class_group", e.target.value)} placeholder="bijv. groep 6" />
              </FieldWrapper>
            </div>

            {/* School */}
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-t border-border pt-4">School koppelen</p>
            <FieldWrapper label="School" error={errors.school_id}>
              <Select value={form.school_id ?? ""} onValueChange={(v) => updateField("school_id", v)}>
                <SelectTrigger><SelectValue placeholder="Selecteer school" /></SelectTrigger>
                <SelectContent className="bg-popover">
                  {schools.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldWrapper>

            {/* Ouder/Verzorger */}
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-t border-border pt-4">Ouder/Verzorger</p>
            <FieldWrapper label="Naam" error={errors.guardian_name}>
              <Input value={form.guardian_name ?? ""} onChange={(e) => updateField("guardian_name", e.target.value)} />
            </FieldWrapper>
            <div className="grid grid-cols-2 gap-4">
              <FieldWrapper label="Telefoon" error={errors.guardian_phone}>
                <Input type="tel" value={form.guardian_phone ?? ""} onChange={(e) => updateField("guardian_phone", e.target.value)} />
              </FieldWrapper>
              <FieldWrapper label="Telefoon (alt)" error={errors.guardian_phone_alt}>
                <Input type="tel" value={form.guardian_phone_alt ?? ""} onChange={(e) => updateField("guardian_phone_alt", e.target.value)} />
              </FieldWrapper>
            </div>
            <FieldWrapper label="E-mail" error={errors.guardian_email}>
              <Input type="email" value={form.guardian_email ?? ""} onChange={(e) => updateField("guardian_email", e.target.value)} />
            </FieldWrapper>

            {/* Adres */}
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-t border-border pt-4">Adresgegevens</p>
            <div className="grid grid-cols-3 gap-4">
              <FieldWrapper label="Postcode" error={errors.postal_code}>
                <Input value={form.postal_code ?? ""} onChange={(e) => updateField("postal_code", e.target.value)} />
              </FieldWrapper>
              <FieldWrapper label="Adres" error={errors.address}>
                <Input value={form.address ?? ""} onChange={(e) => updateField("address", e.target.value)} />
              </FieldWrapper>
              <FieldWrapper label="Plaats" error={errors.city}>
                <Input value={form.city ?? ""} onChange={(e) => updateField("city", e.target.value)} />
              </FieldWrapper>
            </div>

            {/* Intake & Wachtlijst */}
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-t border-border pt-4">Intake & Status</p>
            <div className="grid grid-cols-2 gap-4">
              <FieldWrapper label="Status" error={errors.intake_status}>
                <Select value={form.intake_status ?? "nieuw"} onValueChange={(v) => updateField("intake_status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="nieuw">Nieuw</SelectItem>
                    <SelectItem value="intake">Intake</SelectItem>
                    <SelectItem value="actief">Actief</SelectItem>
                    <SelectItem value="wachtlijst">Wachtlijst</SelectItem>
                    <SelectItem value="afgerond">Afgerond</SelectItem>
                  </SelectContent>
                </Select>
              </FieldWrapper>
              <FieldWrapper label="Intakedatum" error={errors.intake_date}>
                <Input type="date" value={form.intake_date ?? ""} onChange={(e) => updateField("intake_date", e.target.value)} />
              </FieldWrapper>
            </div>

            {/* Wachtlijst velden */}
            {form.intake_status === "wachtlijst" && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-3">
                <p className="text-xs font-semibold text-amber-800">Wachtlijst-instellingen</p>
                <FieldWrapper label="Wachtlijst-gebied">
                  <Select value={(editClient as any)?.waitlist_area_id ?? ""} onValueChange={(v) => {
                    handleWaitlist(editClient.id, "waiting", v);
                  }}>
                    <SelectTrigger><SelectValue placeholder="Selecteer gebied" /></SelectTrigger>
                    <SelectContent className="bg-popover">
                      {areas.map((a: any) => (
                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FieldWrapper>
              </div>
            )}

            <FieldWrapper label="Reden van aanmelding" error={errors.referral_reason}>
              <Textarea value={form.referral_reason ?? ""} onChange={(e) => updateField("referral_reason", e.target.value)} rows={2} />
            </FieldWrapper>
            <FieldWrapper label="Doelen" error={errors.goals}>
              <Textarea value={form.goals ?? ""} onChange={(e) => updateField("goals", e.target.value)} rows={2} />
            </FieldWrapper>
            <FieldWrapper label="Intake-notities" error={errors.intake_notes}>
              <Textarea value={form.intake_notes ?? ""} onChange={(e) => updateField("intake_notes", e.target.value)} rows={2} />
            </FieldWrapper>
            <FieldWrapper label="Overige notities" error={errors.notes}>
              <Textarea value={form.notes ?? ""} onChange={(e) => updateField("notes", e.target.value)} rows={2} />
            </FieldWrapper>

            {/* Toestemming */}
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-t border-border pt-4">Toestemming</p>
            <div className="flex items-center gap-3">
              <Checkbox
                id="consent"
                checked={form.consent_data_processing ?? false}
                onCheckedChange={(v) => updateField("consent_data_processing", !!v)}
              />
              <Label htmlFor="consent" className="text-sm">AVG-toestemming gegevensverwerking</Label>
            </div>
            <div className="flex items-center gap-3">
              <Checkbox
                id="whatsapp"
                checked={form.whatsapp_consent ?? false}
                onCheckedChange={(v) => updateField("whatsapp_consent", !!v)}
              />
              <Label htmlFor="whatsapp" className="text-sm">Toestemming WhatsApp-contact</Label>
            </div>

            <Button type="submit" className="w-full" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saving ? "Opslaan..." : "Wijzigingen opslaan"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FieldWrapper({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
