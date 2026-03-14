import { useState, useRef } from "react";
import { UserCog, Plus, Search, Mail, Phone, Loader2, Building2, Edit, FileText, Download, Upload, CheckCircle2, XCircle, ShieldCheck, Trash2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { staffKeys, documentKeys } from "@/lib/queryKeys";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import TrainerTrainings from "@/components/TrainerTrainings";
import InvoiceManager from "@/components/InvoiceManager";

const rolColors: Record<string, string> = {
  backoffice: "bg-kanjer-blauw/10 text-kanjer-blauw",
  trainer: "bg-kanjer-groen/10 text-kanjer-groen",
};

const rolLabels: Record<string, string> = {
  backoffice: "Backoffice",
  trainer: "Trainer",
};

interface TrainerForm {
  name: string;
  trade_name: string;
  kvk_number: string;
  address: string;
  postal_code: string;
  city: string;
  phone: string;
  email: string;
  trainer_type: string;
}

const emptyTrainerForm: TrainerForm = {
  name: "", trade_name: "", kvk_number: "", address: "", postal_code: "", city: "", phone: "", email: "", trainer_type: "",
};

export default function MedewerkersPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("");
  
  const [trainerDialogOpen, setTrainerDialogOpen] = useState(false);
  const [trainerForm, setTrainerForm] = useState<TrainerForm>(emptyTrainerForm);
  const [editingTrainerId, setEditingTrainerId] = useState<string | null>(null);

  // Document generation state
  const [docDialogOpen, setDocDialogOpen] = useState(false);
  const [docTrainerId, setDocTrainerId] = useState<string | null>(null);
  const [docTrainerName, setDocTrainerName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedProgramId, setSelectedProgramId] = useState("");
  
  const queryClient = useQueryClient();

  // Fetch medewerkers (users with accounts)
  const { data: medewerkers = [], isLoading: loadingMedewerkers } = useQuery({
    queryKey: staffKeys.medewerkers,
    queryFn: async () => {
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, phone");
      if (pErr) throw pErr;

      const { data: roles, error: rErr } = await supabase
        .from("user_roles")
        .select("user_id, role");
      if (rErr) throw rErr;

      const { data: staffData, error: sErr } = await supabase
        .from("staff")
        .select("user_id, specialization, program_staff!program_staff_staff_id_fkey(id)");
      if (sErr) throw sErr;

      return (profiles || []).map((p) => {
        const role = roles?.find((r) => r.user_id === p.user_id);
        const staff = staffData?.find((s) => s.user_id === p.user_id);
        return {
          user_id: p.user_id,
          naam: p.full_name,
          email: p.email || "",
          telefoon: p.phone || "",
          rol: role?.role || "onbekend",
          specialisatie: staff?.specialization || "",
          actieveGroepen: staff?.program_staff?.length || 0,
        };
      });
    },
  });

  // Fetch external trainers
  const { data: trainers = [], isLoading: loadingTrainers } = useQuery({
    queryKey: staffKeys.trainers,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("id, name, trade_name, kvk_number, address, postal_code, city, phone, email, user_id, kvk_uittreksel_path, kvk_uittreksel_uploaded_at, vog_path, vog_uploaded_at, program_staff!program_staff_staff_id_fkey(id, programs(name))")
        .eq("archived", false)
        .not("name", "is", null)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch document templates
  const { data: docTemplates = [] } = useQuery({
    queryKey: documentKeys.templates,
    queryFn: async () => {
      const { data } = await supabase.from("document_templates").select("*").order("name");
      return data ?? [];
    },
  });

  // Fetch programs for trainer document generation
  const { data: trainerPrograms = [] } = useQuery({
    queryKey: staffKeys.trainerPrograms(docTrainerId),
    queryFn: async () => {
      if (!docTrainerId) return [];
      const { data } = await supabase
        .from("program_staff")
        .select("program_id, programs(id, name)")
        .eq("staff_id", docTrainerId);
      return (data ?? []).map((ps: any) => ps.programs).filter(Boolean);
    },
    enabled: !!docTrainerId && docDialogOpen,
  });

  // Fetch generated docs for selected trainer
  const { data: trainerDocs = [] } = useQuery({
    queryKey: staffKeys.trainerDocs(docTrainerId),
    queryFn: async () => {
      if (!docTrainerId) return [];
      const { data } = await supabase
        .from("generated_documents")
        .select("*, document_templates(name)")
        .eq("staff_id", docTrainerId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
    enabled: !!docTrainerId && docDialogOpen,
  });

  const inviteMutation = useMutation({
    mutationFn: async (payload: { email: string; full_name: string; role: string }) => {
      const { data, error } = await supabase.functions.invoke("invite-user", {
        body: payload,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Uitnodiging verstuurd!");
      setInviteDialogOpen(false);
      setInviteEmail("");
      setInviteName("");
      setInviteRole("");
      queryClient.invalidateQueries({ queryKey: staffKeys.medewerkers });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Uitnodiging kon niet worden verstuurd");
    },
  });

  const trainerMutation = useMutation({
    mutationFn: async () => {
      if (!trainerForm.name) throw new Error("Naam is verplicht");
      const payload: any = { ...trainerForm };
      for (const key of Object.keys(payload)) {
        if (payload[key] === "") payload[key] = null;
      }
      payload.name = trainerForm.name;

      if (editingTrainerId) {
        const { error } = await supabase.from("staff").update(payload).eq("id", editingTrainerId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("staff").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingTrainerId ? "Trainer bijgewerkt!" : "Trainer toegevoegd!");
      setTrainerDialogOpen(false);
      setTrainerForm(emptyTrainerForm);
      setEditingTrainerId(null);
      queryClient.invalidateQueries({ queryKey: staffKeys.trainers });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  // Generate document for trainer
  const generateDocMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplateId || !docTrainerId) throw new Error("Selecteer een template");
      const body: any = { template_id: selectedTemplateId, staff_id: docTrainerId };
      if (selectedProgramId) body.program_id = selectedProgramId;
      const { data, error } = await supabase.functions.invoke("generate-document", {
        body,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      toast.success(`Document gegenereerd: ${data.file_name}`);
      setSelectedTemplateId("");
      queryClient.invalidateQueries({ queryKey: staffKeys.trainerDocs(docTrainerId) });
    },
    onError: (err: any) => {
      toast.error(err.message);
    },
  });

  // Delete generated document
  const deleteDocMutation = useMutation({
    mutationFn: async (doc: any) => {
      await supabase.storage.from("generated-documents").remove([doc.file_path]);
      const { error } = await supabase.from("generated_documents").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Document verwijderd");
      queryClient.invalidateQueries({ queryKey: ["trainer-generated-docs", docTrainerId] });
    },
    onError: (err: any) => toast.error(err.message || "Verwijderen mislukt"),
  });

  // Download generated document
  const handleDownloadDoc = async (doc: any) => {
    const { data, error } = await supabase.storage.from("generated-documents").download(doc.file_path);
    if (error || !data) {
      toast.error("Download mislukt");
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.file_name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleEditTrainer = (trainer: any) => {
    setTrainerForm({
      name: trainer.name || "",
      trade_name: trainer.trade_name || "",
      kvk_number: trainer.kvk_number || "",
      address: trainer.address || "",
      postal_code: trainer.postal_code || "",
      city: trainer.city || "",
      phone: trainer.phone || "",
      email: trainer.email || "",
      trainer_type: trainer.trainer_type || "",
    });
    setEditingTrainerId(trainer.id);
    setTrainerDialogOpen(true);
  };

  const handleNewTrainer = () => {
    setTrainerForm(emptyTrainerForm);
    setEditingTrainerId(null);
    setTrainerDialogOpen(true);
  };

  const handleOpenDocs = (trainer: any) => {
    setDocTrainerId(trainer.id);
    setDocTrainerName(trainer.name ?? "Trainer");
    setSelectedTemplateId("");
    setSelectedProgramId("");
    setDocDialogOpen(true);
  };

  const filteredMedewerkers = medewerkers.filter((m) => {
    const q = searchQuery.toLowerCase();
    return m.naam.toLowerCase().includes(q) || m.rol.toLowerCase().includes(q) || m.specialisatie.toLowerCase().includes(q);
  });

  const filteredTrainers = trainers.filter((t: any) => {
    const q = searchQuery.toLowerCase();
    return (t.name?.toLowerCase().includes(q) || t.trade_name?.toLowerCase().includes(q) || t.city?.toLowerCase().includes(q));
  });

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteRole) { toast.error("Selecteer een rol"); return; }
    inviteMutation.mutate({ email: inviteEmail, full_name: inviteName, role: inviteRole });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-foreground">Medewerkers & Trainers</h1>
          <p className="text-sm text-muted-foreground">
            {loadingMedewerkers ? "Laden..." : `${medewerkers.length} teamleden, ${trainers.length} trainers`}
          </p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Zoek op naam, rol, handelsnaam of plaats..."
          className="w-full rounded-lg border border-input bg-card py-2.5 pl-10 pr-4 text-sm text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <Tabs defaultValue="trainers" className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="trainers">Trainers</TabsTrigger>
            <TabsTrigger value="medewerkers">Medewerkers</TabsTrigger>
          </TabsList>
        </div>

        {/* Trainers tab */}
        <TabsContent value="trainers" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={handleNewTrainer}>
              <Plus className="h-4 w-4" /> Trainer Toevoegen
            </Button>
          </div>

          {loadingTrainers ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredTrainers.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card py-16">
              <Building2 className="h-10 w-10 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">Nog geen trainers toegevoegd.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredTrainers.map((trainer: any) => (
                <div key={trainer.id} className="rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-sm font-bold text-card-foreground">{trainer.name}</p>
                      {trainer.trade_name && (
                        <p className="text-xs text-muted-foreground mt-0.5">{trainer.trade_name}</p>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleOpenDocs(trainer)} title="Documenten">
                        <FileText className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleEditTrainer(trainer)} title="Bewerken">
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5 border-t border-border pt-3">
                    {trainer.kvk_number && (
                      <p className="text-xs text-muted-foreground">KVK: {trainer.kvk_number}</p>
                    )}
                    {(trainer.address || trainer.postal_code || trainer.city) && (
                      <p className="text-xs text-muted-foreground">
                        {[trainer.address, trainer.postal_code, trainer.city].filter(Boolean).join(", ")}
                      </p>
                    )}
                    {trainer.email && (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3" /> {trainer.email}
                      </p>
                    )}
                    {trainer.phone && (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3" /> {trainer.phone}
                      </p>
                    )}
                    {(trainer.kvk_uittreksel_path || trainer.vog_path) && (
                      <div className="flex gap-2 pt-1">
                        {trainer.kvk_uittreksel_path && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-kanjer-groen"><CheckCircle2 className="h-3 w-3" />KVK</span>
                        )}
                        {trainer.vog_path && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-kanjer-groen"><CheckCircle2 className="h-3 w-3" />VOG</span>
                        )}
                      </div>
                    )}
                    <TrainerTrainings staffId={trainer.id} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Medewerkers tab */}
        <TabsContent value="medewerkers" className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4" /> Medewerker Uitnodigen
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Medewerker Uitnodigen</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleInvite} className="space-y-4">
                  <div>
                    <Label htmlFor="invite-name">Volledige naam</Label>
                    <Input id="invite-name" value={inviteName} onChange={(e) => setInviteName(e.target.value)} required placeholder="Jan de Vries" />
                  </div>
                  <div>
                    <Label htmlFor="invite-email">E-mailadres</Label>
                    <Input id="invite-email" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required placeholder="jan@kanjertraining.nl" />
                  </div>
                  <div>
                    <Label>Rol</Label>
                    <Select value={inviteRole} onValueChange={setInviteRole}>
                      <SelectTrigger><SelectValue placeholder="Selecteer een rol" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="trainer">Trainer</SelectItem>
                        <SelectItem value="backoffice">Backoffice</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit" className="w-full" disabled={inviteMutation.isPending}>
                    {inviteMutation.isPending ? <><Loader2 className="h-4 w-4 animate-spin" /> Versturen...</> : "Uitnodiging Versturen"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          {loadingMedewerkers ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredMedewerkers.map((person) => (
                <div key={person.user_id} className="rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 font-display text-sm font-bold text-primary">
                      {person.naam.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-sm font-bold text-card-foreground">{person.naam}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${rolColors[person.rol] || ""}`}>
                          {rolLabels[person.rol] || person.rol}
                        </span>
                        {person.specialisatie && <span className="text-xs text-muted-foreground">{person.specialisatie}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2 border-t border-border pt-3">
                    {person.email && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Mail className="h-3.5 w-3.5" /> {person.email}</p>}
                    {person.telefoon && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Phone className="h-3.5 w-3.5" /> {person.telefoon}</p>}
                    {person.actieveGroepen > 0 && <p className="text-xs font-medium text-kanjer-groen">{person.actieveGroepen} actieve groep{person.actieveGroepen > 1 ? "en" : ""}</p>}
                  </div>
                </div>
              ))}
              {filteredMedewerkers.length === 0 && <p className="col-span-full py-8 text-center text-sm text-muted-foreground">Geen medewerkers gevonden.</p>}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Trainer add/edit dialog */}
      <Dialog open={trainerDialogOpen} onOpenChange={(open) => { setTrainerDialogOpen(open); if (!open) { setEditingTrainerId(null); setTrainerForm(emptyTrainerForm); } }}>
        <DialogContent className="bg-card">
          <DialogHeader>
            <DialogTitle>{editingTrainerId ? "Trainer Bewerken" : "Trainer Toevoegen"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto">
            <div>
              <Label>Naam *</Label>
              <Input value={trainerForm.name} onChange={(e) => setTrainerForm(f => ({ ...f, name: e.target.value }))} placeholder="Jan Jansen" />
            </div>
            <div>
              <Label>Handelsnaam</Label>
              <Input value={trainerForm.trade_name} onChange={(e) => setTrainerForm(f => ({ ...f, trade_name: e.target.value }))} placeholder="Kanjertraining Rotterdam" />
            </div>
            <div>
              <Label>KVK-nummer</Label>
              <Input value={trainerForm.kvk_number} onChange={(e) => setTrainerForm(f => ({ ...f, kvk_number: e.target.value }))} placeholder="12345678" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Postcode</Label>
                <Input value={trainerForm.postal_code} onChange={(e) => setTrainerForm(f => ({ ...f, postal_code: e.target.value }))} placeholder="3011 AA" />
              </div>
              <div className="col-span-2">
                <Label>Adres</Label>
                <Input value={trainerForm.address} onChange={(e) => setTrainerForm(f => ({ ...f, address: e.target.value }))} placeholder="Coolsingel 1" />
              </div>
            </div>
            <div>
              <Label>Plaats</Label>
              <Input value={trainerForm.city} onChange={(e) => setTrainerForm(f => ({ ...f, city: e.target.value }))} placeholder="Rotterdam" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Telefoon</Label>
                <Input type="tel" value={trainerForm.phone} onChange={(e) => setTrainerForm(f => ({ ...f, phone: e.target.value }))} placeholder="06-12345678" />
              </div>
              <div>
                <Label>E-mail</Label>
                <Input type="email" value={trainerForm.email} onChange={(e) => setTrainerForm(f => ({ ...f, email: e.target.value }))} placeholder="jan@voorbeeld.nl" />
              </div>
            </div>
            <div>
              <Label>Type trainer</Label>
              <Select value={trainerForm.trainer_type} onValueChange={(v) => setTrainerForm(f => ({ ...f, trainer_type: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecteer type..." /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="kindtrainer">Kindtrainer</SelectItem>
                  <SelectItem value="oudertrainer">Oudertrainer</SelectItem>
                  <SelectItem value="beide">Ouder- & Kindtrainer</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={() => trainerMutation.mutate()} disabled={!trainerForm.name || trainerMutation.isPending}>
              {trainerMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {editingTrainerId ? "Opslaan" : "Toevoegen"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Trainer dossier dialog */}
      <Dialog open={docDialogOpen} onOpenChange={(open) => { setDocDialogOpen(open); if (!open) { setDocTrainerId(null); setSelectedTemplateId(""); } }}>
        <DialogContent className="max-w-lg bg-card">
          <DialogHeader>
            <DialogTitle>Dossier – {docTrainerName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 max-h-[70vh] overflow-y-auto">
            {/* KVK Uittreksel & VOG section */}
            <DossierDocumentSection
              trainerId={docTrainerId}
              trainerName={docTrainerName}
              onRefresh={() => queryClient.invalidateQueries({ queryKey: ["trainers"] })}
              trainer={trainers.find((t: any) => t.id === docTrainerId)}
            />

            {/* Generate new document */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Document Genereren</p>
              {docTemplates.length === 0 ? (
                <p className="text-sm text-muted-foreground">Geen templates beschikbaar. Upload templates via de Documenten-pagina.</p>
              ) : (
                <div className="space-y-3">
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
                  </div>
                  {trainerPrograms.length > 0 && (
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Programma (optioneel)</Label>
                      <Select value={selectedProgramId} onValueChange={setSelectedProgramId}>
                        <SelectTrigger><SelectValue placeholder="Selecteer een programma..." /></SelectTrigger>
                        <SelectContent className="bg-popover">
                          {trainerPrograms.map((p: any) => (
                            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <Button className="w-full" onClick={() => generateDocMutation.mutate()} disabled={!selectedTemplateId || generateDocMutation.isPending}>
                    {generateDocMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                    Document Genereren
                  </Button>
                </div>
              )}
            </div>

            {/* Generated documents list */}
            {trainerDocs.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Gegenereerde Documenten</p>
                {trainerDocs.map((doc: any) => (
                  <div key={doc.id} className="flex items-center justify-between gap-2 rounded-lg border border-border p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-card-foreground truncate">{doc.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {doc.document_templates?.name ?? "—"} • {format(new Date(doc.created_at), "d MMM yyyy HH:mm", { locale: nl })}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => handleDownloadDoc(doc)}>
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => { if (confirm(`"${doc.file_name}" verwijderen?`)) deleteDocMutation.mutate(doc); }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Facturen sectie */}
            {docTrainerId && (
              <div className="border-t border-border pt-4">
                <InvoiceManager staffId={docTrainerId} staffName={docTrainerName} />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DossierDocumentSection({ trainerId, trainerName, onRefresh, trainer }: { trainerId: string | null; trainerName: string; onRefresh: () => void; trainer: any }) {
  const kvkInputRef = useRef<HTMLInputElement>(null);
  const vogInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState<string | null>(null);

  if (!trainerId) return null;

  const handleUpload = async (type: "kvk_uittreksel" | "vog", file: File) => {
    setUploading(type);
    try {
      const ext = file.name.split(".").pop() || "pdf";
      const path = `${trainerId}/${type}_${Date.now()}.${ext}`;
      
      const { error: uploadError } = await supabase.storage
        .from("trainer-documents")
        .upload(path, file);
      if (uploadError) throw uploadError;

      const updateData = type === "kvk_uittreksel"
        ? { kvk_uittreksel_path: path, kvk_uittreksel_uploaded_at: new Date().toISOString() }
        : { vog_path: path, vog_uploaded_at: new Date().toISOString() };

      const { error: dbError } = await supabase.from("staff").update(updateData).eq("id", trainerId);
      if (dbError) throw dbError;

      toast.success(`${type === "kvk_uittreksel" ? "KVK uittreksel" : "VOG"} geüpload`);
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Upload mislukt");
    } finally {
      setUploading(null);
    }
  };

  const handleDownload = async (path: string, filename: string) => {
    const { data, error } = await supabase.storage.from("trainer-documents").download(path);
    if (error || !data) { toast.error("Download mislukt"); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const docs = [
    {
      key: "kvk_uittreksel" as const,
      label: "KVK Uittreksel",
      path: trainer?.kvk_uittreksel_path,
      date: trainer?.kvk_uittreksel_uploaded_at,
      inputRef: kvkInputRef,
    },
    {
      key: "vog" as const,
      label: "Positieve VOG",
      path: trainer?.vog_path,
      date: trainer?.vog_uploaded_at,
      inputRef: vogInputRef,
    },
  ];

  return (
    <div className="space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Dossier Documenten</p>
      {docs.map((doc) => (
        <div key={doc.key} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck className={`h-4 w-4 shrink-0 ${doc.path ? "text-kanjer-groen" : "text-muted-foreground"}`} />
            <div className="min-w-0">
              <p className="text-sm font-medium text-card-foreground">{doc.label}</p>
              {doc.path && doc.date ? (
                <p className="text-xs text-muted-foreground">
                  Geüpload op {format(new Date(doc.date), "d MMM yyyy", { locale: nl })}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Nog niet geüpload</p>
              )}
            </div>
          </div>
          <div className="flex gap-1">
            {doc.path && (
              <Button variant="ghost" size="icon" onClick={() => handleDownload(doc.path!, `${doc.label} - ${trainerName}.pdf`)}>
                <Download className="h-4 w-4" />
              </Button>
            )}
            <input
              ref={doc.inputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(doc.key, file);
                e.target.value = "";
              }}
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => doc.inputRef.current?.click()}
              disabled={uploading === doc.key}
            >
              {uploading === doc.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
