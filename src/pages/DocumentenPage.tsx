import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Upload, Trash2, Loader2, File, Plus, Copy, Download,
  Search, FileSpreadsheet, FilePdf, UserCircle, Building2, GraduationCap, Eye
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

const PLACEHOLDER_GROUPS = [
  {
    label: "Cliënt",
    items: [
      "{{client_voornaam}}", "{{client_achternaam}}", "{{client_geboortedatum}}", "{{client_leeftijd}}",
      "{{client_adres}}", "{{client_postcode}}", "{{client_plaats}}", "{{client_geslacht}}",
      "{{client_school}}", "{{client_klas}}",
    ],
  },
  {
    label: "Ouder/Verzorger",
    items: ["{{ouder_naam}}", "{{ouder_telefoon}}", "{{ouder_telefoon_alt}}", "{{ouder_email}}"],
  },
  {
    label: "Verwijzing",
    items: ["{{verwijzer_naam}}", "{{verwijzer_functie}}", "{{verwijsreden}}", "{{intake_datum}}"],
  },
  {
    label: "Trainer",
    items: [
      "{{trainer_naam}}", "{{trainer_handelsnaam}}", "{{trainer_kvk}}", "{{trainer_adres}}",
      "{{trainer_postcode}}", "{{trainer_plaats}}", "{{trainer_telefoon}}", "{{trainer_email}}", "{{trainer_specialisatie}}",
    ],
  },
  {
    label: "School",
    items: [
      "{{school_naam}}", "{{school_adres}}", "{{school_email}}", "{{school_telefoon}}",
      "{{school_website}}", "{{school_leerlingen}}", "{{school_wijk}}", "{{school_gebied}}",
    ],
  },
  {
    label: "Programma",
    items: [
      "{{programma_naam}}", "{{programma_start}}", "{{programma_eind}}",
      "{{programma_school}}", "{{programma_wijk}}", "{{programma_gebied}}",
    ],
  },
  {
    label: "Overig",
    items: ["{{doelen}}", "{{intake_notities}}", "{{datum_vandaag}}"],
  },
];

const PLACEHOLDER_OPTIONS = PLACEHOLDER_GROUPS.flatMap((g) => g.items);

const categoryLabels: Record<string, string> = {
  certificaat: "Certificaat",
  verslag: "Verslag",
  brief: "Brief",
  overeenkomst: "Overeenkomst",
  overig: "Overig",
};

