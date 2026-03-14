import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { programKeys, clientKeys } from "@/lib/queryKeys";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  CalendarDays, Clock, Wand2, AlertTriangle, Check, Pencil, RotateCcw, Users, Info, ShieldAlert,
} from "lucide-react";
import { format, addWeeks, getDay } from "date-fns";
import { nl } from "date-fns/locale";
import { isSpecialDay, type Holiday, type SchoolVacation } from "@/lib/holidays";
import {
  type SessionStatus, type OverrideType,
  getStatusForDate, SESSION_STATUS_CONFIG, getOverrideConfirmMessage,
} from "@/lib/sessionStatus";

interface Props {
  programId: string;
  programName: string;
  programStartDate?: string | null;
  programEndDate?: string | null;
  existingSessions: any[];
  onGenerated: () => void;
}

interface GeneratedSession {
  session_number: number;
  date: string;
  dayName: string;
  start_time: string;
  end_time: string;
  location: string;
  holidays: Holiday[];
  vacation?: SchoolVacation;
  status: SessionStatus;
  skippedDate?: string;
  editing: boolean;
  overrideReason?: string;
}

const DAY_NAMES = ["Zondag", "Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag"];
const DAY_OPTIONS = [
  { value: "1", label: "Maandag" },
  { value: "2", label: "Dinsdag" },
  { value: "3", label: "Woensdag" },
  { value: "4", label: "Donderdag" },
  { value: "5", label: "Vrijdag" },
  { value: "6", label: "Zaterdag" },
  { value: "0", label: "Zondag" },
];

function getSessionCount(programName: string): number {
  if (programName.startsWith("KT")) return 10;
  if (programName.startsWith("SV")) return 12;
  return 10;
}

function generateDates(
  startDate: Date,
  weekday: number,
  count: number,
  startTime: string,
  endTime: string,
  location: string,
  programEndDate?: string | null
): GeneratedSession[] {
  const sessions: GeneratedSession[] = [];
  let current = new Date(startDate);

  while (getDay(current) !== weekday) {
    current.setDate(current.getDate() + 1);
  }

  let sessionNum = 1;
  const maxIterations = count * 4; // safety
  let iterations = 0;

  while (sessions.length < count && iterations < maxIterations) {
    iterations++;
    const dateStr = format(current, "yyyy-MM-dd");

    // Check if beyond program end date
    if (programEndDate && dateStr > programEndDate) break;

    const status = getStatusForDate(dateStr);
    const special = isSpecialDay(dateStr);
    const isBlocked = status === "feestdag" || status === "schoolvakantie";

    if (isBlocked) {
      // Skip and try next week
      const skippedDate = dateStr;
      current = addWeeks(current, 1);
      const nextDateStr = format(current, "yyyy-MM-dd");
      const nextStatus = getStatusForDate(nextDateStr);
      const nextSpecial = isSpecialDay(nextDateStr);

      sessions.push({
        session_number: sessionNum,
        date: nextDateStr,
        dayName: DAY_NAMES[getDay(current)],
        start_time: startTime,
        end_time: endTime,
        location,
        holidays: nextSpecial.holidays,
        vacation: nextSpecial.vacation,
        status: nextStatus,
        skippedDate,
        editing: false,
      });
    } else {
      sessions.push({
        session_number: sessionNum,
        date: dateStr,
        dayName: DAY_NAMES[getDay(current)],
        start_time: startTime,
        end_time: endTime,
        location,
        holidays: special.holidays,
        vacation: special.vacation,
        status,
        editing: false,
      });
    }

    sessionNum++;
    current = addWeeks(current, 1);
  }

  return sessions;
}

