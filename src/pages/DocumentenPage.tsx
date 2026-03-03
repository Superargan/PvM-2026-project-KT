import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { FileText, Upload, Trash2, Loader2, File } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

const PLACEHOLDER_OPTIONS = [
  "{{client_voornaam}}", "{{client_achternaam}}", "{{client_geboortedatum}}", "{{client_leeftijd}}",
  "{{client_school}}", "{{client_klas}}", "{{ouder_naam}}", "{{ouder_telefoon}}", "{{ouder_email}}",
  "{{trainer_naam}}", "{{programma_naam}}", "{{programma_start}}", "{{programma_eind}}",
  "{{doelen}}", "{{intake_notities}}", "{{datum_vandaag}}",
];

const categoryLabels: Record<string, string> = {
  certificaat: "Certificaat",
  verslag: "Verslag",
  brief: "Brief",
  overig: "Overig",
};

export default function DocumentenPage() {
  const { session } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [templateName, setTemplateName] = useState("");
  const [templateCategory, setTemplateCategory] = useState("overig");

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
      
      // Upload to storage
      const { error: storageError } = await supabase.storage
        .from("document-templates")
        .upload(filePath, uploadFile);
      if (storageError) throw storageError;

      // Scan for placeholders in filename (basic) - actual scanning happens in content
      const placeholders = PLACEHOLDER_OPTIONS.filter(() => false); // Placeholder detection happens server-side

      // Insert metadata
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

  // Delete template
  const deleteMutation = useMutation({
    mutationFn: async (template: any) => {
      // Delete from storage
      await supabase.storage.from("document-templates").remove([template.file_path]);
      // Delete from DB
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-foreground">Documenten</h1>
          <p className="text-sm text-muted-foreground">
            Beheer templates en genereer certificaten, verslagen en brieven
          </p>
        </div>
        <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
          <DialogTrigger asChild>
            <Button><Upload className="h-4 w-4" /> Template Uploaden</Button>
          </DialogTrigger>
          <DialogContent className="bg-card">
            <DialogHeader>
              <DialogTitle>Nieuwe Template Uploaden</DialogTitle>
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
                    <SelectItem value="certificaat">Certificaat</SelectItem>
                    <SelectItem value="verslag">Verslag</SelectItem>
                    <SelectItem value="brief">Brief</SelectItem>
                    <SelectItem value="overig">Overig</SelectItem>
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
            Upload een Word-template (.docx) met placeholders om automatisch certificaten en verslagen te genereren.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Naam</TableHead>
                <TableHead>Categorie</TableHead>
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
