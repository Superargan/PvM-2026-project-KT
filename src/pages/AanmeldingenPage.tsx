import { CheckCircle2, Loader2, ExternalLink, Clock, UserPlus, X, CalendarDays, Upload, Search, Pencil, AlertTriangle, Download, School, Users, Trash2, CalendarCheck } from "lucide-react";
import AvailabilityValidation from "@/components/AvailabilityValidation";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { areaKeys, clientKeys, schoolKeys, staffKeys, programKeys } from "@/lib/queryKeys";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SchoolCombobox from "@/components/SchoolCombobox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import WaitlistManager from "@/components/WaitlistManager";
import AreaPreferencesEditor from "@/components/AreaPreferencesEditor";
import ClientImport from "@/components/ClientImport";
import { downloadExport } from "@/lib/csvExport";
import { calculateAge, statusLabels, statusStyles, filterClients, REQUIRED_CLIENT_CHECKS, getMissingFields, findAllDuplicateGroups } from "@/lib/clientUtils";
import ClientFilters from "@/components/ClientFilters";
import ClientListTable from "@/components/ClientListTable";
import DuplicateWarning from "@/components/DuplicateWarning";

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
  dropout_reason: z.string().optional(),
  dropout_action: z.string().max(2000).optional(),
  // Velden die mee moeten bij opslaan (sync met ClientDetailPage)
  neighborhood_id: z.string().nullable().optional(),
  waitlist_area_id: z.string().nullable().optional(),
  all_areas_flexible: z.boolean().optional(),
  area_notes: z.string().max(5000).nullable().optional(),
});

type EditForm = z.infer<typeof editSchema>;