export default function ScheduleGenerator({ programId, programName, programStartDate, programEndDate, existingSessions, onGenerated }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const sessionCount = getSessionCount(programName);
  const hasExistingDates = existingSessions.some((s: any) => s.session_date);

  const [weekday, setWeekday] = useState<string>("3");
  const [startTime, setStartTime] = useState("14:00");
  const [endTime, setEndTime] = useState("15:30");
  const [startDate, setStartDate] = useState(programStartDate ?? "");
  const [location, setLocation] = useState("");
  const [generated, setGenerated] = useState<GeneratedSession[] | null>(null);
  const [overrideDialog, setOverrideDialog] = useState<{
    index: number;
    session: GeneratedSession;
    overrideType: OverrideType;
  } | null>(null);
  const [overrideReason, setOverrideReason] = useState("");

  // Fetch enrolled clients for availability check
  const { data: enrolledClients = [] } = useQuery({
    queryKey: programKeys.clients(programId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("program_clients")
        .select("client_id, clients(id, first_name, last_name)")
        .eq("program_id", programId);
      if (error) throw error;
      return (data ?? []).map((pc: any) => pc.clients).filter(Boolean);
    },
  });

  // Fetch client availability
  const clientIds = enrolledClients.map((c: any) => c.id);
  const { data: availability = [] } = useQuery({
    queryKey: ["client_availability_for_schedule", clientIds],
    enabled: clientIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_availability")
        .select("*")
        .in("client_id", clientIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Suggest time based on most common availability
  const suggestedTime = useMemo(() => {
    if (availability.length === 0) return null;
    const timeCounts: Record<string, number> = {};
    availability.forEach((a: any) => {
      const key = `${a.start_time ?? "09:00"}-${a.end_time ?? "17:00"}`;
      timeCounts[key] = (timeCounts[key] || 0) + 1;
    });
    const best = Object.entries(timeCounts).sort((a, b) => b[1] - a[1])[0];
    if (best) {
      const [s, e] = best[0].split("-");
      return { start: s?.substring(0, 5), end: e?.substring(0, 5), count: best[1] };
    }
    return null;
  }, [availability]);

  // Check availability conflicts for generated sessions
  const availabilityWarnings = useMemo(() => {
    if (!generated || enrolledClients.length === 0) return {};
    const warnings: Record<number, { client: any; availableTimes: string }[]> = {};

    generated.forEach((session, idx) => {
      const sessionDate = session.date;
      enrolledClients.forEach((client: any) => {
        const clientAvail = availability.filter((a: any) => a.client_id === client.id && a.available_date === sessionDate);
        if (clientAvail.length === 0) {
          if (!warnings[idx]) warnings[idx] = [];
          warnings[idx].push({ client, availableTimes: "geen beschikbaarheid opgegeven" });
        } else {
          const sessionStart = session.start_time;
          const sessionEnd = session.end_time;
          const fits = clientAvail.some((a: any) => {
            const aStart = (a.start_time ?? "09:00").substring(0, 5);
            const aEnd = (a.end_time ?? "17:00").substring(0, 5);
            return sessionStart >= aStart && sessionEnd <= aEnd;
          });
          if (!fits) {
            if (!warnings[idx]) warnings[idx] = [];
            const times = clientAvail.map((a: any) =>
              `${(a.start_time ?? "09:00").substring(0, 5)}-${(a.end_time ?? "17:00").substring(0, 5)}`
            ).join(", ");
            warnings[idx].push({ client, availableTimes: times });
          }
        }
      });
    });
    return warnings;
  }, [generated, enrolledClients, availability]);

  const handleGenerate = () => {
    if (!startDate) {
      toast({ title: "Kies een startdatum", variant: "destructive" });
      return;
    }

    // Validate: no past dates
    const today = format(new Date(), "yyyy-MM-dd");
    if (startDate < today) {
      toast({ title: "Startdatum mag niet in het verleden liggen", variant: "destructive" });
      return;
    }

    const sessions = generateDates(
      new Date(startDate),
      parseInt(weekday),
      sessionCount,
      startTime,
      endTime,
      location,
      programEndDate
    );
    setGenerated(sessions);
  };

  const handleEditSession = (index: number, field: string, value: string) => {
    if (!generated) return;
    const updated = [...generated];
    const session = { ...updated[index] };

    if (field === "date") {
      const newStatus = getStatusForDate(value);
      const special = isSpecialDay(value);
      session.date = value;
      session.dayName = DAY_NAMES[new Date(value).getDay()];
      session.holidays = special.holidays;
      session.vacation = special.vacation;
      session.status = newStatus;
      session.overrideReason = undefined;
    } else if (field === "start_time") {
      session.start_time = value;
    } else if (field === "end_time") {
      session.end_time = value;
    } else if (field === "location") {
      session.location = value;
    }

    updated[index] = session;
    setGenerated(updated);
  };

  const toggleEdit = (index: number) => {
    if (!generated) return;
    const updated = [...generated];
    updated[index] = { ...updated[index], editing: !updated[index].editing };
    setGenerated(updated);
  };

  const handleOverrideConfirm = async () => {
    if (!overrideDialog || !overrideReason.trim() || !generated) return;
    const { index } = overrideDialog;
    const updated = [...generated];
    updated[index] = {
      ...updated[index],
      status: "handmatig_vrijgegeven",
      overrideReason: overrideReason.trim(),
    };
    setGenerated(updated);
    setOverrideDialog(null);
    setOverrideReason("");
  };

  // Save to database
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!generated) return;

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;

      // Delete existing sessions for this program
      if (existingSessions.length > 0) {
        const { error: delErr } = await supabase
          .from("program_sessions")
          .delete()
          .eq("program_id", programId);
        if (delErr) throw delErr;
      }

      // Insert new sessions with status
      const rows = generated.map((s) => ({
        program_id: programId,
        session_number: s.session_number,
        session_date: s.date,
        start_time: s.start_time || null,
        end_time: s.end_time || null,
        location: s.location || null,
        status: s.status,
      }));

      const { data: insertedSessions, error } = await supabase
        .from("program_sessions")
        .insert(rows as any)
        .select("id, session_number");
      if (error) throw error;

      // Log overrides
      const overrideSessions = generated.filter((s) => s.status === "handmatig_vrijgegeven" && s.overrideReason);
      if (overrideSessions.length > 0 && insertedSessions && userId) {
        const overrideLogs = overrideSessions.map((s) => {
          const inserted = insertedSessions.find((is: any) => is.session_number === s.session_number);
          if (!inserted) return null;
          // Determine original override type from skipped/conflict info
          const special = isSpecialDay(s.date);
          let overrideType: OverrideType = "handmatige_blokkade";
          if (special.holidays.length > 0) overrideType = "feestdag";
          else if (special.vacation) overrideType = "schoolvakantie";

          return {
            session_id: inserted.id,
            overridden_by: userId,
            override_type: overrideType,
            reason: s.overrideReason!,
          };
        }).filter(Boolean);

        if (overrideLogs.length > 0) {
          await supabase.from("session_override_logs").insert(overrideLogs as any);
        }
      }

      // Update program end_date based on last session
      const lastDate = generated[generated.length - 1]?.date;
      if (lastDate) {
        await supabase.from("programs").update({ end_date: lastDate }).eq("id", programId);
      }
    },
    onSuccess: () => {
      toast({ title: "Planning opgeslagen", description: `${generated?.length} sessies aangemaakt` });
      qc.invalidateQueries({ queryKey: ["program_sessions", programId] });
      qc.invalidateQueries({ queryKey: ["program", programId] });
      setGenerated(null);
      onGenerated();
    },
    onError: (err: any) => toast({ title: "Fout", description: err.message, variant: "destructive" }),
  });

  const skippedDates = generated?.filter((s) => s.skippedDate) ?? [];
  const blockedSessions = generated?.filter((s) => s.status === "feestdag" || s.status === "schoolvakantie") ?? [];

  const statusBadge = (status: SessionStatus) => {
    const config = SESSION_STATUS_CONFIG[status];
    return (
      <Badge variant="outline" className={`text-xs ${config.className}`}>
        {config.label}
      </Badge>
    );
  };

  return (
    <div className="space-y-4">
      {/* Generator form */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Wand2 className="h-4 w-4 text-primary" />
          Planning genereren ({sessionCount} sessies)
        </div>

        {suggestedTime && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-2">
            <Info className="h-3.5 w-3.5 shrink-0" />
            <span>
              Meest voorkomende beschikbaarheid: <strong>{suggestedTime.start}–{suggestedTime.end}</strong> ({suggestedTime.count}x)
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs ml-auto"
              onClick={() => {
                setStartTime(suggestedTime.start);
                setEndTime(suggestedTime.end);
              }}
            >
              Overnemen
            </Button>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Startdatum</label>
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="h-8 text-sm"
              min={format(new Date(), "yyyy-MM-dd")}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Weekdag</label>
            <Select value={weekday} onValueChange={setWeekday}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover">
                {DAY_OPTIONS.map((d) => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Starttijd</label>
            <Input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Eindtijd</label>
            <Input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Locatie</label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="School / adres"
              className="h-8 text-sm"
            />
          </div>
        </div>

        <Button onClick={handleGenerate} className="gap-1.5">
          <Wand2 className="h-4 w-4" />
          {hasExistingDates ? "Opnieuw genereren" : "Genereer planning"}
        </Button>
      </div>

      {/* Skipped dates info */}
      {skippedDates.length > 0 && (
        <div className="rounded-lg border border-amber-300/50 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" />
            Overgeslagen datums
          </div>
          <ul className="text-xs text-amber-700 dark:text-amber-400 space-y-0.5">
            {skippedDates.map((s) => {
              const skippedSpecial = isSpecialDay(s.skippedDate!);
              const reason = skippedSpecial.holidays.map((h) => h.name).join(", ") || skippedSpecial.vacation?.name || "Feestdag/vakantie";
              return (
                <li key={s.skippedDate}>
                  <strong>{format(new Date(s.skippedDate!), "EEEE d MMMM yyyy", { locale: nl })}</strong> — {reason}
                  {" → verschoven naar "}
                  <strong>{format(new Date(s.date), "d MMMM", { locale: nl })}</strong>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Generated preview table */}
      {generated && (
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Datum</TableHead>
                  <TableHead>Dag</TableHead>
                  <TableHead>Tijdstip</TableHead>
                  <TableHead>Locatie</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {generated.map((session, idx) => {
                  const isBlocked = session.status === "feestdag" || session.status === "schoolvakantie";
                  return (
                    <TableRow
                      key={idx}
                      className={isBlocked ? "bg-destructive/5" : ""}
                    >
                      <TableCell className="font-medium text-sm">{session.session_number}</TableCell>
                      <TableCell>
                        {session.editing ? (
                          <Input
                            type="date"
                            value={session.date}
                            onChange={(e) => handleEditSession(idx, "date", e.target.value)}
                            className="h-7 text-xs w-40"
                          />
                        ) : (
                          <span className="text-sm">
                            {format(new Date(session.date), "d MMMM yyyy", { locale: nl })}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{session.dayName}</TableCell>
                      <TableCell>
                        {session.editing ? (
                          <div className="flex gap-1">
                            <Input
                              type="time"
                              value={session.start_time}
                              onChange={(e) => handleEditSession(idx, "start_time", e.target.value)}
                              className="h-7 text-xs w-24"
                            />
                            <Input
                              type="time"
                              value={session.end_time}
                              onChange={(e) => handleEditSession(idx, "end_time", e.target.value)}
                              className="h-7 text-xs w-24"
                            />
                          </div>
                        ) : (
                          <span className="text-sm">{session.start_time}–{session.end_time}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {session.editing ? (
                          <Input
                            value={session.location}
                            onChange={(e) => handleEditSession(idx, "location", e.target.value)}
                            className="h-7 text-xs w-40"
                          />
                        ) : (
                          <span className="text-sm text-muted-foreground">{session.location || "—"}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {statusBadge(session.status)}
                          {isBlocked && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 text-amber-600"
                              title="Override (alleen admin)"
                              onClick={() => {
                                const overrideType: OverrideType = session.status === "feestdag" ? "feestdag" : "schoolvakantie";
                                setOverrideDialog({ index: idx, session, overrideType });
                                setOverrideReason("");
                              }}
                            >
                              <ShieldAlert className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => toggleEdit(idx)}
                        >
                          {session.editing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Availability warnings */}
          {Object.keys(availabilityWarnings).length > 0 && (
            <div className="rounded-lg border border-amber-300/50 bg-amber-50 dark:bg-amber-950/20 p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
                <Users className="h-4 w-4" />
                Beschikbaarheidswaarschuwingen
              </div>
              {Object.entries(availabilityWarnings).map(([idx, warnings]) => {
                const session = generated[parseInt(idx)];
                return (
                  <div key={idx} className="text-xs text-amber-700 dark:text-amber-400">
                    <strong>Sessie {session.session_number} ({format(new Date(session.date), "d MMM", { locale: nl })})</strong>:
                    <ul className="ml-4 mt-0.5 space-y-0.5">
                      {warnings.map((w: any) => (
                        <li key={w.client.id}>
                          {w.client.first_name} {w.client.last_name} — {w.availableTimes}
                          {w.availableTimes !== "geen beschikbaarheid opgegeven" && (
                            <span className="italic ml-1">→ Vraag of ander tijdstip mogelijk is</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-3">
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="gap-1.5"
            >
              {saveMutation.isPending ? (
                <Clock className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Bevestig planning
            </Button>
            {blockedSessions.length > 0 && (
              <span className="text-xs text-amber-600">
                {blockedSessions.length} sessie(s) geblokkeerd (feestdag/vakantie)
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-xs ml-auto"
              onClick={() => setGenerated(null)}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Annuleren
            </Button>
          </div>
        </div>
      )}

      {/* Override confirmation dialog */}
      <AlertDialog open={!!overrideDialog} onOpenChange={() => { setOverrideDialog(null); setOverrideReason(""); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-600" />
              Override bevestigen
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {overrideDialog && (
                  <>
                    <p>{getOverrideConfirmMessage(overrideDialog.overrideType)}</p>
                    <p>
                      <strong>{format(new Date(overrideDialog.session.date), "EEEE d MMMM yyyy", { locale: nl })}</strong>
                      {overrideDialog.session.holidays.length > 0 && (
                        <> — {overrideDialog.session.holidays.map(h => h.name).join(", ")}</>
                      )}
                      {overrideDialog.session.vacation && (
                        <> — {overrideDialog.session.vacation.name}</>
                      )}
                    </p>
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
                  </>
                )}
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
