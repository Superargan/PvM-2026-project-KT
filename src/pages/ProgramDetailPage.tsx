import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { programKeys, clientKeys } from "@/lib/queryKeys";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SchoolCombobox from "@/components/SchoolCombobox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Loader2, Users, UserPlus, X, GraduationCap, Calendar, MapPin, Settings, ClipboardList, FileText, School, AlertTriangle, UsersRound,
} from "lucide-react";
import { getResolvedLocationName } from "@/lib/locationUtils";
import ProgramTrainers from "@/components/ProgramTrainers";
import ProgramAttendance from "@/components/ProgramAttendance";
import GroupComposer from "@/components/GroupComposer";

const statusMap: Record<string, { css: string; label: string }> = {
  te_plannen: { css: "status-rood", label: "Te plannen" },
  ingepland: { css: "status-oranje", label: "Ingepland" },
  gestart: { css: "status-groen", label: "Gestart" },
  afgerond: { css: "status-rood", label: "Afgerond" },
};

export default function ProgramDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedClientId, setSelectedClientId] = useState("");
  const [dropoutOpen, setDropoutOpen] = useState(false);
  const [dropoutTarget, setDropoutTarget] = useState<any>(null);
  const [dropoutReason, setDropoutReason] = useState("");
  const [dropoutAction, setDropoutAction] = useState("");
  // Fetch program
  const { data: program, isLoading } = useQuery({
    queryKey: programKeys.detail(id!),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("programs")
        .select("*, schools(name), training_locations(name), areas(name), neighborhoods(name)")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch enrolled clients
  const { data: enrolledClients = [], refetch: refetchEnrolled } = useQuery({
    queryKey: ["program_clients_full", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("program_clients")
        .select("id, client_id, enrolled_at, early_dropout, dropout_reason, dropout_action, clients(id, first_name, last_name, date_of_birth, gender, schools(name))")
        .eq("program_id", id!);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id,
  });

  // Fetch all clients for adding
  const { data: allClients = [] } = useQuery({
    queryKey: ["clients", "for-program"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, first_name, last_name")
        .order("first_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch schools for linking
  const { data: schools = [] } = useQuery({
    queryKey: ["all-schools-for-program"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("schools")
        .select("id, name, neighborhood_id, neighborhoods(id, name, area_id, areas(id, name))")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Fetch training locations for linking
  const { data: trainingLocations = [] } = useQuery({
    queryKey: ["all-training-locations-for-program"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("training_locations")
        .select("id, name, neighborhood_id, area_id, neighborhoods(id, name, area_id, areas(id, name))")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const enrolledIds = enrolledClients.map((ec: any) => ec.client_id);
  const activeEnrolled = enrolledClients.filter((ec: any) => !ec.early_dropout);
  const availableClients = allClients.filter((c: any) => !enrolledIds.includes(c.id));

  // Fetch sessions for overlap check
  const { data: programSessions = [] } = useQuery({
    queryKey: ["program_sessions", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("program_sessions")
        .select("session_date, start_time, end_time")
        .eq("program_id", id!)
        .not("session_date", "is", null);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id,
  });

  // Add participant with capacity + overlap check
  const addMutation = useMutation({
    mutationFn: async () => {
      if (!selectedClientId) return;

      const maxP = program?.max_participants ?? 14;
      if (activeEnrolled.length >= maxP) {
        throw new Error(`Max aantal deelnemers bereikt (${maxP}). Alleen een admin kan dit overrulen.`);
      }

      // Overlap check
      if (programSessions.length > 0) {
        const { data: otherEnrollments } = await supabase
          .from("program_clients")
          .select("program_id, programs(id, name)")
          .eq("client_id", selectedClientId)
          .neq("program_id", id!);

        if (otherEnrollments && otherEnrollments.length > 0) {
          const otherProgramIds = otherEnrollments.map((e: any) => e.program_id);
          const { data: otherSessions } = await supabase
            .from("program_sessions")
            .select("session_date, start_time, end_time, program_id")
            .in("program_id", otherProgramIds)
            .not("session_date", "is", null);

          if (otherSessions) {
            for (const ps of programSessions) {
              const overlap = otherSessions.find((os: any) =>
                os.session_date === ps.session_date &&
                os.start_time && ps.start_time &&
                os.start_time < (ps.end_time ?? "23:59") &&
                (os.end_time ?? "23:59") > ps.start_time
              );
              if (overlap) {
                const prog = otherEnrollments.find((e: any) => e.program_id === overlap.program_id);
                throw new Error(`Overlap op ${ps.session_date} met programma ${(prog as any)?.programs?.name ?? overlap.program_id}`);
              }
            }
          }
        }
      }

      const { error } = await supabase.from("program_clients").insert({
        program_id: id!,
        client_id: selectedClientId,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      setSelectedClientId("");
      refetchEnrolled();
      qc.invalidateQueries({ queryKey: ["programs"] });
      toast({ title: "Deelnemer toegevoegd" });
    },
    onError: (err: any) => toast({ title: "Fout", description: err.message, variant: "destructive" }),
  });

  // Remove participant
  const removeMutation = useMutation({
    mutationFn: async (enrollmentId: string) => {
      const { error } = await supabase.from("program_clients").delete().eq("id", enrollmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      refetchEnrolled();
      qc.invalidateQueries({ queryKey: ["programs"] });
      toast({ title: "Deelnemer verwijderd" });
    },
    onError: (err: any) => toast({ title: "Fout", description: err.message, variant: "destructive" }),
  });

  // Mark dropout
  const dropoutMutation = useMutation({
    mutationFn: async ({ enrollmentId, reason, action }: { enrollmentId: string; reason: string; action: string }) => {
      const { error } = await supabase
        .from("program_clients")
        .update({ early_dropout: true, dropout_reason: reason || null, dropout_action: action || null } as any)
        .eq("id", enrollmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      refetchEnrolled();
      toast({ title: "Uitval geregistreerd" });
      setDropoutOpen(false);
      setDropoutTarget(null);
      setDropoutReason("");
      setDropoutAction("");
    },
    onError: (err: any) => toast({ title: "Fout", description: err.message, variant: "destructive" }),
  });

  // Undo dropout
  const undoDropoutMutation = useMutation({
    mutationFn: async (enrollmentId: string) => {
      const { error } = await supabase
        .from("program_clients")
        .update({ early_dropout: false, dropout_reason: null, dropout_action: null } as any)
        .eq("id", enrollmentId);
      if (error) throw error;
    },
    onSuccess: () => {
      refetchEnrolled();
      toast({ title: "Uitval ongedaan gemaakt" });
    },
    onError: (err: any) => toast({ title: "Fout", description: err.message, variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!program) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => navigate("/programmas")}>
          <ArrowLeft className="h-4 w-4" /> Terug
        </Button>
        <p className="text-muted-foreground">Programma niet gevonden.</p>
      </div>
    );
  }

  const status = program.status ?? "te_plannen";
  const statusInfo = statusMap[status] ?? { css: "status-oranje", label: status };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/programmas")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-extrabold text-foreground">{program.name}</h1>
            {(() => {
              const label = getResolvedLocationName(program);
              return label && label !== "—" ? (
                <Badge variant="outline" className="text-xs">{label}</Badge>
              ) : null;
            })()}
            <span className={`status-indicator ${statusInfo.css}`}>{statusInfo.label}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {(program as any).training_number && <>{(program as any).training_number} • </>}
            {(program as any).location && <>{(program as any).location} • </>}
            {program.training_locations?.name && <>{program.training_locations.name} • </>}
            {program.schools?.name && <>{program.schools.name} • </>}
            {program.areas?.name && <>Gebied: {program.areas.name}</>}
            {program.neighborhoods?.name && <> • Wijk: {program.neighborhoods.name}</>}
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Users className="h-3.5 w-3.5" /> Deelnemers</div>
          <p className="text-2xl font-bold text-foreground">{activeEnrolled.length}<span className="text-sm font-normal text-muted-foreground">/{program.max_participants ?? 14}</span></p>
          {program.min_participants && activeEnrolled.length < program.min_participants && (
            <p className="text-xs text-amber-600 mt-1">Minimum ({program.min_participants}) niet bereikt</p>
          )}
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><Calendar className="h-3.5 w-3.5" /> Periode</div>
          <p className="text-sm font-semibold text-foreground">
            {program.start_date ? new Date(program.start_date).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) : "—"}
            {" – "}
            {program.end_date ? new Date(program.end_date).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><MapPin className="h-3.5 w-3.5" /> Gebied</div>
          <p className="text-sm font-semibold text-foreground">{program.areas?.name ?? "—"}</p>
          {program.neighborhoods?.name && (
            <p className="text-xs text-muted-foreground mt-0.5">Wijk: {program.neighborhoods.name}</p>
          )}
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1"><School className="h-3.5 w-3.5" /> Locatie</div>
          <div className="space-y-2">
            {/* School selector */}
            <SchoolCombobox
              schools={schools}
              value={program.school_id ?? "geen"}
              onValueChange={async (v) => {
                const schoolId = v === "geen" ? null : v;
                const selectedSchool = schools.find((s: any) => s.id === schoolId);
                const neighborhoodId = selectedSchool?.neighborhood_id ?? null;
                const areaId = selectedSchool?.neighborhoods?.area_id ?? null;
                const { error } = await supabase
                  .from("programs")
                  .update({ school_id: schoolId, training_location_id: schoolId ? null : (program as any).training_location_id, neighborhood_id: neighborhoodId, area_id: areaId })
                  .eq("id", id!);
                if (error) {
                  toast({ title: "Fout", description: error.message, variant: "destructive" });
                } else {
                  toast({ title: "School gekoppeld" });
                  qc.invalidateQueries({ queryKey: ["program", id] });
                  qc.invalidateQueries({ queryKey: ["programs"] });
                }
              }}
              emptyOption={{ value: "geen", label: "Geen school" }}
              triggerClassName="h-8 text-sm"
            />
            {/* Training location selector */}
            <Select
              value={(program as any).training_location_id ?? "geen"}
              onValueChange={async (v) => {
                const tlId = v === "geen" ? null : v;
                const tl = trainingLocations.find((t: any) => t.id === tlId);
                const neighborhoodId = tl?.neighborhood_id ?? null;
                const areaId = tl?.area_id ?? tl?.neighborhoods?.area_id ?? null;
                const { error } = await supabase
                  .from("programs")
                  .update({
                    training_location_id: tlId,
                    school_id: tlId ? null : program.school_id,
                    neighborhood_id: neighborhoodId ?? program.neighborhood_id,
                    area_id: areaId ?? program.area_id,
                  })
                  .eq("id", id!);
                if (error) {
                  toast({ title: "Fout", description: error.message, variant: "destructive" });
                } else {
                  toast({ title: "Trainingslocatie gekoppeld" });
                  qc.invalidateQueries({ queryKey: ["program", id] });
                  qc.invalidateQueries({ queryKey: ["programs"] });
                }
              }}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Trainingslocatie..." />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                <SelectItem value="geen">Geen trainingslocatie</SelectItem>
                {trainingLocations.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="deelnemers" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="deelnemers" className="gap-1.5"><Users className="h-3.5 w-3.5" /> Deelnemers</TabsTrigger>
          <TabsTrigger value="groep" className="gap-1.5"><UsersRound className="h-3.5 w-3.5" /> Groep samenstellen</TabsTrigger>
          <TabsTrigger value="trainers" className="gap-1.5"><GraduationCap className="h-3.5 w-3.5" /> Trainers</TabsTrigger>
          <TabsTrigger value="sessies" className="gap-1.5"><ClipboardList className="h-3.5 w-3.5" /> Sessies & Presentie</TabsTrigger>
        </TabsList>

        {/* Deelnemers tab */}
        <TabsContent value="deelnemers" className="space-y-4">
          {/* Add participant */}
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Deelnemer toevoegen</p>
            <div className="flex gap-2">
              <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Selecteer een deelnemer" />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  {availableClients.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.first_name} {c.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button disabled={!selectedClientId || addMutation.isPending} onClick={() => addMutation.mutate()}>
                <UserPlus className="h-4 w-4 mr-1" /> Toevoegen
              </Button>
            </div>
          </div>

          {/* Enrolled list */}
          <div className="rounded-xl border border-border bg-card">
            {enrolledClients.length === 0 ? (
              <div className="flex flex-col items-center py-12 text-muted-foreground">
                <Users className="h-8 w-8 mb-2" />
                <p className="text-sm">Nog geen deelnemers ingeschreven</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {enrolledClients.map((ec: any) => {
                  const c = ec.clients;
                  if (!c) return null;
                  const isDropout = ec.early_dropout === true;
                  return (
                    <div key={ec.id} className={`flex items-center justify-between px-4 py-3 ${isDropout ? "opacity-60 bg-muted/30" : ""}`}>
                      <div className="flex items-center gap-3">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${isDropout ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
                          {c.first_name?.[0]}{c.last_name?.[0]}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => navigate(`/clienten/${c.id}`)}
                              className={`text-sm font-medium hover:underline ${isDropout ? "text-muted-foreground line-through" : "text-foreground"}`}
                            >
                              {c.first_name} {c.last_name}
                            </button>
                            {isDropout && (
                              <Badge variant="outline" className="text-xs border-destructive/30 text-destructive">
                                <AlertTriangle className="h-3 w-3 mr-1" /> Gestopt
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {c.schools?.name ?? ""}{c.gender ? ` • ${c.gender}` : ""}
                            {isDropout && ec.dropout_reason ? ` • ${ec.dropout_reason}` : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {isDropout ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs"
                            onClick={() => undoDropoutMutation.mutate(ec.id)}
                          >
                            Herstel
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive hover:text-destructive text-xs"
                            onClick={() => {
                              setDropoutTarget(ec);
                              setDropoutReason("");
                              setDropoutAction("");
                              setDropoutOpen(true);
                            }}
                          >
                            <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Gestopt
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => removeMutation.mutate(ec.id)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Groep samenstellen tab */}
        <TabsContent value="groep" className="space-y-4">
          {program.area_id ? (
            <GroupComposer
              filterArea={program.area_id}
              filterAgeCategory={program.age_category === "4-7 jaar" || program.age_category === "8-12 jaar" ? program.age_category : undefined}
              preLinkedProgramId={id!}
            />
          ) : (
            <div className="rounded-xl border border-border bg-card p-6 text-center text-muted-foreground">
              <AlertTriangle className="h-5 w-5 mx-auto mb-2 text-amber-500" />
              <p className="text-sm font-medium">Koppel eerst een school of trainingslocatie aan dit programma om het gebied te bepalen.</p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="trainers" className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-6">
            <ProgramTrainers programId={id!} />
          </div>
          <ProgramDocumentGenerator programId={id!} />
        </TabsContent>

        {/* Sessies tab */}
        <TabsContent value="sessies">
          <div className="rounded-xl border border-border bg-card p-6">
            <ProgramAttendance
              programId={id!}
              programName={program.name}
              programStartDate={program.start_date}
              programEndDate={program.end_date}
              minParticipants={program.min_participants}
              maxParticipants={program.max_participants}
              enrolledCount={activeEnrolled.length}
              inline
            />
          </div>
        </TabsContent>
      </Tabs>

      {/* Dropout dialog */}
      <Dialog open={dropoutOpen} onOpenChange={setDropoutOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Uitval registreren</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Registreer dat <strong>{dropoutTarget?.clients?.first_name} {dropoutTarget?.clients?.last_name}</strong> gestopt is tijdens de training.
            </p>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Reden uitval</Label>
              <Select value={dropoutReason} onValueChange={setDropoutReason}>
                <SelectTrigger><SelectValue placeholder="Selecteer reden..." /></SelectTrigger>
                <SelectContent className="bg-popover">
                  <SelectItem value="Motivatie">Motivatie</SelectItem>
                  <SelectItem value="Ziekte">Ziekte</SelectItem>
                  <SelectItem value="Verhuizing">Verhuizing</SelectItem>
                  <SelectItem value="Gedragsproblemen">Gedragsproblemen</SelectItem>
                  <SelectItem value="Ouder stopt">Ouder stopt</SelectItem>
                  <SelectItem value="Praktische redenen">Praktische redenen</SelectItem>
                  <SelectItem value="Overig">Overig</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Vervolgactie</Label>
              <Textarea
                placeholder="Beschrijf eventuele vervolgacties..."
                value={dropoutAction}
                onChange={(e) => setDropoutAction(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDropoutOpen(false)}>Annuleren</Button>
            <Button
              variant="destructive"
              disabled={dropoutMutation.isPending}
              onClick={() => {
                if (!dropoutTarget) return;
                dropoutMutation.mutate({
                  enrollmentId: dropoutTarget.id,
                  reason: dropoutReason,
                  action: dropoutAction,
                });
              }}
            >
              {dropoutMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
              Uitval registreren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProgramDocumentGenerator({ programId }: { programId: string }) {
  const { toast } = useToast();

  const { data: templates = [] } = useQuery({
    queryKey: ["overeenkomst-templates"],
    queryFn: async () => {
      const { data, error } = await supabase.from("document_templates").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: trainers = [] } = useQuery({
    queryKey: ["program_staff_for_docs", programId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("program_staff")
        .select("staff_id, role, staff:staff!program_staff_staff_id_fkey(id, name, trade_name)")
        .eq("program_id", programId)
        .in("role", ["trainer", "oudertrainer", "kindtrainer"]);
      if (error) throw error;
      return data ?? [];
    },
  });

  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!selectedTemplate || trainers.length === 0) return;
    setGenerating(true);
    try {
      const isPraktijk4Kids = (name: string, tradeName: string) =>
        (tradeName || "").toLowerCase().replace(/\s/g, "").includes("praktijk4kids") ||
        (name || "").toLowerCase().replace(/\s/g, "").includes("praktijk4kids");

      const eligibleTrainers = trainers.filter((t: any) => {
        const staff = t.staff as any;
        return !isPraktijk4Kids(staff?.name ?? "", staff?.trade_name ?? "");
      });

      if (eligibleTrainers.length === 0) {
        toast({ title: "Geen trainers om documenten voor te genereren", description: "Praktijk4Kids trainers worden overgeslagen" });
        setGenerating(false);
        return;
      }

      for (const t of eligibleTrainers) {
        const { data, error } = await supabase.functions.invoke("generate-document", {
          body: { template_id: selectedTemplate, staff_id: t.staff_id, program_id: programId },
        });
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        const { data: fileData, error: dlErr } = await supabase.storage
          .from("generated-documents")
          .download(data.file_path);
        if (!dlErr && fileData) {
          const url = URL.createObjectURL(fileData);
          const a = document.createElement("a");
          a.href = url;
          a.download = data.file_name;
          a.click();
          URL.revokeObjectURL(url);
        }
      }
      toast({ title: `${eligibleTrainers.length} overeenkomst(en) gegenereerd en gedownload` });
    } catch (err: any) {
      toast({ title: "Fout bij genereren", description: err.message, variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  if (trainers.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Overeenkomst van Opdracht</p>
      <div className="flex gap-2">
        <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
          <SelectTrigger className="flex-1">
            <SelectValue placeholder="Kies een template..." />
          </SelectTrigger>
          <SelectContent className="bg-popover">
            {templates.map((t: any) => (
              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button disabled={!selectedTemplate || generating} onClick={handleGenerate}>
          {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          Genereer ({trainers.length} trainer{trainers.length !== 1 ? "s" : ""})
        </Button>
      </div>
    </div>
  );
}
