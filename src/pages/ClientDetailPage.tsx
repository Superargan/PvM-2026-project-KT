import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Save, User, ClipboardList, BookOpen, Shield, FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

function calculateAge(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age--;
  return age;
}

const statusLabels: Record<string, string> = {
  nieuw: "Nieuw",
  intake: "Intake",
  actief: "Actief",
  wachtlijst: "Wachtlijst",
  afgerond: "Afgerond",
};

const statusStyles: Record<string, string> = {
  nieuw: "status-rood",
  intake: "status-oranje",
  actief: "status-groen",
  wachtlijst: "status-oranje",
  afgerond: "status-groen",
};

function IntakeProgress({ client }: { client: any }) {
  const fields = [
    client.first_name, client.last_name, client.date_of_birth, client.gender,
    client.school_id, client.guardian_name, client.guardian_phone, client.guardian_email,
    client.referral_reason, client.goals, client.intake_date,
  ];
  const filled = fields.filter(Boolean).length;
  const pct = Math.round((filled / fields.length) * 100);
  const color = pct < 50 ? "bg-[hsl(var(--status-rood))]" : pct < 80 ? "bg-[hsl(var(--status-oranje))]" : "bg-[hsl(var(--status-groen))]";

  return (
    <div className="flex items-center gap-3">
      <div className="h-2.5 flex-1 rounded-full bg-muted">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-muted-foreground">{pct}%</span>
    </div>
  );
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<any>({});
  const [dirty, setDirty] = useState(false);

  // Fetch client
  const { data: client, isLoading } = useQuery({
    queryKey: ["client", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("*, schools(name), referrers(name, function_title, email, phone)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch schools for dropdown
  const { data: schools = [] } = useQuery({
    queryKey: ["schools-list"],
    queryFn: async () => {
      const { data } = await supabase.from("schools").select("id, name").order("name");
      return data ?? [];
    },
  });

  // Fetch referrers
  const { data: referrers = [] } = useQuery({
    queryKey: ["referrers-list"],
    queryFn: async () => {
      const { data } = await supabase.from("referrers").select("id, name, function_title, school_id").order("name");
      return data ?? [];
    },
  });

  // Fetch programs for this client
  const { data: programs = [] } = useQuery({
    queryKey: ["client-programs", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("program_clients")
        .select("*, programs(name, status, start_date, end_date, schools(name))")
        .eq("client_id", id!);
      return data ?? [];
    },
    enabled: !!id,
  });

  // Fetch audit log
  const { data: auditLog = [] } = useQuery({
    queryKey: ["client-audit", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_log")
        .select("*")
        .eq("client_id", id!)
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
    enabled: !!id,
  });

  // Fetch document templates
  const { data: docTemplates = [] } = useQuery({
    queryKey: ["document-templates"],
    queryFn: async () => {
      const { data } = await supabase.from("document_templates").select("*").order("name");
      return data ?? [];
    },
  });

  // Fetch generated documents for this client
  const { data: generatedDocs = [] } = useQuery({
    queryKey: ["client-generated-docs", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("generated_documents")
        .select("*, document_templates(name, category)")
        .eq("client_id", id!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!id,
  });

  // Generate document mutation
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const generateDocMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplateId) throw new Error("Selecteer een template");
      const { data, error } = await supabase.functions.invoke("generate-document", {
        body: { template_id: selectedTemplateId, client_id: id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast({ title: "Document gegenereerd", description: data.file_name });
      setSelectedTemplateId("");
      queryClient.invalidateQueries({ queryKey: ["client-generated-docs", id] });
    },
    onError: (err: any) => {
      toast({ title: "Fout", description: err.message, variant: "destructive" });
    },
  });

  // Download generated document
  const handleDownloadDoc = async (doc: any) => {
    const { data, error } = await supabase.storage.from("generated-documents").download(doc.file_path);
    if (error || !data) {
      toast({ title: "Download mislukt", variant: "destructive" });
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.file_name;
    a.click();
    URL.revokeObjectURL(url);
  };


  useEffect(() => {
    if (id && session?.user?.id) {
      supabase.from("audit_log").insert({
        client_id: id,
        viewed_by: session.user.id,
        action: "view",
        details: "Dossier geopend",
      }).then();
    }
  }, [id, session?.user?.id]);

  // Populate form when client loads
  useEffect(() => {
    if (client) {
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
        referrer_id: client.referrer_id ?? "",
        referral_reason: client.referral_reason ?? "",
        goals: client.goals ?? "",
        intake_notes: client.intake_notes ?? "",
        intake_status: client.intake_status ?? "nieuw",
        intake_date: client.intake_date ?? "",
        consent_data_processing: client.consent_data_processing ?? false,
        whatsapp_consent: client.whatsapp_consent ?? false,
        notes: client.notes ?? "",
      });
      setDirty(false);
    }
  }, [client]);

  const updateField = (field: string, value: any) => {
    setForm((prev: any) => ({ ...prev, [field]: value }));
    setDirty(true);
  };

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      const updateData: any = { ...form };
      for (const key of Object.keys(updateData)) {
        if (typeof updateData[key] === "string" && updateData[key] === "") updateData[key] = null;
      }
      const { error } = await supabase.from("clients").update(updateData).eq("id", id!);
      if (error) throw error;

      // Audit log the save
      await supabase.from("audit_log").insert({
        client_id: id!,
        viewed_by: session!.user.id,
        action: "update",
        details: "Gegevens bijgewerkt",
      });
    },
    onSuccess: () => {
      toast({ title: "Opgeslagen" });
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ["client", id] });
      queryClient.invalidateQueries({ queryKey: ["client-audit", id] });
    },
    onError: (err: any) => {
      toast({ title: "Fout", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" /> Terug
        </Button>
        <p className="text-muted-foreground">Cliënt niet gevonden.</p>
      </div>
    );
  }

  const age = calculateAge(client.date_of_birth);
  const status = client.intake_status ?? "nieuw";
  const filteredReferrers = form.school_id
    ? referrers.filter((r: any) => r.school_id === form.school_id)
    : referrers;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-extrabold text-foreground">
              {client.first_name} {client.last_name}
            </h1>
            <span className={`status-indicator ${statusStyles[status] ?? "status-rood"}`}>
              {statusLabels[status] ?? status}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {age !== null ? `${age} jaar` : ""} {client.schools?.name ? `• ${client.schools.name}` : ""}
          </p>
        </div>
        <Button onClick={() => saveMutation.mutate()} disabled={!dirty || saveMutation.isPending}>
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Opslaan
        </Button>
      </div>

      {/* Intake progress */}
      <IntakeProgress client={{ ...client, ...form }} />

      {/* Tabs */}
      <Tabs defaultValue="gegevens" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="gegevens" className="gap-1.5"><User className="h-3.5 w-3.5" /> Gegevens</TabsTrigger>
          <TabsTrigger value="intake" className="gap-1.5"><ClipboardList className="h-3.5 w-3.5" /> Intake</TabsTrigger>
          <TabsTrigger value="programmas" className="gap-1.5"><BookOpen className="h-3.5 w-3.5" /> Programma's</TabsTrigger>
          <TabsTrigger value="documenten" className="gap-1.5"><FileText className="h-3.5 w-3.5" /> Documenten</TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5"><Shield className="h-3.5 w-3.5" /> Audit Log</TabsTrigger>
        </TabsList>

        {/* Gegevens tab */}
        <TabsContent value="gegevens" className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-6 space-y-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Kindgegevens</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Voornaam *">
                <Input value={form.first_name ?? ""} onChange={(e) => updateField("first_name", e.target.value)} />
              </Field>
              <Field label="Achternaam *">
                <Input value={form.last_name ?? ""} onChange={(e) => updateField("last_name", e.target.value)} />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Geboortedatum">
                <Input type="date" value={form.date_of_birth ?? ""} onChange={(e) => updateField("date_of_birth", e.target.value)} max={new Date().toISOString().split("T")[0]} />
              </Field>
              <Field label="Geslacht">
                <Select value={form.gender ?? ""} onValueChange={(v) => updateField("gender", v)}>
                  <SelectTrigger><SelectValue placeholder="Kies" /></SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="jongen">Jongen</SelectItem>
                    <SelectItem value="meisje">Meisje</SelectItem>
                    <SelectItem value="anders">Anders</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Klas/groep">
                <Input value={form.class_group ?? ""} onChange={(e) => updateField("class_group", e.target.value)} placeholder="bijv. groep 6" />
              </Field>
            </div>

            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-t border-border pt-4">School & Verwijzer</p>
            <div className="grid grid-cols-2 gap-4">
              <Field label="School">
                <Select value={form.school_id ?? ""} onValueChange={(v) => updateField("school_id", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecteer school" /></SelectTrigger>
                  <SelectContent className="bg-popover">
                    {schools.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Verwijzer">
                <Select value={form.referrer_id ?? ""} onValueChange={(v) => updateField("referrer_id", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecteer verwijzer" /></SelectTrigger>
                  <SelectContent className="bg-popover">
                    {filteredReferrers.map((r: any) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}{r.function_title ? ` (${r.function_title})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-t border-border pt-4">Ouder/Verzorger</p>
            <Field label="Naam">
              <Input value={form.guardian_name ?? ""} onChange={(e) => updateField("guardian_name", e.target.value)} />
            </Field>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Telefoon">
                <Input type="tel" value={form.guardian_phone ?? ""} onChange={(e) => updateField("guardian_phone", e.target.value)} />
              </Field>
              <Field label="Telefoon (alt)">
                <Input type="tel" value={form.guardian_phone_alt ?? ""} onChange={(e) => updateField("guardian_phone_alt", e.target.value)} />
              </Field>
              <Field label="E-mail">
                <Input type="email" value={form.guardian_email ?? ""} onChange={(e) => updateField("guardian_email", e.target.value)} />
              </Field>
            </div>

            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-t border-border pt-4">Adresgegevens</p>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Postcode">
                <Input value={form.postal_code ?? ""} onChange={(e) => updateField("postal_code", e.target.value)} />
              </Field>
              <Field label="Adres">
                <Input value={form.address ?? ""} onChange={(e) => updateField("address", e.target.value)} />
              </Field>
              <Field label="Plaats">
                <Input value={form.city ?? ""} onChange={(e) => updateField("city", e.target.value)} />
              </Field>
            </div>

            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-t border-border pt-4">Toestemming</p>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Checkbox id="consent" checked={form.consent_data_processing ?? false} onCheckedChange={(v) => updateField("consent_data_processing", !!v)} />
                <Label htmlFor="consent" className="text-sm">AVG-toestemming gegevensverwerking</Label>
              </div>
              <div className="flex items-center gap-3">
                <Checkbox id="whatsapp" checked={form.whatsapp_consent ?? false} onCheckedChange={(v) => updateField("whatsapp_consent", !!v)} />
                <Label htmlFor="whatsapp" className="text-sm">Toestemming WhatsApp-contact</Label>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Intake tab */}
        <TabsContent value="intake" className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-6 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Status">
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
              </Field>
              <Field label="Intakedatum">
                <Input type="date" value={form.intake_date ?? ""} onChange={(e) => updateField("intake_date", e.target.value)} />
              </Field>
            </div>
            <Field label="Reden van aanmelding">
              <Textarea value={form.referral_reason ?? ""} onChange={(e) => updateField("referral_reason", e.target.value)} rows={3} />
            </Field>
            <Field label="Doelen">
              <Textarea value={form.goals ?? ""} onChange={(e) => updateField("goals", e.target.value)} rows={3} />
            </Field>
            <Field label="Intake-notities">
              <Textarea value={form.intake_notes ?? ""} onChange={(e) => updateField("intake_notes", e.target.value)} rows={4} />
            </Field>
            <Field label="Overige notities">
              <Textarea value={form.notes ?? ""} onChange={(e) => updateField("notes", e.target.value)} rows={3} />
            </Field>
          </div>
        </TabsContent>

        {/* Programma's tab */}
        <TabsContent value="programmas" className="space-y-4">
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Programma</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">School</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Periode</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {programs.length === 0 && (
                  <tr><td colSpan={4} className="px-5 py-8 text-center text-sm text-muted-foreground">Nog niet ingeschreven in een programma</td></tr>
                )}
                {programs.map((pc: any) => (
                  <tr key={pc.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-5 py-4 text-sm font-medium text-card-foreground">{pc.programs?.name}</td>
                    <td className="px-5 py-4 text-sm text-card-foreground">{pc.programs?.schools?.name ?? "—"}</td>
                    <td className="px-5 py-4 text-sm text-card-foreground">
                      {pc.programs?.start_date ? format(new Date(pc.programs.start_date), "d MMM yyyy", { locale: nl }) : "—"}
                      {pc.programs?.end_date ? ` – ${format(new Date(pc.programs.end_date), "d MMM yyyy", { locale: nl })}` : ""}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`status-indicator ${statusStyles[pc.programs?.status ?? ""] ?? "status-oranje"}`}>
                        {pc.programs?.status ?? "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Documenten tab */}
        <TabsContent value="documenten" className="space-y-4">
          {/* Generate new */}
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Document Genereren</p>
            {docTemplates.length === 0 ? (
              <p className="text-sm text-muted-foreground">Geen templates beschikbaar. Upload templates via de Documenten-pagina.</p>
            ) : (
              <div className="flex gap-3 items-end">
                <div className="flex-1 space-y-1.5">
                  <Label className="text-sm font-medium">Template</Label>
                  <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                    <SelectTrigger><SelectValue placeholder="Selecteer een template" /></SelectTrigger>
                    <SelectContent className="bg-popover">
                      {docTemplates.map((t: any) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={() => generateDocMutation.mutate()} disabled={!selectedTemplateId || generateDocMutation.isPending}>
                  {generateDocMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  Genereer
                </Button>
              </div>
            )}
          </div>

          {/* Generated documents list */}
          {generatedDocs.length > 0 && (
            <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Document</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Template</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Datum</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Download</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {generatedDocs.map((doc: any) => (
                    <tr key={doc.id} className="transition-colors hover:bg-muted/30">
                      <td className="px-5 py-4 text-sm font-medium text-card-foreground">{doc.file_name}</td>
                      <td className="px-5 py-4">
                        <Badge variant="secondary">{doc.document_templates?.name ?? "—"}</Badge>
                      </td>
                      <td className="px-5 py-4 text-sm text-muted-foreground">
                        {format(new Date(doc.created_at), "d MMM yyyy HH:mm", { locale: nl })}
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Button variant="ghost" size="icon" onClick={() => handleDownloadDoc(doc)}>
                          <Download className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* Audit Log tab */}
        <TabsContent value="audit" className="space-y-4">
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Datum/Tijd</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actie</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {auditLog.length === 0 && (
                  <tr><td colSpan={3} className="px-5 py-8 text-center text-sm text-muted-foreground">Geen audit-logs gevonden</td></tr>
                )}
                {auditLog.map((log: any) => (
                  <tr key={log.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-5 py-4 text-sm text-card-foreground">
                      {format(new Date(log.created_at), "d MMM yyyy HH:mm", { locale: nl })}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`status-indicator ${log.action === "view" ? "status-oranje" : "status-groen"}`}>
                        {log.action === "view" ? "Bekeken" : log.action === "update" ? "Bijgewerkt" : log.action}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-muted-foreground">{log.details ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
    </div>
  );
}