// ── Templates Tab ──────────────────────────────────────────────
function TemplatesTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateCategory, setTemplateCategory] = useState("overig");
  const [builderName, setBuilderName] = useState("");
  const [builderCategory, setBuilderCategory] = useState("overig");
  const [builderContent, setBuilderContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [detailTemplate, setDetailTemplate] = useState<any>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["document-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("document_templates")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!uploadFile || !templateName) throw new Error("Vul alle velden in");
      const ext = uploadFile.name.split(".").pop()?.toLowerCase();
      if (!["docx"].includes(ext ?? "")) throw new Error("Alleen .docx bestanden toegestaan");
      const filePath = `${crypto.randomUUID()}.${ext}`;
      const { error: storageError } = await supabase.storage
        .from("document-templates")
        .upload(filePath, uploadFile);
      if (storageError) throw storageError;

      // Auto-detect placeholders by scanning the docx
      const { data, error: detectErr } = await supabase.functions.invoke("convert-template", {
        body: { template_id: "auto-detect", file_path: filePath, name: templateName, category: templateCategory },
      });

      // If auto-detect fails, just save without placeholders
      if (detectErr || data?.error) {
        const { error: dbError } = await supabase
          .from("document_templates")
          .insert({ name: templateName, file_path: filePath, category: templateCategory, placeholder_fields: [] });
        if (dbError) throw dbError;
      }
    },
    onSuccess: () => {
      toast({ title: "Template geüpload", description: "Placeholders zijn automatisch gedetecteerd." });
      setUploadOpen(false);
      setUploadFile(null);
      setTemplateName("");
      setTemplateCategory("overig");
      queryClient.invalidateQueries({ queryKey: ["document-templates"] });
    },
    onError: (err: any) => toast({ title: "Fout", description: err.message, variant: "destructive" }),
  });

  const buildMutation = useMutation({
    mutationFn: async () => {
      if (!builderName || !builderContent.trim()) throw new Error("Vul naam en inhoud in");
      const { data, error } = await supabase.functions.invoke("build-template", {
        body: { name: builderName, category: builderCategory, content: builderContent },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast({ title: "Template aangemaakt" });
      setBuilderOpen(false);
      setBuilderName("");
      setBuilderCategory("overig");
      setBuilderContent("");
      queryClient.invalidateQueries({ queryKey: ["document-templates"] });
    },
    onError: (err: any) => toast({ title: "Fout", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (template: any) => {
      await supabase.storage.from("document-templates").remove([template.file_path]);
      const { error } = await supabase.from("document_templates").delete().eq("id", template.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Template verwijderd" });
      queryClient.invalidateQueries({ queryKey: ["document-templates"] });
    },
    onError: (err: any) => toast({ title: "Fout", description: err.message, variant: "destructive" }),
  });

  const handleDownload = async (template: any) => {
    const { data, error } = await supabase.storage.from("document-templates").download(template.file_path);
    if (error || !data) { toast({ title: "Download mislukt", variant: "destructive" }); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${template.name}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const insertPlaceholder = (placeholder: string) => {
    const textarea = textareaRef.current;
    if (!textarea) { setBuilderContent((prev) => prev + placeholder); return; }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newContent = builderContent.substring(0, start) + placeholder + builderContent.substring(end);
    setBuilderContent(newContent);
    requestAnimationFrame(() => {
      textarea.focus();
      const newPos = start + placeholder.length;
      textarea.setSelectionRange(newPos, newPos);
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2 justify-end">
        {/* Builder Dialog */}
        <Dialog open={builderOpen} onOpenChange={setBuilderOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4" /> Template Maken</Button>
          </DialogTrigger>
          <DialogContent className="bg-card max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Nieuwe Template Maken</DialogTitle></DialogHeader>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Naam</Label><Input value={builderName} onChange={(e) => setBuilderName(e.target.value)} placeholder="bijv. Certificaat Kanjertraining" /></div>
                  <div>
                    <Label>Categorie</Label>
                    <Select value={builderCategory} onValueChange={setBuilderCategory}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-popover">
                        {Object.entries(categoryLabels).map(([val, label]) => (<SelectItem key={val} value={val}>{label}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Inhoud</Label>
                  <p className="text-xs text-muted-foreground mb-1">Gebruik # voor koppen, --- voor lijnen. Klik op een placeholder rechts om in te voegen.</p>
                  <Textarea ref={textareaRef} value={builderContent} onChange={(e) => setBuilderContent(e.target.value)} placeholder={`# Certificaat\n\nHierbij verklaren wij dat {{client_voornaam}} {{client_achternaam}} het programma {{programma_naam}} succesvol heeft afgerond.\n\nDatum: {{datum_vandaag}}\nTrainer: {{trainer_naam}}`} className="min-h-[350px] font-mono text-sm" />
                </div>
                <Button className="w-full" onClick={() => buildMutation.mutate()} disabled={!builderName || !builderContent.trim() || buildMutation.isPending}>
                  {buildMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Template Opslaan
                </Button>
              </div>
              <div className="space-y-3 border-l border-border pl-4">
                <p className="text-sm font-semibold text-foreground">Placeholders</p>
                <p className="text-xs text-muted-foreground">Klik om in te voegen op cursorpositie</p>
                <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                  {PLACEHOLDER_GROUPS.map((group) => (
                    <div key={group.label}>
                      <p className="text-xs font-medium text-muted-foreground mb-1">{group.label}</p>
                      <div className="flex flex-wrap gap-1">
                        {group.items.map((p) => (
                          <button key={p} type="button" onClick={() => insertPlaceholder(p)} className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-mono text-primary hover:bg-primary/20 transition-colors cursor-pointer">
                            {p.replace(/\{\{|\}\}/g, "")}<Copy className="h-2.5 w-2.5 opacity-50" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Upload Dialog */}
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogTrigger asChild>
            <Button variant="outline"><Upload className="h-4 w-4" /> Word Uploaden</Button>
          </DialogTrigger>
          <DialogContent className="bg-card">
            <DialogHeader><DialogTitle>Word Template Uploaden</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Upload een .docx bestand. Placeholders zoals <code className="bg-muted px-1 rounded text-xs">{"{{client_voornaam}}"}</code> worden automatisch gedetecteerd. De originele opmaak blijft volledig behouden.</p>
              <div><Label>Naam</Label><Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="bijv. Overeenkomst Trainer" /></div>
              <div>
                <Label>Categorie</Label>
                <Select value={templateCategory} onValueChange={setTemplateCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-popover">
                    {Object.entries(categoryLabels).map(([val, label]) => (<SelectItem key={val} value={val}>{label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Bestand (.docx)</Label><Input type="file" accept=".docx" onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)} /></div>
              <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                <p className="font-semibold mb-1">Tip: Gebruik deze placeholders in je Word-bestand:</p>
                <div className="flex flex-wrap gap-1">
                  {PLACEHOLDER_OPTIONS.slice(0, 12).map((p) => (<Badge key={p} variant="secondary" className="text-[10px]">{p}</Badge>))}
                  <Badge variant="secondary" className="text-[10px]">...en {PLACEHOLDER_OPTIONS.length - 12} meer</Badge>
                </div>
              </div>
              <Button className="w-full" onClick={() => uploadMutation.mutate()} disabled={!uploadFile || !templateName || uploadMutation.isPending}>
                {uploadMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Uploaden
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Detail dialog */}
      <Dialog open={!!detailTemplate} onOpenChange={(o) => !o && setDetailTemplate(null)}>
        <DialogContent className="bg-card">
          <DialogHeader><DialogTitle>{detailTemplate?.name}</DialogTitle></DialogHeader>
          {detailTemplate && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Badge variant="secondary">{categoryLabels[detailTemplate.category] ?? detailTemplate.category}</Badge>
                <span className="text-xs text-muted-foreground">Geüpload op {format(new Date(detailTemplate.created_at), "d MMM yyyy", { locale: nl })}</span>
              </div>
              <div>
                <p className="text-sm font-medium mb-2">Placeholders in dit template ({detailTemplate.placeholder_fields?.length ?? 0}):</p>
                <div className="flex flex-wrap gap-1">
                  {(detailTemplate.placeholder_fields ?? []).map((p: string) => (
                    <Badge key={p} variant="outline" className="text-[10px] font-mono">{p}</Badge>
                  ))}
                  {(!detailTemplate.placeholder_fields || detailTemplate.placeholder_fields.length === 0) && (
                    <p className="text-xs text-muted-foreground">Geen placeholders gedetecteerd</p>
                  )}
                </div>
              </div>
              <Button className="w-full" onClick={() => { handleDownload(detailTemplate); setDetailTemplate(null); }}>
                <Download className="h-4 w-4" /> Download Template
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card py-16">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10"><FileText className="h-7 w-7 text-primary" /></div>
          <h2 className="mt-4 font-display text-lg font-bold text-card-foreground">Nog geen templates</h2>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">Upload een Word-bestand (.docx) met placeholders of maak een template aan in de editor.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Naam</TableHead>
                <TableHead>Categorie</TableHead>
                <TableHead>Placeholders</TableHead>
                <TableHead>Geüpload</TableHead>
                <TableHead className="text-right">Acties</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((t: any) => (
                <TableRow key={t.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setDetailTemplate(t)}>
                  <TableCell>
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <File className="h-4 w-4 text-primary" />{t.name}
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="secondary">{categoryLabels[t.category] ?? t.category}</Badge></TableCell>
                  <TableCell><span className="text-xs text-muted-foreground">{t.placeholder_fields?.length ?? 0} velden</span></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{format(new Date(t.created_at), "d MMM yyyy", { locale: nl })}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end" onClick={(e) => e.stopPropagation()}>
                      <Button variant="ghost" size="icon" onClick={() => handleDownload(t)} title="Download"><Download className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => { if (confirm(`Template "${t.name}" verwijderen?`)) deleteMutation.mutate(t); }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ── Generate Tab ───────────────────────────────────────────────
function GenerateTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [entityType, setEntityType] = useState<"client" | "staff" | "school">("client");
  const [selectedEntity, setSelectedEntity] = useState("");
  const [selectedProgram, setSelectedProgram] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [outputFormat, setOutputFormat] = useState<"docx">("docx");

  const { data: templates = [] } = useQuery({
    queryKey: ["document-templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("document_templates").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: ["clients-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, first_name, last_name").order("first_name");
      if (error) throw error;
      return data;
    },
    enabled: entityType === "client",
  });

  const { data: staffList = [] } = useQuery({
    queryKey: ["staff-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("staff").select("id, name, trade_name").order("name");
      if (error) throw error;
      return data;
    },
    enabled: entityType === "staff",
  });

  const { data: schools = [] } = useQuery({
    queryKey: ["schools-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
    enabled: entityType === "school",
  });

  const { data: programs = [] } = useQuery({
    queryKey: ["programs-for-generate"],
    queryFn: async () => {
      const { data, error } = await supabase.from("programs").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
    enabled: entityType === "staff",
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplate) throw new Error("Selecteer een template");
      if (!selectedEntity) throw new Error("Selecteer een entiteit");

      const body: any = { template_id: selectedTemplate };
      if (entityType === "client") body.client_id = selectedEntity;
      if (entityType === "staff") {
        body.staff_id = selectedEntity;
        if (selectedProgram) body.program_id = selectedProgram;
      }
      if (entityType === "school") body.school_id = selectedEntity;

      const { data, error } = await supabase.functions.invoke("generate-document", { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: async (data) => {
      toast({ title: "Document gegenereerd", description: data.file_name });
      queryClient.invalidateQueries({ queryKey: ["generated-documents"] });

      // Auto-download
      const { data: fileData, error } = await supabase.storage
        .from("generated-documents")
        .download(data.file_path);
      if (!error && fileData) {
        const url = URL.createObjectURL(fileData);
        const a = document.createElement("a");
        a.href = url;
        a.download = data.file_name;
        a.click();
        URL.revokeObjectURL(url);
      }
    },
    onError: (err: any) => toast({ title: "Fout bij genereren", description: err.message, variant: "destructive" }),
  });

  const entities = entityType === "client"
    ? clients.map((c: any) => ({ id: c.id, label: `${c.first_name} ${c.last_name}` }))
    : entityType === "staff"
    ? staffList.map((s: any) => ({ id: s.id, label: s.name || s.trade_name || "Onbekend" }))
    : schools.map((s: any) => ({ id: s.id, label: s.name }));

  const filteredEntities = entities.filter((e) =>
    e.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedTemplateMeta = templates.find((t: any) => t.id === selectedTemplate);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left: Form */}
      <div className="lg:col-span-2 space-y-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Document Genereren</CardTitle>
            <CardDescription>Selecteer een template en vul de gegevens in om een document te genereren.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Step 1: Template */}
            <div>
              <Label className="text-sm font-semibold">1. Template kiezen</Label>
              <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Kies een template..." /></SelectTrigger>
                <SelectContent className="bg-popover">
                  {templates.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="flex items-center gap-2">
                        <FileText className="h-3 w-3" />
                        {t.name}
                        <Badge variant="secondary" className="text-[10px] ml-1">{categoryLabels[t.category] ?? t.category}</Badge>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Step 2: Entity Type */}
            <div>
              <Label className="text-sm font-semibold">2. Gegevens van</Label>
              <div className="flex gap-2 mt-1">
                {([
                  { value: "client", label: "Cliënt", icon: UserCircle },
                  { value: "staff", label: "Trainer", icon: GraduationCap },
                  { value: "school", label: "School", icon: Building2 },
                ] as const).map(({ value, label, icon: Icon }) => (
                  <Button
                    key={value}
                    variant={entityType === value ? "default" : "outline"}
                    size="sm"
                    onClick={() => { setEntityType(value); setSelectedEntity(""); setSearchTerm(""); }}
                  >
                    <Icon className="h-4 w-4" /> {label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Step 3: Select Entity */}
            <div>
              <Label className="text-sm font-semibold">
                3. {entityType === "client" ? "Cliënt" : entityType === "staff" ? "Trainer" : "School"} selecteren
              </Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  placeholder="Zoeken..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-border">
                {filteredEntities.length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground text-center">Geen resultaten</p>
                ) : (
                  filteredEntities.map((entity) => (
                    <button
                      key={entity.id}
                      type="button"
                      onClick={() => setSelectedEntity(entity.id)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors border-b border-border last:border-0 ${
                        selectedEntity === entity.id ? "bg-primary/10 text-primary font-medium" : ""
                      }`}
                    >
                      {entity.label}
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Step 3b: Program (optional for staff) */}
            {entityType === "staff" && selectedEntity && (
              <div>
                <Label className="text-sm font-semibold">3b. Programma koppelen (optioneel)</Label>
                <Select value={selectedProgram} onValueChange={setSelectedProgram}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Optioneel: kies een programma..." /></SelectTrigger>
                  <SelectContent className="bg-popover">
                    <SelectItem value="none">Geen programma</SelectItem>
                    {programs.map((p: any) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Generate Button */}
            <Button
              className="w-full"
              size="lg"
              onClick={() => generateMutation.mutate()}
              disabled={!selectedTemplate || !selectedEntity || generateMutation.isPending}
            >
              {generateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Document Genereren & Downloaden
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Right: Template info */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Template Info</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedTemplateMeta ? (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium">{selectedTemplateMeta.name}</p>
                  <Badge variant="secondary" className="text-[10px] mt-1">{categoryLabels[selectedTemplateMeta.category] ?? selectedTemplateMeta.category}</Badge>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Placeholders ({selectedTemplateMeta.placeholder_fields?.length ?? 0}):</p>
                  <div className="flex flex-wrap gap-1">
                    {(selectedTemplateMeta.placeholder_fields ?? []).map((p: string) => (
                      <Badge key={p} variant="outline" className="text-[9px] font-mono">{p}</Badge>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Selecteer een template om de details te bekijken.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Hoe werkt het?</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground space-y-2">
            <p><strong>1.</strong> Kies een template (Word-bestand met placeholders)</p>
            <p><strong>2.</strong> Selecteer het type gegevens (cliënt, trainer of school)</p>
            <p><strong>3.</strong> Kies de specifieke persoon/organisatie</p>
            <p><strong>4.</strong> Het document wordt gegenereerd met alle gegevens ingevuld, met behoud van de originele Word-opmaak</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Generated Documents Tab ────────────────────────────────────
function GeneratedDocsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["generated-documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("generated_documents")
        .select("*, document_templates(name), clients(first_name, last_name), staff(name), schools(name)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });

  const handleDownload = async (doc: any) => {
    const { data, error } = await supabase.storage.from("generated-documents").download(doc.file_path);
    if (error || !data) { toast({ title: "Download mislukt", variant: "destructive" }); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.file_name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const deleteMutation = useMutation({
    mutationFn: async (doc: any) => {
      await supabase.storage.from("generated-documents").remove([doc.file_path]);
      const { error } = await supabase.from("generated_documents").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Document verwijderd" });
      queryClient.invalidateQueries({ queryKey: ["generated-documents"] });
    },
    onError: (err: any) => toast({ title: "Fout", description: err.message, variant: "destructive" }),
  });

  const getEntityLabel = (doc: any) => {
    if (doc.clients) return `${doc.clients.first_name} ${doc.clients.last_name}`;
    if (doc.staff) return doc.staff.name;
    if (doc.schools) return doc.schools.name;
    return "-";
  };

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card py-16">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10"><File className="h-7 w-7 text-primary" /></div>
        <h2 className="mt-4 font-display text-lg font-bold text-card-foreground">Nog geen documenten</h2>
        <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">Genereer een document via het &apos;Genereren&apos; tabblad.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead>Document</TableHead>
            <TableHead>Template</TableHead>
            <TableHead>Voor</TableHead>
            <TableHead>Datum</TableHead>
            <TableHead className="text-right">Acties</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map((doc: any) => (
            <TableRow key={doc.id}>
              <TableCell>
                <button onClick={() => handleDownload(doc)} className="flex items-center gap-2 text-sm font-medium hover:underline">
                  <File className="h-4 w-4 text-primary" />{doc.file_name}
                </button>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{doc.document_templates?.name ?? "-"}</TableCell>
              <TableCell className="text-sm">{getEntityLabel(doc)}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{format(new Date(doc.created_at), "d MMM yyyy HH:mm", { locale: nl })}</TableCell>
              <TableCell className="text-right">
                <div className="flex gap-1 justify-end">
                  <Button variant="ghost" size="icon" onClick={() => handleDownload(doc)} title="Download"><Download className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => { if (confirm("Document verwijderen?")) deleteMutation.mutate(doc); }}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────
export default function DocumentenPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-foreground">Documenten</h1>
        <p className="text-sm text-muted-foreground">
          Beheer templates, genereer documenten en bekijk eerder gegenereerde bestanden
        </p>
      </div>

      <Tabs defaultValue="generate" className="w-full">
        <TabsList>
          <TabsTrigger value="generate"><FileText className="h-4 w-4 mr-1" /> Genereren</TabsTrigger>
          <TabsTrigger value="templates"><File className="h-4 w-4 mr-1" /> Templates</TabsTrigger>
          <TabsTrigger value="generated"><Download className="h-4 w-4 mr-1" /> Gegenereerd</TabsTrigger>
        </TabsList>

        <TabsContent value="generate" className="mt-4">
          <GenerateTab />
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <TemplatesTab />
        </TabsContent>

        <TabsContent value="generated" className="mt-4">
          <GeneratedDocsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
