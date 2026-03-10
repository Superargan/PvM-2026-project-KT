import { CheckCircle2, Loader2, ExternalLink, Clock, UserPlus, X, CalendarDays, Upload, Search, Pencil, AlertTriangle, Download, School } from "lucide-react";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Badge } from "@/components/ui/badge";
import WaitlistManager from "@/components/WaitlistManager";
import ClientImport from "@/components/ClientImport";
import { downloadExport } from "@/lib/csvExport";

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
  registration_date: z.string().optional(),
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
  intake_gepland: "status-oranje",
  intake_afgerond: "status-groen",
  wachtlijst: "status-oranje",
  actief: "status-groen",
  training_afgerond: "status-groen",
  tussentijds_gestopt: "status-rood",
  niet_deelnemen: "status-rood",
};

const statusLabels: Record<string, string> = {
  nieuw: "Aanmelding",
  intake_gepland: "Intake gepland",
  intake_afgerond: "Intake afgerond",
  wachtlijst: "Wachtlijst",
  actief: "Deelnemer",
  training_afgerond: "Training afgerond",
  tussentijds_gestopt: "Tussentijds gestopt",
  niet_deelnemen: "Niet deelnemen",
};

export default function AanmeldingenPage() {
  const [activeTab, setActiveTab] = useState("lijst");
  const [search, setSearch] = useState("");
  const [filterArea, setFilterArea] = useState<string>("all");
  const [filterSchool, setFilterSchool] = useState<string>("all");
  const [filterAge, setFilterAge] = useState<string>("all");
  const [editOpen, setEditOpen] = useState(false);
  const [editClient, setEditClient] = useState<any>(null);
  const [form, setForm] = useState<Partial<EditForm>>({});
  const [errors, setErrors] = useState<Partial<Record<keyof EditForm, string>>>({});
  const [saving, setSaving] = useState(false);
  const [selectedProgramId, setSelectedProgramId] = useState<string>("");
  const [importOpen, setImportOpen] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: clients = [], isLoading, refetch } = useQuery({
    queryKey: ["aanmeldingen", search],
    queryFn: async () => {
      let query = supabase
        .from("clients")
        .select("*, schools(name), areas:waitlist_area_id(name)")
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

  const { data: staffList = [] } = useQuery({
    queryKey: ["staff-list-for-assignment"],
    queryFn: async () => {
      const { data, error } = await supabase.from("staff").select("id, name, user_id").eq("archived", false).not("name", "is", null).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch assignments for the currently edited client
  const { data: assignments = [], refetch: refetchAssignments } = useQuery({
    queryKey: ["client-assignments", editClient?.id],
    enabled: !!editClient?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_assignments")
        .select("id, staff_id, staff(name)")
        .eq("client_id", editClient.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch available programs for "deelnemen" flow
  const { data: availablePrograms = [] } = useQuery({
    queryKey: ["available-programs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("programs")
        .select("id, name, status, start_date, age_category, schools(name)")
        .eq("archived", false)
        .in("status", ["te_plannen", "ingepland", "gestart"])
        .order("name");
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
      registration_date: client.registration_date ?? "",
      consent_data_processing: client.consent_data_processing ?? false,
      whatsapp_consent: client.whatsapp_consent ?? false,
      notes: client.notes ?? "",
    });
    setErrors({});
    setSelectedProgramId("");
    setEditOpen(true);
  };

  const updateField = (field: keyof EditForm, value: any) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const addAssignment = async (staffId: string) => {
    if (!editClient?.id) return;
    const { error } = await supabase.from("client_assignments").insert({
      client_id: editClient.id,
      staff_id: staffId,
    } as any);
    if (error) {
      if (error.code === "23505") {
        toast({ title: "Al toegewezen", variant: "destructive" });
      } else {
        toast({ title: "Fout", description: error.message, variant: "destructive" });
      }
    } else {
      refetchAssignments();
    }
  };

  const removeAssignment = async (assignmentId: string) => {
    const { error } = await supabase.from("client_assignments").delete().eq("id", assignmentId);
    if (error) {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    } else {
      refetchAssignments();
    }
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

    // Validate: if "actief" and no program selected, require it
    if (result.data.intake_status === "actief" && !selectedProgramId) {
      toast({ title: "Selecteer een programma", description: "Kies een programma om het kind aan te koppelen.", variant: "destructive" });
      return;
    }

    setSaving(true);
    const updateData: any = { ...result.data };
    for (const key of Object.keys(updateData)) {
      if (updateData[key] === "") updateData[key] = null;
    }

    const { error } = await supabase.from("clients").update(updateData).eq("id", editClient.id);

    if (error) {
      setSaving(false);
      toast({ title: "Fout", description: error.message, variant: "destructive" });
      return;
    }

    // If status changed to "actief" and program selected, create program_clients link
    if (result.data.intake_status === "actief" && selectedProgramId) {
      const { error: linkError } = await supabase.from("program_clients").insert({
        client_id: editClient.id,
        program_id: selectedProgramId,
        started: true,
      });
      if (linkError && linkError.code !== "23505") {
        toast({ title: "Waarschuwing", description: `Aanmelding opgeslagen, maar koppeling aan programma mislukt: ${linkError.message}`, variant: "destructive" });
      }
    }

    setSaving(false);
    toast({ title: "Aanmelding bijgewerkt" });
    setEditOpen(false);
    refetch();
    queryClient.invalidateQueries({ queryKey: ["client-assignments"] });
  };

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

  // Get assigned staff names for a client (from a preloaded map)
  const { data: allAssignments = [] } = useQuery({
    queryKey: ["all-client-assignments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_assignments")
        .select("client_id, staff(name)");
      if (error) throw error;
      return data ?? [];
    },
  });

  const assignmentsByClient = allAssignments.reduce((acc: Record<string, string[]>, a: any) => {
    if (!acc[a.client_id]) acc[a.client_id] = [];
    if (a.staff?.name) acc[a.client_id].push(a.staff.name);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-foreground">Aanmeldingen</h1>
          <p className="text-sm text-muted-foreground">{clients.length} aanmeldingen in het systeem</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" /> Importeren
          </Button>
          <Button variant="outline" onClick={() => navigate("/aanmelden")}>
            <ExternalLink className="h-4 w-4" /> Aanmeldformulier openen
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="lijst">Aanmeldingen</TabsTrigger>
          <TabsTrigger value="intake_afgerond" className="gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" /> Intakes afgerond
          </TabsTrigger>
          <TabsTrigger value="wachtlijst" className="gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Wachtlijst
          </TabsTrigger>
          <TabsTrigger value="controle" className="gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> Controle
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lijst" className="space-y-4">
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
        {(filterArea !== "all" || filterSchool !== "all" || filterAge !== "all") && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterArea("all"); setFilterSchool("all"); setFilterAge("all"); }}>
            <X className="h-3.5 w-3.5 mr-1" /> Wis filters
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <ClientTable
          clients={clients.filter((c: any) => {
            if (filterArea !== "all") {
              const clientAreaId = c.waitlist_area_id || c.schools?.neighborhoods?.area_id;
              if (clientAreaId !== filterArea) return false;
            }
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
          })}
          assignmentsByClient={assignmentsByClient}
          onNavigate={(id) => navigate(`/clienten/${id}`)}
          onEdit={openEdit}
          showAssigned
        />
      )}
        </TabsContent>

        <TabsContent value="intake_afgerond" className="space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <ClientTable
              clients={clients.filter((c: any) => c.intake_status === "intake_afgerond")}
              assignmentsByClient={assignmentsByClient}
              onNavigate={(id) => navigate(`/clienten/${id}`)}
              onEdit={openEdit}
            />
          )}
        </TabsContent>

        <TabsContent value="wachtlijst">
          <div className="rounded-xl border border-border bg-card p-6">
            <WaitlistManager onEdit={openEdit} />
          </div>
        </TabsContent>
        <TabsContent value="controle" className="space-y-4">
          <MissingDataCheck clients={clients} isLoading={isLoading} onNavigate={(id) => navigate(`/clienten/${id}`)} onEdit={openEdit} schools={schools} refetch={refetch} />
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

            {/* Toewijzing aan medewerkers */}
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-t border-border pt-4">Toegewezen aan</p>
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {assignments.map((a: any) => (
                  <Badge key={a.id} variant="secondary" className="gap-1 pr-1">
                    {(a as any).staff?.name ?? "Onbekend"}
                    <button type="button" onClick={() => removeAssignment(a.id)} className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                {assignments.length === 0 && <span className="text-xs text-muted-foreground">Nog niemand toegewezen</span>}
              </div>
              <Select onValueChange={(v) => addAssignment(v)} value="">
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Trainer of medewerker toewijzen..." />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  {(() => {
                    const available = staffList.filter((s: any) => !assignments.some((a: any) => a.staff_id === s.id));
                    const trainers = available.filter((s: any) => !s.user_id);
                    const medewerkers = available.filter((s: any) => !!s.user_id);
                    return (
                      <>
                        {trainers.length > 0 && (
                          <>
                            <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Trainers</p>
                            {trainers.map((s: any) => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                          </>
                        )}
                        {medewerkers.length > 0 && (
                          <>
                            <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Medewerkers</p>
                            {medewerkers.map((s: any) => (
                              <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                            ))}
                          </>
                        )}
                      </>
                    );
                  })()}
                </SelectContent>
              </Select>
            </div>

            {/* Intake & Status */}
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-t border-border pt-4">Intake & Status</p>
            <div className="grid grid-cols-2 gap-4">
              <FieldWrapper label="Status" error={errors.intake_status}>
                <Select value={form.intake_status ?? "nieuw"} onValueChange={(v) => updateField("intake_status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="nieuw">Aanmelding</SelectItem>
                    <SelectItem value="intake_gepland">Intake gepland</SelectItem>
                    <SelectItem value="intake_afgerond">Intake afgerond</SelectItem>
                    <SelectItem value="wachtlijst">Wachtlijst</SelectItem>
                    <SelectItem value="actief">Deelnemer</SelectItem>
                    <SelectItem value="training_afgerond">Training afgerond</SelectItem>
                    <SelectItem value="tussentijds_gestopt">Tussentijds gestopt</SelectItem>
                    <SelectItem value="niet_deelnemen">Niet deelnemen</SelectItem>
                  </SelectContent>
                </Select>
              </FieldWrapper>
              <FieldWrapper label="Intakedatum" error={errors.intake_date}>
                <Input type="date" value={form.intake_date ?? ""} onChange={(e) => updateField("intake_date", e.target.value)} />
              </FieldWrapper>
            </div>
            <FieldWrapper label="Aanmelddatum">
              <Input type="date" value={form.registration_date ?? ""} onChange={(e) => updateField("registration_date", e.target.value)} />
            </FieldWrapper>

            {/* Info: auto-trigger uitleg */}
            {form.intake_status === "nieuw" && form.intake_date && (
              <div className="rounded-lg border border-border bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">💡 Bij opslaan wordt de status automatisch naar <strong>Intake gepland</strong> gewijzigd omdat er een intakedatum is ingevuld.</p>
              </div>
            )}

            {/* Programma koppeling bij "deelnemen" */}
            {form.intake_status === "actief" && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
                <p className="text-xs font-semibold text-primary">Programma koppeling</p>
                <p className="text-xs text-muted-foreground">Selecteer het programma waaraan dit kind gaat deelnemen.</p>
                <Select value={selectedProgramId} onValueChange={setSelectedProgramId}>
                  <SelectTrigger><SelectValue placeholder="Kies een programma..." /></SelectTrigger>
                  <SelectContent className="bg-popover">
                    {availablePrograms.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} {p.age_category ? `(${p.age_category})` : ""} — {(p as any).schools?.name ?? "Geen school"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

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

            {/* Niet deelnemen reden */}
            {form.intake_status === "niet_deelnemen" && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-3">
                <p className="text-xs font-semibold text-red-800">Reden niet deelnemen</p>
                <FieldWrapper label="Notities">
                  <Textarea value={form.notes ?? ""} onChange={(e) => updateField("notes", e.target.value)} rows={2} placeholder="Reden waarom het kind niet deelneemt..." />
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

            {/* Beschikbaarheid */}
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-t border-border pt-4">Beschikbaarheid</p>
            <div className="rounded-lg border border-border bg-muted/30 p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Beschikbaarheid deelnemer</p>
                <p className="text-xs text-muted-foreground">Leg vast wanneer het kind beschikbaar is voor trainingen</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditOpen(false);
                  navigate(`/clienten/${editClient?.id}?tab=beschikbaarheid`);
                }}
              >
                <CalendarDays className="h-3.5 w-3.5" /> Beheren
              </Button>
            </div>

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

      <ClientImport open={importOpen} onOpenChange={setImportOpen} onComplete={() => refetch()} mode="choose" />
    </div>
  );
}

function ClientTable({ clients, assignmentsByClient, onNavigate, onEdit, showAssigned }: {
  clients: any[];
  assignmentsByClient: Record<string, string[]>;
  onNavigate: (id: string) => void;
  onEdit: (client: any) => void;
  showAssigned?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Naam</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Leeftijdsgroep</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">School</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Gebied</th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Telefoon</th>
              {showAssigned && <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:table-cell">Toegewezen</th>}
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actie</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {clients.length === 0 && (
              <tr><td colSpan={showAssigned ? 8 : 7} className="px-4 py-8 text-center text-sm text-muted-foreground">Geen aanmeldingen gevonden</td></tr>
            )}
            {clients.map((client: any) => {
              const age = calculateAge(client.date_of_birth);
              const ageGroup = age !== null ? (age >= 5 && age <= 7 ? "5-7 jaar" : age >= 8 && age <= 12 ? "8-12 jaar" : `${age} jaar`) : "—";
              const status = client.intake_status ?? "nieuw";
              const assigned = assignmentsByClient[client.id] ?? [];
              return (
                <tr key={client.id} className="transition-colors hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <p className="text-sm font-semibold text-primary hover:underline cursor-pointer" onClick={() => onNavigate(client.id)}>{client.first_name} {client.last_name}</p>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="text-xs">{ageGroup}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-card-foreground">{client.schools?.name ?? <span className="text-xs text-muted-foreground">—</span>}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-card-foreground">{(client as any).areas?.name ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-card-foreground">{client.guardian_phone ?? "—"}</span>
                  </td>
                  {showAssigned && (
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {assigned.length > 0
                          ? assigned.map((name: string, i: number) => (
                              <Badge key={i} variant="secondary" className="text-xs">{name}</Badge>
                            ))
                          : <span className="text-xs text-muted-foreground">—</span>
                        }
                      </div>
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <span className={`status-indicator ${statusStyles[status] ?? "status-rood"}`}>
                      {statusLabels[status] ?? status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="ghost" onClick={() => onEdit(client)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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

const REQUIRED_CHECKS: { key: string; label: string; check: (c: any) => boolean }[] = [
  { key: "date_of_birth", label: "Geboortedatum", check: (c) => !c.date_of_birth },
  { key: "school_id", label: "School", check: (c) => !c.school_id },
  { key: "guardian_phone", label: "Telefoon ouder", check: (c) => !c.guardian_phone },
  { key: "guardian_name", label: "Naam ouder", check: (c) => !c.guardian_name },
  { key: "waitlist_area_id", label: "Gebied", check: (c) => !c.waitlist_area_id },
  { key: "gender", label: "Geslacht", check: (c) => !c.gender },
  { key: "postal_code", label: "Postcode", check: (c) => !c.postal_code },
  { key: "consent_data_processing", label: "AVG-toestemming", check: (c) => !c.consent_data_processing },
];

function MissingDataCheck({ clients, isLoading, onNavigate, onEdit, schools, refetch }: {
  clients: any[];
  isLoading: boolean;
  onNavigate: (id: string) => void;
  onEdit: (client: any) => void;
  schools: { id: string; name: string }[];
  refetch: () => void;
}) {
  const [schoolAssignments, setSchoolAssignments] = useState<Record<string, string>>({});
  const [savingSchool, setSavingSchool] = useState<string | null>(null);
  const { toast } = useToast();

  // Deduplicate clients by id
  const uniqueClients = Array.from(new Map(clients.map((c) => [c.id, c])).values());

  // Only check "Gebied" for relevant statuses
  const relevantForArea = new Set(["wachtlijst", "intake_afgerond", "actief"]);

  const flagged = uniqueClients.map((c: any) => {
    const missing = Array.from(new Set(
      REQUIRED_CHECKS
        .filter((ch) => {
          if (ch.key === "waitlist_area_id" && !relevantForArea.has(c.intake_status ?? "")) return false;
          return ch.check(c);
        })
        .map((ch) => ch.label)
    ));
    return { client: c, missing };
  }).filter((r) => r.missing.length > 0).sort((a, b) => b.missing.length - a.missing.length);

  // Summary counts per missing field
  const summaryCounts = REQUIRED_CHECKS.map((ch) => ({
    label: ch.label,
    count: flagged.filter(({ client }) => {
      if (ch.key === "waitlist_area_id" && !relevantForArea.has(client.intake_status ?? "")) return false;
      return ch.check(client);
    }).length,
  })).filter((s) => s.count > 0);

  // Clients without school
  const clientsWithoutSchool = uniqueClients.filter((c: any) => !c.school_id);

  const handleAssignSchool = async (clientId: string) => {
    const schoolId = schoolAssignments[clientId];
    if (!schoolId) return;
    setSavingSchool(clientId);
    const { error } = await supabase.from("clients").update({ school_id: schoolId }).eq("id", clientId);
    setSavingSchool(null);
    if (error) {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "School gekoppeld" });
      setSchoolAssignments((prev) => { const next = { ...prev }; delete next[clientId]; return next; });
      refetch();
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const handleExport = () => {
    const columns = [
      { key: "naam", label: "Naam" },
      { key: "status", label: "Status" },
      { key: "school", label: "School" },
      { key: "ontbrekend", label: "Ontbrekende velden" },
      { key: "geboortedatum", label: "Geboortedatum" },
      { key: "telefoon", label: "Telefoon ouder" },
      { key: "naam_ouder", label: "Naam ouder" },
      { key: "postcode", label: "Postcode" },
      { key: "geslacht", label: "Geslacht" },
      { key: "gebied", label: "Gebied" },
      { key: "avg", label: "AVG-toestemming" },
    ];
    const rows = flagged.map(({ client, missing }) => ({
      naam: `${client.first_name} ${client.last_name}`.trim(),
      status: statusLabels[client.intake_status] ?? client.intake_status ?? "",
      school: client.schools?.name ?? "",
      ontbrekend: missing.join(", "),
      geboortedatum: client.date_of_birth ?? "",
      telefoon: client.guardian_phone ?? "",
      naam_ouder: client.guardian_name ?? "",
      postcode: client.postal_code ?? "",
      geslacht: client.gender ?? "",
      gebied: client.areas?.name ?? "",
      avg: client.consent_data_processing,
    }));
    downloadExport("controle-aanmeldingen.xlsx", columns, rows, "xlsx");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{flagged.length}</span> van {uniqueClients.length} deelnemers hebben ontbrekende gegevens
        </p>
        {flagged.length > 0 && (
          <Button size="sm" variant="outline" onClick={handleExport} className="gap-1.5">
            <Download className="h-3.5 w-3.5" /> Exporteer naar Excel
          </Button>
        )}
      </div>

      {/* Summary per missing field */}
      {summaryCounts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {summaryCounts.map((s) => (
            <Badge key={s.label} variant="outline" className="text-xs gap-1">
              <span className="font-semibold text-destructive">{s.count}</span> zonder {s.label.toLowerCase()}
            </Badge>
          ))}
        </div>
      )}

      {/* School assignment section */}
      {clientsWithoutSchool.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <School className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">
              {clientsWithoutSchool.length} deelnemer(s) zonder school — koppel hieronder
            </p>
          </div>
          <div className="space-y-2">
            {clientsWithoutSchool.map((client: any) => (
              <div key={client.id} className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2">
                <p
                  className="text-sm font-medium text-primary hover:underline cursor-pointer min-w-[140px]"
                  onClick={() => onNavigate(client.id)}
                >
                  {client.first_name} {client.last_name}
                </p>
                {client.class_group && (
                  <Badge variant="outline" className="text-[10px] shrink-0">groep {client.class_group}</Badge>
                )}
                <Select
                  value={schoolAssignments[client.id] ?? ""}
                  onValueChange={(v) => setSchoolAssignments((prev) => ({ ...prev, [client.id]: v }))}
                >
                  <SelectTrigger className="flex-1 min-w-[200px]">
                    <SelectValue placeholder="Selecteer school..." />
                  </SelectTrigger>
                  <SelectContent className="bg-popover max-h-60">
                    {schools.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  disabled={!schoolAssignments[client.id] || savingSchool === client.id}
                  onClick={() => handleAssignSchool(client.id)}
                >
                  {savingSchool === client.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Koppel"}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Naam</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ontbrekende velden</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actie</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {flagged.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">✅ Alle gegevens zijn volledig ingevuld!</td></tr>
              )}
              {flagged.map(({ client, missing }) => {
                const status = client.intake_status ?? "nieuw";
                return (
                  <tr key={client.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <p className="text-sm font-semibold text-primary hover:underline cursor-pointer" onClick={() => onNavigate(client.id)}>{client.first_name} {client.last_name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`status-indicator ${statusStyles[status] ?? "status-rood"}`}>
                        {statusLabels[status] ?? status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {missing.map((m) => (
                          <Badge key={m} variant="destructive" className="text-xs">{m}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="ghost" onClick={() => onEdit(client)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
