import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { FileText, Upload, Trash2, Loader2, File, Plus, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export default function DocumentenPage() {
  const { session } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateCategory, setTemplateCategory] = useState("overig");

  // Builder state
  const [builderName, setBuilderName] = useState("");
  const [builderCategory, setBuilderCategory] = useState("overig");
  const [builderContent, setBuilderContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch templates
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

  // Upload template
  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!uploadFile || !templateName) throw new Error("Vul alle velden in");

      const ext = uploadFile.name.split(".").pop()?.toLowerCase();
      if (!["docx", "doc"].includes(ext ?? "")) throw new Error("Alleen .docx of .doc bestanden toegestaan");

      const filePath = `${crypto.randomUUID()}.${ext}`;

      const { error: storageError } = await supabase.storage
        .from("document-templates")
        .upload(filePath, uploadFile);
      if (storageError) throw storageError;

      const placeholders = PLACEHOLDER_OPTIONS.filter(() => false);

      const { error: dbError } = await supabase
        .from("document_templates")
        .insert({
          name: templateName,
          file_path: filePath,
          category: templateCategory,
          placeholder_fields: placeholders,
        });
      if (dbError) throw dbError;
    },
    onSuccess: () => {
      toast({ title: "Template geüpload" });
      setUploadOpen(false);
      setUploadFile(null);
      setTemplateName("");
      setTemplateCategory("overig");
      queryClient.invalidateQueries({ queryKey: ["document-templates"] });
    },
    onError: (err: any) => {
      toast({ title: "Fout", description: err.message, variant: "destructive" });
    },
  });

  // Build template
  const buildMutation = useMutation({
    mutationFn: async () => {
      if (!builderName || !builderContent.trim()) throw new Error("Vul naam en inhoud in");

      const { data, error } = await supabase.functions.invoke("build-template", {
        body: {
          name: builderName,
          category: builderCategory,
          content: builderContent,
        },
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
    onError: (err: any) => {
      toast({ title: "Fout", description: err.message, variant: "destructive" });
    },
  });

  // Delete template
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
    onError: (err: any) => {
      toast({ title: "Fout", description: err.message, variant: "destructive" });
    },
  });

  // Download template
  const handleDownload = async (template: any) => {
    const { data, error } = await supabase.storage
      .from("document-templates")
      .download(template.file_path);
    if (error || !data) {
      toast({ title: "Download mislukt", variant: "destructive" });
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${template.name}.docx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Insert placeholder at cursor position
  const insertPlaceholder = (placeholder: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setBuilderContent((prev) => prev + placeholder);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = builderContent.substring(0, start);
    const after = builderContent.substring(end);
    const newContent = before + placeholder + after;
    setBuilderContent(newContent);
    // Restore cursor after placeholder
    requestAnimationFrame(() => {
      textarea.focus();
      const newPos = start + placeholder.length;
      textarea.setSelectionRange(newPos, newPos);
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-foreground">Documenten</h1>
          <p className="text-sm text-muted-foreground">
            Beheer templates en genereer certificaten, verslagen en brieven
          </p>
        </div>
        <div className="flex gap-2">
          {/* Template Builder Dialog */}
          <Dialog open={builderOpen} onOpenChange={setBuilderOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4" /> Template Maken</Button>
            </DialogTrigger>
            <DialogContent className="bg-card max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Nieuwe Template Maken</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Left: Editor */}
                <div className="lg:col-span-2 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Naam</Label>
                      <Input
                        value={builderName}
                        onChange={(e) => setBuilderName(e.target.value)}
                        placeholder="bijv. Certificaat Kanjertraining"
                      />
                    </div>
                    <div>
                      <Label>Categorie</Label>
                      <Select value={builderCategory} onValueChange={setBuilderCategory}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-popover">
                          {Object.entries(categoryLabels).map(([val, label]) => (
                            <SelectItem key={val} value={val}>{label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label>Inhoud</Label>
                    <p className="text-xs text-muted-foreground mb-1">
                      Gebruik # voor koppen, --- voor lijnen. Klik op een placeholder rechts om in te voegen.
                    </p>
                    <Textarea
                      ref={textareaRef}
                      value={builderContent}
                      onChange={(e) => setBuilderContent(e.target.value)}
                      placeholder={`# Certificaat\n\nHierbij verklaren wij dat {{client_voornaam}} {{client_achternaam}} het programma {{programma_naam}} succesvol heeft afgerond.\n\nDatum: {{datum_vandaag}}\nTrainer: {{trainer_naam}}`}
                      className="min-h-[350px] font-mono text-sm"
                    />
                  </div>

                  <Button
                    className="w-full"
                    onClick={() => buildMutation.mutate()}
                    disabled={!builderName || !builderContent.trim() || buildMutation.isPending}
                  >
                    {buildMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Template Opslaan
                  </Button>
                </div>

                {/* Right: Placeholder palette */}
                <div className="space-y-3 border-l border-border pl-4">
                  <p className="text-sm font-semibold text-foreground">Placeholders</p>
                  <p className="text-xs text-muted-foreground">Klik om in te voegen op cursorpositie</p>
                  <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                    {PLACEHOLDER_GROUPS.map((group) => (
                      <div key={group.label}>
                        <p className="text-xs font-medium text-muted-foreground mb-1">{group.label}</p>
                        <div className="flex flex-wrap gap-1">
                          {group.items.map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => insertPlaceholder(p)}
                              className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-mono text-primary hover:bg-primary/20 transition-colors cursor-pointer"
                            >
                              {p.replace(/\{\{|\}\}/g, "")}
                              <Copy className="h-2.5 w-2.5 opacity-50" />
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
              <Button variant="outline"><Upload className="h-4 w-4" /> Uploaden</Button>
            </DialogTrigger>
            <DialogContent className="bg-card">
              <DialogHeader>
                <DialogTitle>Template Uploaden</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Naam</Label>
                  <Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="bijv. Certificaat Kanjertraining" />
                </div>
                <div>
                  <Label>Categorie</Label>
                  <Select value={templateCategory} onValueChange={setTemplateCategory}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-popover">
                      {Object.entries(categoryLabels).map(([val, label]) => (
                        <SelectItem key={val} value={val}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Bestand (.docx)</Label>
                  <Input
                    type="file"
                    accept=".docx,.doc"
                    onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                  />
                </div>
                <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                  <p className="font-semibold mb-1">Beschikbare placeholders:</p>
                  <div className="flex flex-wrap gap-1">
                    {PLACEHOLDER_OPTIONS.map((p) => (
                      <Badge key={p} variant="secondary" className="text-[10px]">{p}</Badge>
                    ))}
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={() => uploadMutation.mutate()}
                  disabled={!uploadFile || !templateName || uploadMutation.isPending}
                >
                  {uploadMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Uploaden
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Templates tabel */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card py-16">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <FileText className="h-7 w-7 text-primary" />
          </div>
          <h2 className="mt-4 font-display text-lg font-bold text-card-foreground">Nog geen templates</h2>
          <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
            Maak een template aan of upload een Word-bestand (.docx) met placeholders.
          </p>
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
                <TableRow key={t.id}>
                  <TableCell>
                    <button onClick={() => handleDownload(t)} className="flex items-center gap-2 text-sm font-medium hover:underline">
                      <File className="h-4 w-4 text-primary" />
                      {t.name}
                    </button>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{categoryLabels[t.category] ?? t.category}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">
                      {t.placeholder_fields?.length ?? 0} velden
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(t.created_at), "d MMM yyyy", { locale: nl })}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (confirm(`Template "${t.name}" verwijderen?`)) {
                          deleteMutation.mutate(t);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
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
