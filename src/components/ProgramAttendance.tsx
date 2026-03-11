import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, ClipboardList } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import SessionDetails from "@/components/SessionDetails";
import ScheduleGenerator from "@/components/ScheduleGenerator";

interface Props {
  programId: string;
  programName: string;
  programStartDate?: string | null;
  inline?: boolean;
}

export default function ProgramAttendance({ programId, programName, inline = false }: Props) {
  const [open, setOpen] = useState(inline ? true : false);
  const { toast } = useToast();
  const qc = useQueryClient();
  const SESSION_COUNT = programName.startsWith("KT") ? 10 : 8;

  const { data: sessions = [], isLoading: sessionsLoading } = useQuery({
    queryKey: ["program_sessions", programId],
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["program_sessions", programId] }),
  });

  useEffect(() => {
    if (open && !sessionsLoading && sessions.length === 0) {
      createSessionsMut.mutate();
    }
  }, [open, sessionsLoading, sessions.length]);

  const { data: enrolledClients = [] } = useQuery({
    queryKey: ["program_clients_detail", programId],
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
    queryKey: ["attendance", programId, sessionIds],
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["attendance", programId] }),
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
                  {sessions.map((s: any) => (
                    <TableHead key={s.id} className="text-center min-w-[44px] px-1">{s.session_number}</TableHead>
                  ))}
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

      <TabsContent value="bijeenkomsten">
        <div className="space-y-3">
          {sessions.map((s: any) => (
            <SessionDetails key={s.id} session={s} programId={programId} />
          ))}
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

