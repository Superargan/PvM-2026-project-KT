import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { programKeys, attendanceKeys } from "@/lib/queryKeys";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ClipboardList } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import SessionDetails from "@/components/SessionDetails";
import ScheduleGenerator from "@/components/ScheduleGenerator";
import {
  type SessionStatus, SESSION_STATUS_CONFIG, STATUS_FILTER_OPTIONS, getCapacityStatus,
} from "@/lib/sessionStatus";

interface Props {
  programId: string;
  programName: string;
  programStartDate?: string | null;
  programEndDate?: string | null;
  minParticipants?: number | null;
  maxParticipants?: number | null;
  enrolledCount?: number;
  inline?: boolean;
}

export default function ProgramAttendance({
  programId, programName, programStartDate, programEndDate,
  minParticipants, maxParticipants, enrolledCount = 0, inline = false,
}: Props) {
  const [open, setOpen] = useState(inline ? true : false);
  const { toast } = useToast();
  const qc = useQueryClient();
  const SESSION_COUNT = programName.startsWith("KT") ? 10 : programName.startsWith("SV") ? 12 : 10;
  const [statusFilter, setStatusFilter] = useState("alle");

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: programKeys.sessions(programId),
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("program_sessions")
        .select("*")
        .eq("program_id", programId)
        .order("session_number");
      if (error) throw error;
      return data ?? [];
    },
  });

  const createSessionsMut = useMutation({
    mutationFn: async () => {
      const rows = Array.from({ length: SESSION_COUNT }, (_, i) => ({
        program_id: programId,
        session_number: i + 1,
      }));
      const { error } = await supabase.from("program_sessions").insert(rows as any);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: programKeys.sessions(programId) }),
  });

  useEffect(() => {
    if (open && !sessionsLoading && sessions.length === 0) {
      createSessionsMut.mutate();
    }
  }, [open, sessionsLoading, sessions.length]);

  const { data: enrolledClients = [] } = useQuery({
    queryKey: programKeys.clients(programId),
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("program_clients")
        .select("client_id, clients(id, first_name, last_name)")
        .eq("program_id", programId);
      if (error) throw error;
      return (data ?? []).map((pc: any) => pc.clients).filter(Boolean);
    },
  });

  const sessionIds = sessions.map((s: any) => s.id);
  const { data: attendance = [], isLoading: attLoading } = useQuery({
    queryKey: [...attendanceKeys.all, programId, sessionIds],
    enabled: open && sessionIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("*")
        .in("session_id", sessionIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const attMap = useMemo(() => {
    const map = new Map<string, any>();
    attendance.forEach((a: any) => map.set(`${a.session_id}_${a.client_id}`, a));
    return map;
  }, [attendance]);

  // Derive effective status per session (persisted status + capacity check)
  const sessionsWithEffectiveStatus = useMemo(() => {
    return sessions.map((s: any) => {
      const persisted = (s.status ?? "beschikbaar") as SessionStatus;
      const effective = getCapacityStatus(persisted, enrolledCount || enrolledClients.length, minParticipants ?? null, maxParticipants ?? null);
      return { ...s, effectiveStatus: effective };
    });
  }, [sessions, enrolledCount, enrolledClients.length, minParticipants, maxParticipants]);

  // Filter sessions
  const filteredSessions = useMemo(() => {
    if (statusFilter === "alle") return sessionsWithEffectiveStatus;
    return sessionsWithEffectiveStatus.filter((s: any) => s.effectiveStatus === statusFilter);
  }, [sessionsWithEffectiveStatus, statusFilter]);

  const toggleAttendance = useMutation({
    mutationFn: async ({ sessionId, clientId, present }: { sessionId: string; clientId: string; present: boolean }) => {
      const key = `${sessionId}_${clientId}`;
      const existing = attMap.get(key);
      if (existing) {
        const { error } = await supabase.from("attendance").update({ present } as any).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("attendance").insert({ session_id: sessionId, client_id: clientId, present } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: attendanceKeys.all }),
    onError: (err: any) => toast({ title: "Fout", description: err.message, variant: "destructive" }),
  });

  const loading = sessionsLoading || attLoading || createSessionsMut.isPending;

  const tabContent = (
    <Tabs defaultValue="presentie" className="w-full">
      <TabsList className="w-full">
        <TabsTrigger value="presentie" className="flex-1">Presentielijst</TabsTrigger>
        <TabsTrigger value="bijeenkomsten" className="flex-1">Bijeenkomsten</TabsTrigger>
      </TabsList>

      <TabsContent value="presentie">
        {enrolledClients.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Geen deelnemers ingeschreven bij dit programma.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background z-10 min-w-[160px]">Deelnemer</TableHead>
                  {sessionsWithEffectiveStatus.map((s: any) => {
                    const config = SESSION_STATUS_CONFIG[s.effectiveStatus as SessionStatus] ?? SESSION_STATUS_CONFIG.beschikbaar;
                    return (
                      <TableHead key={s.id} className="text-center min-w-[44px] px-1">
                        <div className="flex flex-col items-center gap-0.5">
                          <span>{s.session_number}</span>
                          {s.effectiveStatus !== "beschikbaar" && (
                            <span className={`inline-block w-2 h-2 rounded-full ${config.className.split(" ")[0]}`} title={config.label} />
                          )}
                        </div>
                      </TableHead>
                    );
                  })}
                  <TableHead className="text-center min-w-[50px]">Totaal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {enrolledClients.map((client: any) => {
                  const presentCount = sessions.filter((s: any) => attMap.get(`${s.id}_${client.id}`)?.present).length;
                  return (
                    <TableRow key={client.id}>
                      <TableCell className="sticky left-0 bg-background z-10 font-medium whitespace-nowrap">
                        {client.first_name} {client.last_name}
                      </TableCell>
                      {sessions.map((s: any) => {
                        const isPresent = attMap.get(`${s.id}_${client.id}`)?.present ?? false;
                        return (
                          <TableCell key={s.id} className="text-center px-1">
                            <Checkbox
                              checked={isPresent}
                              onCheckedChange={(checked) =>
                                toggleAttendance.mutate({ sessionId: s.id, clientId: client.id, present: !!checked })
                              }
                            />
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-center font-semibold">{presentCount}/{sessions.length}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </TabsContent>

      <TabsContent value="bijeenkomsten" className="space-y-4">
        <ScheduleGenerator
          programId={programId}
          programName={programName}
          programStartDate={programStartDate}
          programEndDate={programEndDate}
          existingSessions={sessions}
          onGenerated={() => qc.invalidateQueries({ queryKey: programKeys.sessions(programId) })}
        />

        {/* Status filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Filter:</span>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-7 text-xs w-auto min-w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover">
              {STATUS_FILTER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Capacity info */}
          {(minParticipants || maxParticipants) && (
            <span className="text-xs text-muted-foreground ml-auto">
              Deelnemers: {enrolledCount || enrolledClients.length}
              {minParticipants ? ` (min: ${minParticipants})` : ""}
              {maxParticipants ? ` (max: ${maxParticipants})` : ""}
            </span>
          )}
        </div>

        <div className="space-y-3">
          {filteredSessions.map((s: any) => (
            <SessionDetails key={s.id} session={s} programId={programId} />
          ))}
          {filteredSessions.length === 0 && sessions.length > 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">Geen sessies met deze status.</p>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );

  if (inline) {
    return loading ? (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    ) : tabContent;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1 text-xs">
          <ClipboardList className="h-3.5 w-3.5" /> Presentielijst
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{programName}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : tabContent}
      </DialogContent>
    </Dialog>
  );
}