export default function AanmeldingenPage() {
  const [searchParams] = useSearchParams();
  const initialSchool = searchParams.get("school") ?? "all";
  const [activeTab, setActiveTab] = useState("lijst");
  const [search, setSearch] = useState("");
  const [filterArea, setFilterArea] = useState<string>("all");
  const [filterSchool, setFilterSchool] = useState<string>(initialSchool);
  const [filterAge, setFilterAge] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [editOpen, setEditOpen] = useState(false);
  const [editClient, setEditClient] = useState<any>(null);
  const [form, setForm] = useState<Partial<EditForm>>({});
  const [errors, setErrors] = useState<Partial<Record<keyof EditForm, string>>>({});
  const [saving, setSaving] = useState(false);
  const [selectedProgramId, setSelectedProgramId] = useState<string>("");
  const [importOpen, setImportOpen] = useState(false);
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: clients = [], isLoading, refetch } = useQuery({
    queryKey: clientKeys.aanmeldingen(search),
    queryFn: async () => {
      let query = supabase
        .from("clients")
        .select("*, neighborhoods:neighborhood_id(id, area_id, areas(id, name)), schools(id, name, neighborhood_id, neighborhoods(id, area_id, areas(id, name)))")
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
    queryKey: schoolKeys.dropdown,
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("id, name, neighborhood_id, neighborhoods(area_id)").order("name");
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

  const { data: staffList = [] } = useQuery({
    queryKey: staffKeys.all,
    queryFn: async () => {
      const { data, error } = await supabase.from("staff").select("id, name, user_id").eq("archived", false).not("name", "is", null).order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: assignments = [], refetch: refetchAssignments } = useQuery({
    queryKey: clientKeys.assignments(editClient?.id),
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

  const { data: availablePrograms = [] } = useQuery({
    queryKey: programKeys.available,
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
      dropout_reason: client.dropout_reason ?? "",
      dropout_action: client.dropout_action ?? "",
      // Sync-velden (leading vanuit clientkaart)
      neighborhood_id: client.neighborhood_id ?? null,
      waitlist_area_id: client.waitlist_area_id ?? null,
      all_areas_flexible: client.all_areas_flexible ?? false,
      area_notes: client.area_notes ?? "",
    });
    setErrors({});
    setSelectedProgramId("");
    setEditOpen(true);
  };

  const updateField = (field: keyof EditForm, value: string | boolean | null) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      // Auto-fill area and neighborhood from school (consistent met ClientDetailPage)
      if (field === "school_id") {
        const school = schools.find((s) => s.id === value);
        const areaId = school?.neighborhoods?.area_id;
        if (areaId) next.waitlist_area_id = areaId;
        next.neighborhood_id = school?.neighborhood_id ?? null;
      }
      return next;
    });
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const addAssignment = async (staffId: string) => {
    if (!editClient?.id) return;
    const { error } = await supabase.from("client_assignments").insert({
      client_id: editClient.id,
      staff_id: staffId,
    });
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
    queryClient.invalidateQueries({ queryKey: clientKeys.all });
    queryClient.invalidateQueries({ queryKey: clientKeys.assignments() });
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

  const { data: allAssignments = [] } = useQuery({
    queryKey: clientKeys.allAssignments,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_assignments")
        .select("client_id, staff(name)");
      if (error) throw error;
      return data ?? [];
    },
  });

  const assignmentsByClient = allAssignments.reduce((acc: Record<string, string[]>, a) => {
    if (!acc[a.client_id]) acc[a.client_id] = [];
    const staffName = (a.staff as { name: string | null } | null)?.name;
    if (staffName) acc[a.client_id].push(staffName);
    return acc;
  }, {});

  const filteredClients = filterClients(clients, {
    search, area: filterArea, school: filterSchool, age: filterAge, status: filterStatus,
  });

  // Clients visible on the active tab – used for export & selection
  const visibleClients = activeTab === "intake_afgerond"
    ? clients.filter((c: any) => c.intake_status === "intake_afgerond")
    : filteredClients;

  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<"xlsx" | "csv">("xlsx");
  const EXPORT_COLUMNS = [
    { key: "naam", label: "Naam", group: "Kind" },
    { key: "voornaam", label: "Voornaam", group: "Kind" },
    { key: "achternaam", label: "Achternaam", group: "Kind" },
    { key: "geboortedatum", label: "Geboortedatum", group: "Kind" },
    { key: "leeftijd", label: "Leeftijd", group: "Kind" },
    { key: "geslacht", label: "Geslacht", group: "Kind" },
    { key: "klas", label: "Klas/groep", group: "Kind" },
    { key: "school", label: "School", group: "School" },
    { key: "postcode", label: "Postcode", group: "Adres" },
    { key: "adres", label: "Adres", group: "Adres" },
    { key: "woonplaats", label: "Woonplaats", group: "Adres" },
    { key: "gebied", label: "Gebied", group: "Adres" },
    { key: "wijk", label: "Wijk", group: "Adres" },
    { key: "ouder_naam", label: "Ouder/verzorger", group: "Ouder" },
    { key: "ouder_telefoon", label: "Telefoon ouder", group: "Ouder" },
    { key: "ouder_telefoon_alt", label: "Telefoon 2 ouder", group: "Ouder" },
    { key: "ouder_email", label: "E-mail ouder", group: "Ouder" },
    { key: "status", label: "Status", group: "Intake" },
    { key: "aanmelddatum", label: "Aanmelddatum", group: "Intake" },
    { key: "intake_datum", label: "Intake datum", group: "Intake" },
    { key: "reden_aanmelding", label: "Reden aanmelding", group: "Intake" },
    { key: "doelen", label: "Doelen", group: "Intake" },
    { key: "intake_notities", label: "Intake notities", group: "Intake" },
    { key: "toestemming", label: "Toestemming gegevensverwerking", group: "Overig" },
    { key: "whatsapp", label: "WhatsApp toestemming", group: "Overig" },
    { key: "notities", label: "Notities", group: "Overig" },
    { key: "gebiedsnotities", label: "Gebiedsnotities", group: "Overig" },
    { key: "beschikbaarheid", label: "Beschikbaarheid", group: "Planning" },
    { key: "medewerker", label: "Toegewezen medewerker", group: "Planning" },
  ] as const;

  const [exportSelected, setExportSelected] = useState<Set<string>>(
    new Set(["naam", "school", "geboortedatum", "beschikbaarheid"])
  );

  const toggleExportCol = (key: string) => {
    setExportSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const selectExportGroup = (group: string, checked: boolean) => {
    setExportSelected((prev) => {
      const next = new Set(prev);
      for (const col of EXPORT_COLUMNS) {
        if (col.group === group) {
          if (checked) next.add(col.key); else next.delete(col.key);
        }
      }
      return next;
    });
  };

  const handleExportAanmeldingen = async () => {
    const selected = EXPORT_COLUMNS.filter((c) => exportSelected.has(c.key));
    if (selected.length === 0) return;

    const exportClients = selectedClients.size > 0
      ? visibleClients.filter((c: any) => selectedClients.has(c.id))
      : visibleClients;

    let availByClient: Record<string, string> = {};
    if (exportSelected.has("beschikbaarheid")) {
      const clientIds = exportClients.map((c: any) => c.id);
      const { data: availData } = await supabase
        .from("client_availability")
        .select("client_id, available_date, start_time, end_time, notes")
        .in("client_id", clientIds.length > 0 ? clientIds : ["__none__"])
        .order("available_date");

      // Aggregate by weekday + time pattern per client
      const dayNames = ["zo", "ma", "di", "wo", "do", "vr", "za"];
      const clientDayMap: Record<string, Map<string, { count: number; notes: Set<string> }>> = {};
      for (const a of availData ?? []) {
        if (!clientDayMap[a.client_id]) clientDayMap[a.client_id] = new Map();
        const dayIdx = new Date(a.available_date).getDay();
        const dayLabel = dayNames[dayIdx];
        const time = a.start_time && a.end_time ? `${a.start_time.slice(0, 5)}-${a.end_time.slice(0, 5)}` : "hele dag";
        const key = `${dayLabel} ${time}`;
        const entry = clientDayMap[a.client_id].get(key) ?? { count: 0, notes: new Set<string>() };
        entry.count++;
        if (a.notes) entry.notes.add(a.notes);
        clientDayMap[a.client_id].set(key, entry);
      }
      for (const [clientId, dayMap] of Object.entries(clientDayMap)) {
        const parts: string[] = [];
        for (const [pattern, info] of dayMap) {
          let s = pattern;
          if (info.notes.size > 0) s += ` (${[...info.notes].join(", ")})`;
          parts.push(s);
        }
        availByClient[clientId] = parts.join("; ");
      }
    }

    const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString("nl-NL") : "";
    const columns = selected.map((c) => ({ key: c.key, label: c.label }));
    const rows = exportClients.map((c: any) => {
      const row: Record<string, any> = {};
      for (const col of selected) {
        switch (col.key) {
          case "naam": row[col.key] = `${c.first_name} ${c.last_name}`; break;
          case "voornaam": row[col.key] = c.first_name ?? ""; break;
          case "achternaam": row[col.key] = c.last_name ?? ""; break;
          case "geboortedatum": row[col.key] = fmtDate(c.date_of_birth); break;
          case "leeftijd": row[col.key] = c.date_of_birth ? calculateAge(c.date_of_birth) : ""; break;
          case "geslacht": row[col.key] = c.gender ?? ""; break;
          case "klas": row[col.key] = c.class_group ?? ""; break;
          case "school": row[col.key] = c.schools?.name ?? ""; break;
          case "postcode": row[col.key] = c.postal_code ?? ""; break;
          case "adres": row[col.key] = c.address ?? ""; break;
          case "woonplaats": row[col.key] = c.city ?? ""; break;
          case "gebied": row[col.key] = c.neighborhoods?.areas?.name ?? c.schools?.neighborhoods?.areas?.name ?? ""; break;
          case "wijk": row[col.key] = c.neighborhoods?.name ?? c.schools?.neighborhoods?.name ?? ""; break;
          case "ouder_naam": row[col.key] = c.guardian_name ?? ""; break;
          case "ouder_telefoon": row[col.key] = c.guardian_phone ?? ""; break;
          case "ouder_telefoon_alt": row[col.key] = c.guardian_phone_alt ?? ""; break;
          case "ouder_email": row[col.key] = c.guardian_email ?? ""; break;
          case "status": row[col.key] = statusLabels[c.intake_status as keyof typeof statusLabels] ?? c.intake_status ?? ""; break;
          case "aanmelddatum": row[col.key] = fmtDate(c.registration_date); break;
          case "intake_datum": row[col.key] = fmtDate(c.intake_date); break;
          case "reden_aanmelding": row[col.key] = c.referral_reason ?? ""; break;
          case "doelen": row[col.key] = c.goals ?? ""; break;
          case "intake_notities": row[col.key] = c.intake_notes ?? ""; break;
          case "toestemming": row[col.key] = c.consent_data_processing ?? false; break;
          case "whatsapp": row[col.key] = c.whatsapp_consent ?? false; break;
          case "notities": row[col.key] = c.notes ?? ""; break;
          case "gebiedsnotities": row[col.key] = c.area_notes ?? ""; break;
          case "beschikbaarheid": row[col.key] = availByClient[c.id] ?? ""; break;
          case "medewerker": row[col.key] = (assignmentsByClient[c.id] ?? []).join(", "); break;
        }
      }
      return row;
    });

    downloadExport(`aanmeldingen-export.${exportFormat}`, columns, rows, exportFormat);
    setExportOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-foreground">Aanmeldingen</h1>
          <p className="text-sm text-muted-foreground">{clients.length} aanmeldingen in het systeem</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setExportOpen(true)}>
            <Download className="h-4 w-4" /> Exporteren
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" /> Importeren
          </Button>
          <Button variant="outline" onClick={() => navigate("/aanmelden")}>
            <ExternalLink className="h-4 w-4" /> Aanmeldformulier openen
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setSelectedClients(new Set()); }} className="space-y-4">
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
          <TabsTrigger value="duplicaten" className="gap-1.5">
            <Users className="h-3.5 w-3.5" /> Duplicaten
          </TabsTrigger>
          <TabsTrigger value="beschikbaarheid" className="gap-1.5">
            <CalendarCheck className="h-3.5 w-3.5" /> Beschikbaarheid
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lijst" className="space-y-4">
          <ClientFilters
            search={search} onSearchChange={setSearch}
            filterArea={filterArea} onFilterAreaChange={setFilterArea}
            filterSchool={filterSchool} onFilterSchoolChange={setFilterSchool}
            filterAge={filterAge} onFilterAgeChange={setFilterAge}
            filterStatus={filterStatus} onFilterStatusChange={setFilterStatus}
            areas={areas} schools={schools}
            totalCount={clients.length} filteredCount={filteredClients.length}
          />

          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <ClientListTable
              clients={filteredClients}
              assignmentsByClient={assignmentsByClient}
              areas={areas}
              onNavigate={(id) => navigate(`/clienten/${id}`)}
              onEdit={openEdit}
              showAssigned
              showCheckbox
              selected={selectedClients}
              onToggleSelect={(id) => {
                setSelectedClients((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id); else next.add(id);
                  return next;
                });
              }}
              onToggleAll={() => {
                setSelectedClients((prev) =>
                  prev.size === visibleClients.length
                    ? new Set()
                    : new Set(visibleClients.map((c: any) => c.id))
                );
              }}
            />
          )}
        </TabsContent>

        <TabsContent value="intake_afgerond" className="space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <ClientListTable
              clients={clients.filter((c: any) => c.intake_status === "intake_afgerond")}
              assignmentsByClient={assignmentsByClient}
              areas={areas}
              onNavigate={(id) => navigate(`/clienten/${id}`)}
              onEdit={openEdit}
              showCheckbox
              selected={selectedClients}
              onToggleSelect={(id) => {
                setSelectedClients((prev) => {
                  const next = new Set(prev);
                  if (next.has(id)) next.delete(id); else next.add(id);
                  return next;
                });
              }}
              onToggleAll={() => {
                const tabClients = clients.filter((c: any) => c.intake_status === "intake_afgerond");
                setSelectedClients((prev) =>
                  prev.size === tabClients.length
                    ? new Set()
                    : new Set(tabClients.map((c: any) => c.id))
                );
              }}
            />
          )}
        </TabsContent>

        <TabsContent value="wachtlijst">
          <div className="rounded-xl border border-border bg-card p-6">
            <WaitlistManager onEdit={openEdit} />
          </div>
        </TabsContent>
        <TabsContent value="controle" className="space-y-4">
          <MissingDataCheck clients={clients.filter((c: any) => !["actief", "training_afgerond", "tussentijds_gestopt", "niet_deelnemen"].includes(c.intake_status ?? "nieuw"))} isLoading={isLoading} onNavigate={(id) => navigate(`/clienten/${id}`)} onEdit={openEdit} schools={schools} areas={areas} refetch={refetch} />
        </TabsContent>
        <TabsContent value="duplicaten" className="space-y-4">
          <DuplicateScan clients={clients} isLoading={isLoading} onNavigate={(id) => navigate(`/clienten/${id}`)} onEdit={openEdit} />
        </TabsContent>
        <TabsContent value="beschikbaarheid" className="space-y-4">
          <AvailabilityValidation onNavigate={(id) => navigate(`/clienten/${id}`)} />
        </TabsContent>
      </Tabs>

      {/* Edit dialog – full form */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Aanmelding bewerken</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kindgegevens</p>
            <div className="grid grid-cols-2 gap-4">
              <FieldWrapper label="Voornaam *" error={errors.first_name}>
                <Input value={form.first_name ?? ""} onChange={(e) => updateField("first_name", e.target.value)} />
              </FieldWrapper>
              <FieldWrapper label="Achternaam *" error={errors.last_name}>
                <Input value={form.last_name ?? ""} onChange={(e) => updateField("last_name", e.target.value)} />
              </FieldWrapper>
            </div>
            <DuplicateWarning
              firstName={form.first_name ?? ""}
              lastName={form.last_name ?? ""}
              excludeId={editClient?.id}
              clients={clients}
              onNavigate={(id) => { setEditOpen(false); navigate(`/clienten/${id}`); }}
            />
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

            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-t border-border pt-4">School koppelen</p>
            <FieldWrapper label="School" error={errors.school_id}>
              <SchoolCombobox
                schools={schools}
                value={form.school_id ?? ""}
                onValueChange={(v) => updateField("school_id", v)}
              />
            </FieldWrapper>

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

            {form.intake_status === "nieuw" && form.intake_date && (
              <div className="rounded-lg border border-border bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">💡 Bij opslaan wordt de status automatisch naar <strong>Intake gepland</strong> gewijzigd omdat er een intakedatum is ingevuld.</p>
              </div>
            )}

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

            {form.intake_status === "wachtlijst" && (
              <div className="rounded-lg border border-accent/30 bg-accent/10 p-3 space-y-3">
                <p className="text-xs font-semibold text-accent-foreground">Wachtlijst-instellingen</p>
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
              {editClient?.id && (
                <AreaPreferencesEditor
                  clientId={editClient.id}
                  primaryAreaId={(editClient as any)?.waitlist_area_id ?? null}
                  allAreasFlexible={(editClient as any)?.all_areas_flexible ?? false}
                  onAllAreasFlexibleChange={async (v) => {
                    await supabase.from("clients").update({ all_areas_flexible: v } as any).eq("id", editClient.id);
                    setEditClient((prev: any) => ({ ...prev, all_areas_flexible: v }));
                    queryClient.invalidateQueries({ queryKey: clientKeys.all });
                  }}
                  areas={areas}
                   areaNotes={form.area_notes ?? ""}
                   onAreaNotesChange={(v) => updateField("area_notes" as any, v)}
                />
              )}
              </div>
            )}

            {(form.intake_status === "tussentijds_gestopt" || form.intake_status === "niet_deelnemen") && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-3">
                <p className="text-xs font-semibold text-destructive">
                  {form.intake_status === "tussentijds_gestopt" ? "Reden tussentijds gestopt" : "Reden niet deelnemen"}
                </p>
                <FieldWrapper label="Reden">
                  <Select value={form.dropout_reason ?? ""} onValueChange={(v) => updateField("dropout_reason", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecteer reden" /></SelectTrigger>
                    <SelectContent className="bg-popover">
                      <SelectItem value="motivatie">Motivatie</SelectItem>
                      <SelectItem value="ziekte">Ziekte</SelectItem>
                      <SelectItem value="verhuizing">Verhuizing</SelectItem>
                      <SelectItem value="gedrag">Gedrag</SelectItem>
                      <SelectItem value="ouders">Ouders/verzorgers</SelectItem>
                      <SelectItem value="school_wissel">Schoolwissel</SelectItem>
                      <SelectItem value="overig">Overig</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldWrapper>
                <FieldWrapper label="Toelichting / vervolgactie">
                  <Textarea value={form.dropout_action ?? ""} onChange={(e) => updateField("dropout_action", e.target.value)} rows={2} placeholder="Beschrijf de reden en eventuele vervolgacties..." />
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

      {/* Export configuratie dialog */}
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Export samenstellen</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {selectedClients.size > 0
              ? `${selectedClients.size} van ${visibleClients.length} aanmeldingen geselecteerd voor export.`
              : `Alle ${visibleClients.length} gefilterde aanmeldingen worden geëxporteerd. Selecteer rijen in de tabel om specifieke deelnemers te kiezen.`}
          </p>

          <div className="space-y-4">
            {Array.from(new Set(EXPORT_COLUMNS.map((c) => c.group))).map((group) => {
              const groupCols = EXPORT_COLUMNS.filter((c) => c.group === group);
              const allChecked = groupCols.every((c) => exportSelected.has(c.key));
              const someChecked = groupCols.some((c) => exportSelected.has(c.key));
              return (
                <div key={group} className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={allChecked ? true : someChecked ? "indeterminate" : false}
                      onCheckedChange={(checked) => selectExportGroup(group, !!checked)}
                    />
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group}</span>
                  </div>
                  <div className="ml-6 grid grid-cols-2 gap-x-4 gap-y-1">
                    {groupCols.map((col) => (
                      <label key={col.key} className="flex items-center gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={exportSelected.has(col.key)}
                          onCheckedChange={() => toggleExportCol(col.key)}
                        />
                        {col.label}
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-4 pt-2">
            <Label className="text-sm">Formaat:</Label>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={exportFormat === "xlsx" ? "default" : "outline"}
                onClick={() => setExportFormat("xlsx")}
              >
                Excel (.xlsx)
              </Button>
              <Button
                size="sm"
                variant={exportFormat === "csv" ? "default" : "outline"}
                onClick={() => setExportFormat("csv")}
              >
                CSV
              </Button>
            </div>
          </div>

          <div className="flex justify-between pt-2">
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setExportSelected(new Set(EXPORT_COLUMNS.map((c) => c.key)))}>
                Alles selecteren
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setExportSelected(new Set())}>
                Niets selecteren
              </Button>
            </div>
            <Button onClick={handleExportAanmeldingen} disabled={exportSelected.size === 0}>
              <Download className="h-4 w-4" /> Exporteren {selectedClients.size > 0 ? `(${selectedClients.size} deelnemers)` : `(${exportSelected.size} kolommen)`}
            </Button>
          </div>
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

const REQUIRED_CHECKS = REQUIRED_CLIENT_CHECKS;

function MissingDataCheck({ clients, isLoading, onNavigate, onEdit, schools, areas, refetch }: {
  clients: any[];
  isLoading: boolean;
  onNavigate: (id: string) => void;
  onEdit: (client: any) => void;
  schools: { id: string; name: string }[];
  areas: { id: string; name: string }[];
  refetch: () => void;
}) {
  const [schoolAssignments, setSchoolAssignments] = useState<Record<string, string>>({});
  const [savingSchool, setSavingSchool] = useState<string | null>(null);
  const { toast } = useToast();

  const uniqueClients = Array.from(new Map(clients.map((c) => [c.id, c])).values());
  const estimatedDobClients = uniqueClients.filter((c: any) => c.dob_estimated);

  const flagged = uniqueClients.map((c: any) => {
    const missing = getMissingFields(c);
    return { client: c, missing };
  }).filter((r) => r.missing.length > 0).sort((a, b) => b.missing.length - a.missing.length);

  const summaryCounts = REQUIRED_CHECKS.map((ch) => ({
    label: ch.label,
    count: uniqueClients.filter((client: any) => {
      if (ch.onlyStatuses && !ch.onlyStatuses.includes(client.intake_status ?? "")) return false;
      return ch.check(client);
    }).length,
  })).filter((s) => s.count > 0);

  const clientsWithoutSchool = uniqueClients.filter((c: any) => !c.school_id);

  const handleAssignSchool = async (clientId: string) => {
    const schoolId = schoolAssignments[clientId];
    if (!schoolId) return;
    setSavingSchool(clientId);
    const school = schools.find((s: any) => s.id === schoolId);
    const neighborhoodId = (school as any)?.neighborhood_id ?? null;
    const { error } = await supabase.from("clients").update({ school_id: schoolId, neighborhood_id: neighborhoodId }).eq("id", clientId);
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
    ];
    const rows = flagged.map(({ client, missing }) => ({
      naam: `${client.first_name} ${client.last_name}`.trim(),
      status: statusLabels[client.intake_status] ?? client.intake_status ?? "",
      school: client.schools?.name ?? "",
      ontbrekend: missing.join(", "),
    }));
    downloadExport("controle-aanmeldingen.xlsx", columns, rows, "xlsx");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{flagged.length}</span> van {uniqueClients.length} aanmelders hebben ontbrekende gegevens
        </p>
        {flagged.length > 0 && (
          <Button size="sm" variant="outline" onClick={handleExport} className="gap-1.5">
            <Download className="h-3.5 w-3.5" /> Exporteer naar Excel
          </Button>
        )}
      </div>

      {summaryCounts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {summaryCounts.map((s) => (
            <Badge key={s.label} variant="outline" className="text-xs gap-1">
              <span className="font-semibold text-destructive">{s.count}</span> zonder {s.label.toLowerCase()}
            </Badge>
          ))}
          {estimatedDobClients.length > 0 && (
            <Popover>
              <PopoverTrigger className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold border-warning-border text-warning-foreground cursor-pointer hover:bg-warning-muted gap-1">
                  ⚠ <span className="font-semibold">{estimatedDobClients.length}</span> geschatte geboortedatum (uit import)
              </PopoverTrigger>
              <PopoverContent className="w-72 max-h-64 overflow-y-auto p-2" align="start">
                <p className="text-xs font-semibold text-muted-foreground mb-2">Geschatte geboortedatum (uit import)</p>
                <div className="space-y-1">
                  {estimatedDobClients.map((c: any) => (
                    <button
                      key={c.id}
                      className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-muted/50 transition-colors text-primary hover:underline"
                      onClick={() => onNavigate(c.id)}
                    >
                      {c.first_name} {c.last_name}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      )}

      {clientsWithoutSchool.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center gap-2">
            <School className="h-4 w-4 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">
              {clientsWithoutSchool.length} aanmelder(s) zonder school — koppel hieronder
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
                <SchoolCombobox
                  schools={schools}
                  value={schoolAssignments[client.id] ?? ""}
                  onValueChange={(v) => setSchoolAssignments((prev) => ({ ...prev, [client.id]: v }))}
                  placeholder="Selecteer school..."
                  triggerClassName="flex-1 min-w-[200px]"
                />
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

      <ClientListTable
        clients={flagged.map(({ client }) => client)}
        onNavigate={onNavigate}
        onEdit={onEdit}
        areas={areas}
        emptyMessage="✅ Alle gegevens zijn volledig ingevuld!"
      />
    </div>
  );
}

function DuplicateScan({ clients, isLoading, onNavigate, onEdit }: {
  clients: any[];
  isLoading: boolean;
  onNavigate: (id: string) => void;
  onEdit: (client: any) => void;
}) {
  const groups = findAllDuplicateGroups(clients);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (client: any) => {
    setDeletingId(client.id);
    try {
      await supabase.from("attendance").delete().eq("client_id", client.id);
      await supabase.from("program_clients").delete().eq("client_id", client.id);
      await supabase.from("client_assignments").delete().eq("client_id", client.id);
      await supabase.from("client_availability").delete().eq("client_id", client.id);
      await supabase.from("client_area_preferences").delete().eq("client_id", client.id);
      await supabase.from("availability_override_logs").delete().eq("client_id", client.id);
      await supabase.from("audit_log").delete().eq("client_id", client.id);
      const { error } = await supabase.from("clients").delete().eq("id", client.id);
      if (error) throw error;
      toast({ title: `${client.first_name} ${client.last_name} verwijderd` });
      queryClient.invalidateQueries({ queryKey: clientKeys.all });
    } catch (err: any) {
      toast({ title: "Fout bij verwijderen", description: err.message, variant: "destructive" });
    } finally {
      setDeletingId(null);
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-center">
        <CheckCircle2 className="h-8 w-8 text-success mx-auto mb-2" />
        <p className="text-sm font-semibold text-foreground">Geen duplicaten gevonden</p>
        <p className="text-xs text-muted-foreground mt-1">Alle {clients.length} deelnemers hebben unieke namen.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{groups.length}</span> groep(en) met mogelijke duplicaten gevonden
      </p>
      {groups.map((group) => (
        <div key={group.key} className="rounded-xl border border-warning-border bg-card p-4 space-y-2">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Users className="h-4 w-4 text-warning" />
            {group.clients[0].first_name} {group.clients[0].last_name}
            <Badge variant="outline" className="text-[10px]">{group.clients.length}×</Badge>
          </p>
          <div className="divide-y divide-border">
            {group.clients.map((c: any) => (
              <div key={c.id} className="flex items-center gap-3 py-2 text-sm">
                <span
                  className="text-primary hover:underline cursor-pointer font-medium min-w-[140px]"
                  onClick={() => onNavigate(c.id)}
                >
                  {c.first_name} {c.last_name}
                </span>
                {c.date_of_birth && (
                  <span className="text-muted-foreground text-xs">
                    geb. {c.date_of_birth} ({calculateAge(c.date_of_birth)} jr)
                  </span>
                )}
                <Badge variant="outline" className="text-[10px]">
                  {statusLabels[c.intake_status ?? "nieuw"] ?? c.intake_status}
                </Badge>
                {c.schools?.name && (
                  <span className="text-muted-foreground text-xs">{c.schools.name}</span>
                )}
                <div className="ml-auto flex items-center gap-1">
                  <Button size="sm" variant="ghost" onClick={() => onEdit(c)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Duplicaat verwijderen?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Weet je zeker dat je <strong>{c.first_name} {c.last_name}</strong> wilt verwijderen? Dit verwijdert ook alle gekoppelde gegevens (presentie, programma-koppelingen, beschikbaarheid). Deze actie kan niet ongedaan worden gemaakt.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Annuleren</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(c)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {deletingId === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verwijderen"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
