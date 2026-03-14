import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { programKeys } from "@/lib/queryKeys";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { MapPin, Upload, FileText, Trash2, Loader2, CalendarDays, Clock, ShieldAlert } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  type SessionStatus, type OverrideType,
  SESSION_STATUS_CONFIG, getStatusForDate, isSessionBlocked, getOverrideConfirmMessage,
} from "@/lib/sessionStatus";

interface Props {
  session: {
    id: string;
    session_number: number;
    location?: string | null;
    session_date?: string | null;
    start_time?: string | null;
    end_time?: string | null;
    status?: string | null;
  };
  programId: string;
  isBackoffice?: boolean;
}

export default function SessionDetails({ session, programId, isBackoffice = true }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [location, setLocation] = useState(session.location ?? "");
  const [sessionDate, setSessionDate] = useState(session.session_date ?? "");
  const [sessionStartTime, setSessionStartTime] = useState(session.start_time?.substring(0, 5) ?? "");
  const [sessionEndTime, setSessionEndTime] = useState(session.end_time?.substring(0, 5) ?? "");
  const [uploading, setUploading] = useState(false);

  const currentStatus = (session.status ?? "beschikbaar") as SessionStatus;
  const statusConfig = SESSION_STATUS_CONFIG[currentStatus] ?? SESSION_STATUS_CONFIG.beschikbaar;
  const blocked = isSessionBlocked(currentStatus);
  const canEdit = !blocked || isBackoffice;

  // Override dialog state
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [pendingDate, setPendingDate] = useState("");

  // Check if new date has conflict
  const handleDateChange = (newDate: string) => {
    const newStatus = getStatusForDate(newDate);
    if (isSessionBlocked(newStatus) && isBackoffice) {
      // Show override dialog
      setPendingDate(newDate);
      setOverrideReason("");
      setOverrideOpen(true);
    } else if (isSessionBlocked(newStatus)) {
      toast({ title: "Deze datum valt op een feestdag of in een schoolvakantie", variant: "destructive" });
    } else {
      setSessionDate(newDate);
    }
  };

  const handleOverrideConfirm = async () => {
    if (!overrideReason.trim()) return;

    const { data: userData } = await supabase.auth.getUser();

    // Update session with override status
    const { error } = await supabase
      .from("program_sessions")
      .update({
        session_date: pendingDate,
        status: "handmatig_vrijgegeven",
      } as any)
      .eq("id", session.id);

    if (error) {
      toast({ title: "Fout", description: error.message, variant: "destructive" });
      return;
    }

    // Log override
    const originalStatus = getStatusForDate(pendingDate);
    const overrideType: OverrideType = originalStatus === "feestdag" ? "feestdag" : "schoolvakantie";

    await supabase.from("session_override_logs").insert({
      session_id: session.id,
      overridden_by: userData.user?.id,
      override_type: overrideType,
      reason: overrideReason.trim(),
    } as any);

    setSessionDate(pendingDate);
    setOverrideOpen(false);
    setOverrideReason("");
    qc.invalidateQueries({ queryKey: programKeys.sessions(programId) });
    toast({ title: "Sessie vrijgegeven met override" });
  };

  const updateSession = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("program_sessions")
        .update({
          session_date: sessionDate || null,
          start_time: sessionStartTime || null,
          end_time: sessionEndTime || null,
        } as any)
        .eq("id", session.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: programKeys.sessions(programId) });
      toast({ title: "Sessie opgeslagen" });
    },
    onError: (err: any) => toast({ title: "Fout", description: err.message, variant: "destructive" }),
  });

  const updateLocation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("program_sessions")
        .update({ location } as any)
        .eq("id", session.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: programKeys.sessions(programId) });
      toast({ title: "Locatie opgeslagen" });
    },
    onError: (err: any) => toast({ title: "Fout", description: err.message, variant: "destructive" }),
  });

  // Fetch documents for this session
  const { data: docs = [], isLoading: docsLoading } = useQuery({
    queryKey: programKeys.sessionDocs(session.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("session_documents")
        .select("*")
        .eq("session_id", session.id)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const path = `${programId}/${session.id}/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage
        .from("session-documents")
        .upload(path, file);
      if (uploadErr) throw uploadErr;

      const { data: userData } = await supabase.auth.getUser();
      const { error: insertErr } = await supabase.from("session_documents").insert({
        session_id: session.id,
        file_name: file.name,
        file_path: path,
        uploaded_by: userData.user?.id,
      } as any);
      if (insertErr) throw insertErr;

      qc.invalidateQueries({ queryKey: programKeys.sessionDocs(session.id) });
      toast({ title: "Document geüpload" });
    } catch (err: any) {
      toast({ title: "Fout", description: err.message, variant: "destructive" });
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const deleteMut = useMutation({
    mutationFn: async (doc: any) => {
      await supabase.storage.from("session-documents").remove([doc.file_path]);
      const { error } = await supabase.from("session_documents").delete().eq("id", doc.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: programKeys.sessionDocs(session.id) });
      toast({ title: "Document verwijderd" });
    },
    onError: (err: any) => toast({ title: "Fout", description: err.message, variant: "destructive" }),
  });

  const handleDownload = async (doc: any) => {
    const { data, error } = await supabase.storage
      .from("session-documents")
      .createSignedUrl(doc.file_path, 60);
    if (error || !data?.signedUrl) {
      toast({ title: "Fout bij downloaden", variant: "destructive" });
      return;
    }
    window.open(data.signedUrl, "_blank");
  };

  return (
    <div className={`space-y-3 rounded-lg border p-3 ${blocked ? "border-destructive/30 bg-destructive/5" : "border-border bg-muted/30"}`}>
      <h4 className="text-xs font-semibold text-foreground flex items-center gap-2 flex-wrap">
        Bijeenkomst {session.session_number}
        {session.session_date && (
          <span className="font-normal text-muted-foreground">
            {new Date(session.session_date).toLocaleDateString("nl-NL")}
          </span>
        )}
        <Badge variant="outline" className={`text-xs ${statusConfig.className}`}>
          {statusConfig.label}
        </Badge>
      </h4>

      {blocked && !isBackoffice && (
        <p className="text-xs text-destructive">Deze sessie is geblokkeerd en kan niet worden bewerkt.</p>
      )}

      {/* Date + Time */}
      {canEdit && (
        <div className="flex items-center gap-2 flex-wrap">
          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Input
            type="date"
            value={sessionDate}
            onChange={(e) => handleDateChange(e.target.value)}
            className="h-7 text-xs w-40"
          />
          <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Input
            type="time"
            value={sessionStartTime}
            onChange={(e) => setSessionStartTime(e.target.value)}
            className="h-7 text-xs w-24"
            placeholder="Start"
          />
          <span className="text-xs text-muted-foreground">–</span>
          <Input
            type="time"
            value={sessionEndTime}
            onChange={(e) => setSessionEndTime(e.target.value)}
            className="h-7 text-xs w-24"
            placeholder="Eind"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={
              sessionDate === (session.session_date ?? "") &&
              sessionStartTime === (session.start_time?.substring(0, 5) ?? "") &&
              sessionEndTime === (session.end_time?.substring(0, 5) ?? "")
            }
            onClick={() => updateSession.mutate()}
          >
            Opslaan
          </Button>
        </div>
      )}

      {/* Location */}
      {canEdit && (
        <div className="flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Locatie (bijv. school, adres)"
            className="h-7 text-xs flex-1"
          />
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={location === (session.location ?? "")}
            onClick={() => updateLocation.mutate()}
          >
            Opslaan
          </Button>
        </div>
      )}

      {/* Documents */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <FileText className="h-3.5 w-3.5" /> Documenten ({docs.length})
          </span>
          <label className="cursor-pointer">
            <input type="file" className="hidden" onChange={handleUpload} disabled={uploading} />
            <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 pointer-events-none" asChild>
              <span>
                {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
                Uploaden
              </span>
            </Button>
          </label>
        </div>
        {docsLoading ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mx-auto" />
        ) : docs.length > 0 ? (
          <ul className="space-y-1">
            {docs.map((doc: any) => (
              <li key={doc.id} className="flex items-center justify-between rounded bg-background px-2 py-1 text-xs">
                <button onClick={() => handleDownload(doc)} className="text-primary hover:underline truncate max-w-[200px]">
                  {doc.file_name}
                </button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-5 w-5 p-0 text-destructive hover:text-destructive"
                  onClick={() => deleteMut.mutate(doc)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs italic text-muted-foreground">Geen documenten</p>
        )}
      </div>

      {/* Override dialog for date change to blocked date */}
      <AlertDialog open={overrideOpen} onOpenChange={(o) => { if (!o) { setOverrideOpen(false); setOverrideReason(""); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-600" />
              Override bevestigen
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>Weet je het zeker? Dit moment valt op een feestdag of in een schoolvakantie.</p>
                <div>
                  <label className="text-xs font-medium text-foreground block mb-1">Reden (verplicht)</label>
                  <Textarea
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    placeholder="Geef een reden voor deze override..."
                    rows={3}
                    className="text-foreground"
                  />
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuleren</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleOverrideConfirm}
              disabled={!overrideReason.trim()}
              className="bg-amber-600 text-white hover:bg-amber-700"
            >
              Ja, toch vrijgeven
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
