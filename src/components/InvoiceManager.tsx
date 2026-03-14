import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invoiceKeys, staffKeys } from "@/lib/queryKeys";
import { toast } from "sonner";
import type { InvoiceRow, TrainerProgramRef } from "@/lib/queryShapes";
import { supabase } from "@/integrations/supabase/client";
import { invoiceKeys, staffKeys } from "@/lib/queryKeys";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Upload, FileText, Check, X, Download } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

const statusLabels: Record<string, string> = { pending: "In behandeling", approved: "Goedgekeurd", rejected: "Afgewezen" };
const statusColors: Record<string, string> = {
  pending: "bg-warning-muted text-warning-foreground",
  approved: "bg-success-muted text-success-foreground",
  rejected: "bg-destructive/10 text-destructive",
};

export default function InvoiceManager({ staffId, staffName }: { staffId?: string; staffName?: string }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedProgramId, setSelectedProgramId] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [uploading, setUploading] = useState(false);

  // Fetch invoices
  const { data: invoices = [], isLoading } = useQuery({
    queryKey: invoiceKeys.all,
    queryFn: async () => {
      let query = supabase
        .from("invoices")
        .select("*, staff(name), programs(name)")
        .order("created_at", { ascending: false });
      if (staffId) query = query.eq("staff_id", staffId);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch completed programs for this trainer
  const { data: trainerPrograms = [] } = useQuery({
    queryKey: staffKeys.trainerProgramsForInvoice(staffId),
    queryFn: async () => {
      if (!staffId) return [];
      const { data, error } = await supabase
        .from("program_staff")
        .select("program_id, programs(id, name, status)")
        .eq("staff_id", staffId);
      if (error) throw error;
      // Unique programs
      const seen = new Set<string>();
      return (data ?? []).filter((ps) => {
        if (seen.has(ps.program_id)) return false;
        seen.add(ps.program_id);
        return true;
      });
    },
    enabled: !!staffId,
  });

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file || !staffId || !selectedProgramId) {
      toast.error("Selecteer een bestand en programma");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "pdf";
      const path = `${staffId}/${Date.now()}.${ext}`;
      const { error: storageError } = await supabase.storage.from("invoices").upload(path, file);
      if (storageError) throw storageError;

      const { error: dbError } = await supabase.from("invoices").insert({
        staff_id: staffId,
        program_id: selectedProgramId,
        file_name: file.name,
        file_path: path,
        amount: amount ? parseFloat(amount) : null,
        notes: notes || null,
      } as any);
      if (dbError) throw dbError;

      toast.success("Factuur geüpload");
      setUploadOpen(false);
      setSelectedProgramId("");
      setAmount("");
      setNotes("");
      qc.invalidateQueries({ queryKey: invoiceKeys.all });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setUploading(false);
    }
  };

  const statusMutation = useMutation({
    mutationFn: async ({ invoiceId, status }: { invoiceId: string; status: string }) => {
      const { error } = await supabase
        .from("invoices")
        .update({ status, reviewed_at: new Date().toISOString() } as any)
        .eq("id", invoiceId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Status bijgewerkt");
      qc.invalidateQueries({ queryKey: invoiceKeys.all });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleDownload = async (inv: any) => {
    const { data, error } = await supabase.storage.from("invoices").download(inv.file_path);
    if (error || !data) { toast.error("Download mislukt"); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = inv.file_name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-base font-bold text-card-foreground">
          Facturen{staffName ? ` – ${staffName}` : ""}
        </h3>
        {staffId && (
          <Button size="sm" onClick={() => setUploadOpen(true)}>
            <Upload className="h-3.5 w-3.5 mr-1" /> Factuur uploaden
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">Geen facturen gevonden.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {!staffId && <TableHead>Trainer</TableHead>}
                <TableHead>Programma</TableHead>
                <TableHead>Bestand</TableHead>
                <TableHead>Bedrag</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Datum</TableHead>
                <TableHead className="text-right">Acties</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv: any) => (
                <TableRow key={inv.id}>
                  {!staffId && <TableCell>{inv.staff?.name ?? "—"}</TableCell>}
                  <TableCell>{inv.programs?.name ?? "—"}</TableCell>
                  <TableCell>
                    <button onClick={() => handleDownload(inv)} className="flex items-center gap-1 text-sm text-primary hover:underline">
                      <FileText className="h-3.5 w-3.5" /> {inv.file_name}
                    </button>
                  </TableCell>
                  <TableCell>{inv.amount ? `€ ${Number(inv.amount).toFixed(2)}` : "—"}</TableCell>
                  <TableCell>
                    <Badge className={statusColors[inv.status] ?? ""}>{statusLabels[inv.status] ?? inv.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {format(new Date(inv.created_at), "d MMM yyyy", { locale: nl })}
                  </TableCell>
                  <TableCell className="text-right">
                    {inv.status === "pending" && (
                      <div className="flex gap-1 justify-end">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-success hover:text-success/80"
                          onClick={() => statusMutation.mutate({ invoiceId: inv.id, status: "approved" })}
                          title="Goedkeuren"
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive hover:text-destructive/80"
                          onClick={() => statusMutation.mutate({ invoiceId: inv.id, status: "rejected" })}
                          title="Afwijzen"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                    {inv.status !== "pending" && (
                      <Button size="icon" variant="ghost" onClick={() => handleDownload(inv)}>
                        <Download className="h-4 w-4" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Upload dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="bg-card">
          <DialogHeader>
            <DialogTitle>Factuur uploaden</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Programma *</Label>
              <Select value={selectedProgramId} onValueChange={setSelectedProgramId}>
                <SelectTrigger><SelectValue placeholder="Kies training" /></SelectTrigger>
                <SelectContent className="bg-popover">
                  {trainerPrograms.map((ps: any) => (
                    <SelectItem key={ps.program_id} value={ps.program_id}>
                      {ps.programs?.name ?? "Programma"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Bedrag (€)</Label>
              <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>Notities</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optionele toelichting" />
            </div>
            <div>
              <Label>Bestand *</Label>
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xlsx" className="mt-1 block w-full text-sm" />
            </div>
            <Button className="w-full" onClick={handleUpload} disabled={uploading || !selectedProgramId}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Upload className="h-4 w-4 mr-1" />}
              Uploaden
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
