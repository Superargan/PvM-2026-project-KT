import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { schoolKeys, documentKeys, clientKeys, staffKeys, programKeys } from "@/lib/queryKeys";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  FileText, Upload, Trash2, Loader2, File, Plus, Copy, Download,
  Search, UserCircle, Building2, GraduationCap, Eye, Pencil, Save, ArrowLeft, X, Calendar
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
    label: "Deelnemer",
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
      "{{programma_naam}}", "{{programma_nummer}}", "{{programma_start}}", "{{programma_eind}}",
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
  voorovereenkomst: "Voorovereenkomst",
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
  const [editingTemplate, setEditingTemplate] = useState<any>(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: documentKeys.templates,
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

      const { data: inserted, error: dbError } = await supabase
        .from("document_templates")
        .insert({ name: templateName, file_path: filePath, category: templateCategory, placeholder_fields: [] })
        .select("id")
        .single();
      if (dbError) throw dbError;

      try {
        await supabase.functions.invoke("convert-template", {
          body: { template_id: inserted.id },
        });
      } catch {
        // Detection is optional
      }
    },
    onSuccess: () => {
      toast({ title: "Template geüpload", description: "Placeholders zijn automatisch gedetecteerd." });
      setUploadOpen(false);
      setUploadFile(null);
      setTemplateName("");
      setTemplateCategory("overig");
      queryClient.invalidateQueries({ queryKey: documentKeys.templates });
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
      queryClient.invalidateQueries({ queryKey: documentKeys.templates });
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
      queryClient.invalidateQueries({ queryKey: documentKeys.templates });
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

  // If editing a template, show the editor
  if (editingTemplate) {
    return (
      <TemplateEditor
        template={editingTemplate}
        onClose={() => {
          setEditingTemplate(null);
          queryClient.invalidateQueries({ queryKey: documentKeys.templates });
        }}
      />
    );
  }

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
                            {p}<Copy className="h-2.5 w-2.5 opacity-50" />
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
                <TableRow key={t.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setEditingTemplate(t)}>
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
                      <Button variant="ghost" size="icon" onClick={() => setEditingTemplate(t)} title="Bekijken & Bewerken"><Eye className="h-4 w-4" /></Button>
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

// ── Template Editor ────────────────────────────────────────────
interface DocParagraph {
  index: number;
  text: string;
  style: string;
}

interface DocSection {
  part: string;
  paragraphs: DocParagraph[];
}

interface InsertedParagraph {
  id: string;
  afterIndex: number; // -1 = at the very beginning
  text: string;
  style: string;
}

function TemplateEditor({ template, onClose }: { template: any; onClose: () => void }) {
  const { toast } = useToast();
  const [sections, setSections] = useState<DocSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editedTexts, setEditedTexts] = useState<Record<string, Record<number, string>>>({});
  const [insertedParagraphs, setInsertedParagraphs] = useState<Record<string, InsertedParagraph[]>>({});
  const [newInsertedFocusId, setNewInsertedFocusId] = useState<string | null>(null);
  const [dropCaret, setDropCaret] = useState<{ section: string; index: number; left: number } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editCategory, setEditCategory] = useState(template.category ?? "overig");

  useEffect(() => {
    loadTemplate();
  }, [template.id]);

  const loadTemplate = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("read-template", {
        body: { template_id: template.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setSections(data.sections);
      setEditedTexts({});
      setInsertedParagraphs({});
      setNewInsertedFocusId(null);
      setIsEditing(false);
    } catch (err: any) {
      toast({ title: "Fout bij laden", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleTextChange = (part: string, index: number, newText: string) => {
    setEditedTexts((prev) => ({
      ...prev,
      [part]: { ...prev[part], [index]: newText },
    }));
  };

  const categoryChanged = editCategory !== (template.category ?? "overig");
  const hasChanges = Object.values(editedTexts).some((section) => Object.keys(section).length > 0) ||
    Object.values(insertedParagraphs).some((arr) => arr.length > 0) ||
    categoryChanged;

  const addParagraph = (sectionPart: string, afterIndex: number) => {
    const id = crypto.randomUUID();
    setNewInsertedFocusId(id);
    setInsertedParagraphs((prev) => ({
      ...prev,
      [sectionPart]: [
        ...(prev[sectionPart] ?? []),
        { id, afterIndex, text: "", style: "normal" },
      ],
    }));
  };

  const updateInsertedText = (sectionPart: string, id: string, text: string) => {
    setInsertedParagraphs((prev) => ({
      ...prev,
      [sectionPart]: (prev[sectionPart] ?? []).map((p) => p.id === id ? { ...p, text } : p),
    }));
  };

  const removeInsertedParagraph = (sectionPart: string, id: string) => {
    setInsertedParagraphs((prev) => ({
      ...prev,
      [sectionPart]: (prev[sectionPart] ?? []).filter((p) => p.id !== id),
    }));
  };

  const handleSave = async () => {
    if (!hasChanges) return;
    setSaving(true);
    try {
      // Convert inserted paragraphs to inserts format: { sectionPart: [{ afterIndex, text }] }
      const inserts: Record<string, { afterIndex: number; text: string }[]> = {};
      for (const [part, paragraphs] of Object.entries(insertedParagraphs)) {
        if (paragraphs.length > 0) {
          inserts[part] = paragraphs.map((p) => ({ afterIndex: p.afterIndex, text: p.text }));
        }
      }

      // Save category change if needed
      if (categoryChanged) {
        const { error: catErr } = await supabase
          .from("document_templates")
          .update({ category: editCategory })
          .eq("id", template.id);
        if (catErr) throw catErr;
        template.category = editCategory;
      }

      // Save content changes if any
      const hasContentChanges = Object.values(editedTexts).some((s) => Object.keys(s).length > 0) ||
        Object.values(insertedParagraphs).some((arr) => arr.length > 0);

      if (hasContentChanges) {
        const { data, error } = await supabase.functions.invoke("update-template", {
          body: { template_id: template.id, updates: editedTexts, inserts },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);
      }

      toast({ title: "Template opgeslagen", description: "Wijzigingen zijn opgeslagen." });
      await loadTemplate();
    } catch (err: any) {
      toast({ title: "Opslaan mislukt", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const insertPlaceholderAtCursor = (placeholder: string) => {
    const activeEl = document.activeElement;
    if (activeEl && activeEl instanceof HTMLInputElement) {
      const start = activeEl.selectionStart ?? activeEl.value.length;
      const end = activeEl.selectionEnd ?? start;
      const newValue = activeEl.value.substring(0, start) + placeholder + activeEl.value.substring(end);

      const sectionPart = activeEl.getAttribute("data-section");
      const paragraphIndex = activeEl.getAttribute("data-index");
      if (sectionPart && paragraphIndex != null) {
        handleTextChange(sectionPart, parseInt(paragraphIndex), newValue);
      }

      requestAnimationFrame(() => {
        const newPos = start + placeholder.length;
        activeEl.focus();
        activeEl.setSelectionRange(newPos, newPos);
      });
    }
  };

  const sectionLabels: Record<string, string> = {
    document: "Document",
    header1: "Koptekst 1",
    header2: "Koptekst 2",
    footer1: "Voettekst 1",
    footer2: "Voettekst 2",
  };

  const styleClasses: Record<string, string> = {
    heading1: "text-xl font-bold",
    heading2: "text-lg font-semibold",
    heading3: "text-base font-semibold",
    normal: "text-sm",
    hr: "border-b border-border",
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-sm text-muted-foreground">Template laden...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-lg font-bold text-foreground">{template.name}</h2>
            <div className="flex items-center gap-2 mt-0.5">
              {isEditing ? (
                <Select value={editCategory} onValueChange={setEditCategory}>
                  <SelectTrigger className="h-7 w-auto text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    {Object.entries(categoryLabels).map(([val, label]) => (
                      <SelectItem key={val} value={val}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant="secondary">{categoryLabels[template.category] ?? template.category}</Badge>
              )}
              <span className="text-xs text-muted-foreground">{template.placeholder_fields?.length ?? 0} placeholders</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button variant="outline" size="sm" onClick={() => { setIsEditing(false); setEditedTexts({}); setInsertedParagraphs({}); setEditCategory(template.category ?? "overig"); }}>
                <X className="h-4 w-4" /> Annuleren
              </Button>
              <Button size="sm" onClick={handleSave} disabled={!hasChanges || saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Opslaan
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => setIsEditing(true)}>
              <Pencil className="h-4 w-4" /> Bewerken
            </Button>
          )}
        </div>
      </div>

      <div className={`grid gap-6 ${isEditing ? "grid-cols-1 lg:grid-cols-4" : "grid-cols-1"}`}>
        {/* Main content */}
        <div className={isEditing ? "lg:col-span-3" : ""}>
          {sections.map((section) => (
            <div key={section.part} className="mb-6">
              {section.part !== "document" && (
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="text-xs">{sectionLabels[section.part] ?? section.part}</Badge>
                </div>
              )}
              <Card>
                <CardContent className="p-6 space-y-1">
                  {isEditing && (
                    <div className="flex justify-center -mb-1">
                      <button
                        type="button"
                        onClick={() => addParagraph(section.part, -1)}
                        className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors opacity-0 hover:opacity-100 focus:opacity-100 py-0.5"
                        title="Regel toevoegen bovenaan"
                      >
                        <Plus className="h-3 w-3" /> regel toevoegen
                      </button>
                    </div>
                  )}
                  {/* Render inserted paragraphs before index 0 (afterIndex === -1) */}
                  {isEditing && (insertedParagraphs[section.part] ?? [])
                    .filter((ip) => ip.afterIndex === -1)
                    .map((ip) => (
                      <div key={ip.id} className="flex items-center gap-1">
                        <Input
                          value={ip.text}
                          onChange={(e) => updateInsertedText(section.part, ip.id, e.target.value)}
                          className="border-0 border-b border-dashed border-primary/40 rounded-none px-1 text-sm bg-primary/5 flex-1"
                          placeholder="Nieuwe regel..."
                          autoFocus={newInsertedFocusId === ip.id}
                          onFocus={() => {
                            if (newInsertedFocusId === ip.id) setNewInsertedFocusId(null);
                          }}
                        />
                        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => removeInsertedParagraph(section.part, ip.id)}>
                          <X className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    ))
                  }
                  {section.paragraphs.map((p) => {
                    const currentText = editedTexts[section.part]?.[p.index] ?? p.text;

                    if (p.style === "hr") {
                      return <div key={p.index} className="border-b border-border my-3" />;
                    }

                    if (!isEditing) {
                      // View mode: render with placeholder highlighting
                      if (!p.text.trim()) return <div key={p.index} className="h-4" />;
                      return (
                        <p key={p.index} className={styleClasses[p.style] ?? "text-sm"}>
                          {renderWithPlaceholders(p.text)}
                        </p>
                      );
                    }

                    // Edit mode
                    return (
                      <div key={p.index}>
                        <div className="relative">
                          <Input
                            data-section={section.part}
                            data-index={p.index}
                            value={currentText}
                            onChange={(e) => handleTextChange(section.part, p.index, e.target.value)}
                            onDragOver={(e) => {
                              e.preventDefault();
                              e.dataTransfer.dropEffect = "copy";
                              const input = e.currentTarget as HTMLInputElement;
                              const rect = input.getBoundingClientRect();
                              const style = window.getComputedStyle(input);
                              const fontSize = parseFloat(style.fontSize) || 14;
                              const charWidth = fontSize * 0.6;
                              const paddingLeft = parseFloat(style.paddingLeft) || 0;
                              const dropX = e.clientX - rect.left - paddingLeft;
                              const caretLeft = Math.max(0, Math.min(dropX, currentText.length * charWidth));
                              setDropCaret({ section: section.part, index: p.index, left: paddingLeft + caretLeft });
                            }}
                            onDragLeave={() => setDropCaret(null)}
                            onDrop={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setDropCaret(null);
                              const placeholder = e.dataTransfer.getData("text/plain");
                              if (!placeholder) return;

                              const input = e.currentTarget as HTMLInputElement;
                              input.focus();

                              const rect = input.getBoundingClientRect();
                              const style = window.getComputedStyle(input);
                              const fontSize = parseFloat(style.fontSize) || 14;
                              const charWidth = fontSize * 0.6;
                              const paddingLeft = parseFloat(style.paddingLeft) || 0;
                              const dropX = e.clientX - rect.left - paddingLeft;
                              const dropPos = Math.max(0, Math.min(Math.round(dropX / charWidth), currentText.length));

                              const pos = Number.isFinite(dropPos) ? dropPos : (input.selectionStart ?? currentText.length);
                              const newValue = currentText.substring(0, pos) + placeholder + currentText.substring(pos);
                              handleTextChange(section.part, p.index, newValue);

                              requestAnimationFrame(() => {
                                const newPos = pos + placeholder.length;
                                input.setSelectionRange(newPos, newPos);
                                input.focus();
                              });
                            }}
                            className={`border-0 border-b border-transparent focus:border-primary rounded-none px-1 ${
                              styleClasses[p.style] ?? "text-sm"
                            } ${editedTexts[section.part]?.[p.index] !== undefined ? "bg-primary/5" : ""}`}
                            placeholder="(leeg)"
                          />
                          {dropCaret?.section === section.part && dropCaret?.index === p.index && (
                            <div
                              className="absolute top-1 bottom-1 w-0.5 bg-primary rounded-full pointer-events-none animate-pulse z-10"
                              style={{ left: `${dropCaret.left}px` }}
                            />
                          )}
                        </div>
                        {/* Inserted paragraphs after this index */}
                        {(insertedParagraphs[section.part] ?? [])
                          .filter((ip) => ip.afterIndex === p.index)
                          .map((ip) => (
                            <div key={ip.id} className="flex items-center gap-1 mt-1">
                              <Input
                                value={ip.text}
                                onChange={(e) => updateInsertedText(section.part, ip.id, e.target.value)}
                                className="border-0 border-b border-dashed border-primary/40 rounded-none px-1 text-sm bg-primary/5 flex-1"
                                placeholder="Nieuwe regel..."
                                autoFocus={newInsertedFocusId === ip.id}
                                onFocus={() => {
                                  if (newInsertedFocusId === ip.id) setNewInsertedFocusId(null);
                                }}
                              />
                              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => removeInsertedParagraph(section.part, ip.id)}>
                                <X className="h-3 w-3 text-destructive" />
                              </Button>
                            </div>
                          ))
                        }
                        <div className="flex justify-center">
                          <button
                            type="button"
                            onClick={() => addParagraph(section.part, p.index)}
                            className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors opacity-0 hover:opacity-100 focus:opacity-100 py-0.5"
                            title="Regel toevoegen"
                          >
                            <Plus className="h-3 w-3" /> regel toevoegen
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>
          ))}
        </div>

        {/* Placeholder sidebar (only in edit mode) */}
        {isEditing && (
          <div className="lg:sticky lg:top-4 lg:self-start space-y-3">
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm">Placeholders</CardTitle>
                <CardDescription className="text-xs">Sleep naar een veld of klik om in te voegen</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3 max-h-[70vh] overflow-y-auto">
                {PLACEHOLDER_GROUPS.map((group) => (
                  <div key={group.label}>
                    <p className="text-xs font-medium text-muted-foreground mb-1">{group.label}</p>
                    <div className="flex flex-wrap gap-1">
                      {group.items.map((p) => (
                        <button
                          key={p}
                          type="button"
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", p);
                            e.dataTransfer.effectAllowed = "copy";
                          }}
                          onClick={() => insertPlaceholderAtCursor(p)}
                          className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-mono text-primary hover:bg-primary/20 active:scale-95 transition-all cursor-grab active:cursor-grabbing"
                        >
                          {p}<Copy className="h-2.5 w-2.5 opacity-50" />
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

/** Render text with {{placeholder}} parts highlighted */
function renderWithPlaceholders(text: string) {
  const parts = text.split(/(\{\{[a-z_]+\}\})/g);
  return parts.map((part, i) => {
    if (/^\{\{[a-z_]+\}\}$/.test(part)) {
      return (
        <span
          key={i}
          className="inline-flex items-center rounded bg-primary/10 px-1 py-0.5 text-[11px] font-mono text-primary mx-0.5 cursor-pointer hover:bg-primary/20 transition-colors"
          onClick={() => navigator.clipboard.writeText(part)}
          title={`Klik om ${part} te kopiëren`}
        >
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

// ── Generate Tab ───────────────────────────────────────────────
function GenerateTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [entityType, setEntityType] = useState<"client" | "staff" | "school" | "program">("client");
  const [selectedEntity, setSelectedEntity] = useState("");
  const [selectedProgram, setSelectedProgram] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const outputFormat = "docx";
  const [selectedTrainers, setSelectedTrainers] = useState<string[]>([]);

  const { data: templates = [] } = useQuery({
    queryKey: documentKeys.templates,
    queryFn: async () => {
      const { data, error } = await supabase.from("document_templates").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: clients = [] } = useQuery({
    queryKey: clientKeys.forProgram,
    queryFn: async () => {
      const { data, error } = await supabase.from("clients").select("id, first_name, last_name").eq("archived", false).order("first_name");
      if (error) throw error;
      return data;
    },
    enabled: entityType === "client",
  });

  const { data: staffList = [] } = useQuery({
    queryKey: staffKeys.trainers,
    queryFn: async () => {
      const { data, error } = await supabase.from("staff").select("id, name, trade_name").eq("archived", false).order("name");
      if (error) throw error;
      return data;
    },
    enabled: entityType === "staff",
  });

  const { data: schools = [] } = useQuery({
    queryKey: schoolKeys.dropdown,
    queryFn: async () => {
      const { data, error } = await supabase.from("schools").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
    enabled: entityType === "school",
  });

  const { data: programs = [] } = useQuery({
    queryKey: programKeys.all,
    queryFn: async () => {
      const { data, error } = await supabase.from("programs").select("id, name, training_number, status").order("name");
      if (error) throw error;
      return data;
    },
    enabled: entityType === "staff" || entityType === "program",
  });

  // Fetch trainers for selected program
  const { data: programTrainers = [] } = useQuery({
    queryKey: programKeys.staffForDocs(selectedEntity),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("program_staff")
        .select("staff_id, role, staff:staff!program_staff_staff_id_fkey(id, name, trade_name)")
        .eq("program_id", selectedEntity)
        .in("role", ["trainer", "oudertrainer", "kindtrainer"]);
      if (error) throw error;
      return data ?? [];
    },
    enabled: entityType === "program" && !!selectedEntity,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTemplate) throw new Error("Selecteer een template");

      if (entityType === "program") {
        if (!selectedEntity) throw new Error("Selecteer een training");

        const isPraktijk4Kids = (staff: any) =>
          (staff?.trade_name || "").toLowerCase().replace(/\s/g, "").includes("praktijk4kids") ||
          (staff?.name || "").toLowerCase().replace(/\s/g, "").includes("praktijk4kids");

        // Filter out Praktijk4Kids trainers
        const eligibleTrainers = programTrainers.filter((t: any) => !isPraktijk4Kids(t.staff));

        const trainersToGenerate = selectedTrainers.length > 0
          ? selectedTrainers.filter((id: string) => eligibleTrainers.some((t: any) => t.staff_id === id))
          : eligibleTrainers.map((t: any) => t.staff_id);
        if (trainersToGenerate.length === 0) throw new Error("Geen trainers om documenten voor te genereren (Praktijk4Kids wordt overgeslagen)");

        const results = [];
        for (const staffId of trainersToGenerate) {
          const { data, error } = await supabase.functions.invoke("generate-document", {
            body: { template_id: selectedTemplate, staff_id: staffId, program_id: selectedEntity, output_format: outputFormat },
          });
          if (error) throw error;
          if (data?.error) throw new Error(data.error);
          results.push(data);
        }
        return results;
      }

      if (!selectedEntity) throw new Error("Selecteer een entiteit");
      const body: any = { template_id: selectedTemplate };
      if (entityType === "client") body.client_id = selectedEntity;
      if (entityType === "staff") {
        body.staff_id = selectedEntity;
        if (selectedProgram) body.program_id = selectedProgram;
      }
      if (entityType === "school") body.school_id = selectedEntity;

      body.output_format = outputFormat;
      const { data, error } = await supabase.functions.invoke("generate-document", { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: async (data) => {
      if (Array.isArray(data)) {
        toast({ title: `${data.length} overeenkomst(en) gegenereerd` });
        for (const doc of data) {
          const { data: fileData, error } = await supabase.storage
            .from("generated-documents")
            .download(doc.file_path);
          if (!error && fileData) {
            const url = URL.createObjectURL(fileData);
            const a = document.createElement("a");
            a.href = url;
            a.download = doc.file_name;
            a.click();
            URL.revokeObjectURL(url);
          }
        }
      } else {
        toast({ title: "Document gegenereerd", description: data.file_name });
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
      }
      queryClient.invalidateQueries({ queryKey: documentKeys.generated });
    },
    onError: (err: any) => toast({ title: "Fout bij genereren", description: err.message, variant: "destructive" }),
  });

  const entities = entityType === "client"
    ? clients.map((c: any) => ({ id: c.id, label: `${c.first_name} ${c.last_name}` }))
    : entityType === "staff"
    ? staffList.map((s: any) => ({ id: s.id, label: s.name || s.trade_name || "Onbekend" }))
    : entityType === "program"
    ? programs.map((p: any) => ({ id: p.id, label: `${p.name}${p.training_number ? ` (${p.training_number})` : ""}` }))
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
                  { value: "client", label: "Deelnemer", icon: UserCircle },
                  { value: "staff", label: "Trainer", icon: GraduationCap },
                  { value: "school", label: "School", icon: Building2 },
                  { value: "program", label: "Training", icon: Calendar },
                ] as const).map(({ value, label, icon: Icon }) => (
                  <Button
                    key={value}
                    variant={entityType === value ? "default" : "outline"}
                    size="sm"
                    onClick={() => { setEntityType(value); setSelectedEntity(""); setSearchTerm(""); setSelectedTrainers([]); }}
                  >
                    <Icon className="h-4 w-4" /> {label}
                  </Button>
                ))}
              </div>
            </div>

            {/* Step 3: Select Entity */}
            <div>
              <Label className="text-sm font-semibold">
                3. {entityType === "client" ? "Deelnemer" : entityType === "staff" ? "Trainer" : entityType === "program" ? "Training" : "School"} selecteren
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

            {/* Step 3b: Trainer selection for program type */}
            {entityType === "program" && selectedEntity && programTrainers.length > 0 && (
              <div>
                <Label className="text-sm font-semibold">3b. Trainers selecteren</Label>
                <p className="text-xs text-muted-foreground mb-2">Selecteer trainers of laat leeg om voor alle trainers te genereren.</p>
                <div className="flex flex-wrap gap-2">
                  {programTrainers.map((pt: any) => {
                    const name = pt.staff?.name || pt.staff?.trade_name || "Onbekend";
                    const roleLabel = pt.role === "oudertrainer" ? "ouder" : pt.role === "kindtrainer" ? "kind" : "";
                    const isSelected = selectedTrainers.includes(pt.staff_id);
                    return (
                      <Button
                        key={pt.staff_id}
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          setSelectedTrainers((prev) =>
                            isSelected ? prev.filter((id) => id !== pt.staff_id) : [...prev, pt.staff_id]
                          );
                        }}
                      >
                        {name}{roleLabel && <span className="ml-1 text-xs opacity-70">({roleLabel})</span>}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}

            {entityType === "program" && selectedEntity && programTrainers.length === 0 && (
              <p className="text-sm text-muted-foreground italic">Geen trainers gekoppeld aan deze training.</p>
            )}


            {/* Generate Button */}
            <Button
              className="w-full"
              size="lg"
              onClick={() => generateMutation.mutate()}
              disabled={!selectedTemplate || !selectedEntity || (entityType === "program" && programTrainers.length === 0) || generateMutation.isPending}
            >
              {generateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              {entityType === "program"
                ? `Overeenkomst(en) Genereren (${selectedTrainers.length || programTrainers.length} trainer${(selectedTrainers.length || programTrainers.length) !== 1 ? "s" : ""})`
                : `Document Genereren & Downloaden (${outputFormat.toUpperCase()})`}
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
                      <Badge
                        key={p}
                        variant="outline"
                        className="text-[9px] font-mono cursor-pointer hover:bg-primary/10 transition-colors"
                        onClick={() => {
                          navigator.clipboard.writeText(p);
                          toast({ title: "Gekopieerd", description: `${p} is naar het klembord gekopieerd.` });
                        }}
                      >
                        {p} <Copy className="h-2.5 w-2.5 ml-0.5 opacity-50" />
                      </Badge>
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
            <p><strong>2.</strong> Selecteer het type gegevens (deelnemer, trainer of school)</p>
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
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const signedFileRef = useRef<HTMLInputElement>(null);

  const { data: documents = [], isLoading } = useQuery({
    queryKey: documentKeys.generated,
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

  const handleDownload = async (filePath: string, fileName: string) => {
    const { data, error } = await supabase.storage.from("generated-documents").download(filePath);
    if (error || !data) { toast({ title: "Download mislukt", variant: "destructive" }); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const deleteMutation = useMutation({
    mutationFn: async (doc: any) => {
      await supabase.storage.from("generated-documents").remove([doc.file_path]);
      if (doc.signed_file_path) {
        await supabase.storage.from("generated-documents").remove([doc.signed_file_path]);
      }
      const { error } = await supabase.from("generated_documents").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Document verwijderd" });
      queryClient.invalidateQueries({ queryKey: documentKeys.generated });
    },
    onError: (err: any) => toast({ title: "Fout", description: err.message, variant: "destructive" }),
  });

  const uploadSignedMutation = useMutation({
    mutationFn: async ({ docId, file, doc }: { docId: string; file: File; doc: any }) => {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext !== "pdf") throw new Error("Alleen PDF-bestanden toegestaan");

      const storagePath = doc.client_id ? `${doc.client_id}` : doc.staff_id ? `trainers/${doc.staff_id}` : `schools/${doc.school_id}`;
      const signedPath = `${storagePath}/signed_${crypto.randomUUID()}.pdf`;
      const signedName = file.name;

      const { error: uploadErr } = await supabase.storage
        .from("generated-documents")
        .upload(signedPath, file, { contentType: "application/pdf" });
      if (uploadErr) throw uploadErr;

      const { error: updateErr } = await supabase
        .from("generated_documents")
        .update({
          signed_file_path: signedPath,
          signed_file_name: signedName,
          signed_at: new Date().toISOString(),
        } as any)
        .eq("id", docId);
      if (updateErr) throw updateErr;
    },
    onSuccess: () => {
      toast({ title: "Ondertekend document geüpload" });
      setUploadingId(null);
      queryClient.invalidateQueries({ queryKey: documentKeys.generated });
    },
    onError: (err: any) => {
      toast({ title: "Upload mislukt", description: err.message, variant: "destructive" });
      setUploadingId(null);
    },
  });

  const handleSignedUpload = (doc: any) => {
    setUploadingId(doc.id);
    signedFileRef.current?.click();
  };

  const handleSignedFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingId) { setUploadingId(null); return; }
    const doc = documents.find((d: any) => d.id === uploadingId);
    if (!doc) return;
    uploadSignedMutation.mutate({ docId: uploadingId, file, doc });
    e.target.value = "";
  };

  const removeSignedMutation = useMutation({
    mutationFn: async (doc: any) => {
      if (doc.signed_file_path) {
        await supabase.storage.from("generated-documents").remove([doc.signed_file_path]);
      }
      const { error } = await supabase
        .from("generated_documents")
        .update({ signed_file_path: null, signed_file_name: null, signed_at: null } as any)
        .eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Ondertekend document verwijderd" });
      queryClient.invalidateQueries({ queryKey: documentKeys.generated });
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
    <div className="space-y-2">
      <input
        ref={signedFileRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={handleSignedFileChange}
      />
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Document</TableHead>
              <TableHead>Template</TableHead>
              <TableHead>Voor</TableHead>
              <TableHead>Ondertekend</TableHead>
              <TableHead>Datum</TableHead>
              <TableHead className="text-right">Acties</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {documents.map((doc: any) => (
              <TableRow key={doc.id}>
                <TableCell>
                  <button onClick={() => handleDownload(doc.file_path, doc.file_name)} className="flex items-center gap-2 text-sm font-medium hover:underline">
                    <FileText className="h-4 w-4 text-primary" />{doc.file_name}
                  </button>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{doc.document_templates?.name ?? "-"}</TableCell>
                <TableCell className="text-sm">{getEntityLabel(doc)}</TableCell>
                <TableCell>
                  {doc.signed_file_path ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDownload(doc.signed_file_path, doc.signed_file_name || "ondertekend.pdf")}
                        className="flex items-center gap-1 text-sm text-green-600 hover:underline"
                      >
                        <Badge variant="secondary" className="bg-green-100 text-green-700 text-[10px]">
                          PDF ✓
                        </Badge>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => { if (confirm("Ondertekend PDF verwijderen?")) removeSignedMutation.mutate(doc); }}
                        title="Ondertekend bestand verwijderen"
                      >
                        <X className="h-3 w-3 text-destructive" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={() => handleSignedUpload(doc)}
                      disabled={uploadSignedMutation.isPending}
                    >
                      {uploadSignedMutation.isPending && uploadingId === doc.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <><Upload className="h-3 w-3 mr-1" /> PDF uploaden</>
                      )}
                    </Button>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{format(new Date(doc.created_at), "d MMM yyyy HH:mm", { locale: nl })}</TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end">
                    <Button variant="ghost" size="icon" onClick={() => handleDownload(doc.file_path, doc.file_name)} title="Download DOCX"><Download className="h-4 w-4" /></Button>
                    {doc.signed_file_path && (
                      <Button variant="ghost" size="icon" onClick={() => handleDownload(doc.signed_file_path, doc.signed_file_name || "ondertekend.pdf")} title="Download ondertekend PDF"><File className="h-4 w-4 text-green-600" /></Button>
                    )}
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
