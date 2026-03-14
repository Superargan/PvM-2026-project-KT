import { Users, GraduationCap, School, ClipboardList, ArrowRight, UserCog, Clock } from "lucide-react";
import StatCard from "@/components/StatCard";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { schoolKeys, clientKeys, programKeys, staffKeys } from "@/lib/queryKeys";

export default function Dashboard() {
  const { data: clientCount = 0 } = useQuery({
    queryKey: clientKeys.dashboard("participants"),
    queryFn: async () => {
      const { count } = await supabase
        .from("clients")
        .select("*", { count: "exact", head: true })
        .eq("archived", false)
        .in("intake_status", ["actief", "training_afgerond", "tussentijds_gestopt"]);
      return count ?? 0;
    },
  });

  const { data: programCount = 0 } = useQuery({
    queryKey: programKeys.dashboard,
    queryFn: async () => {
      const { count } = await supabase.from("programs").select("*", { count: "exact", head: true }).eq("archived", false).eq("status", "te_plannen");
      return count ?? 0;
    },
  });

  const { data: schoolCount = 0 } = useQuery({
    queryKey: schoolKeys.dashboard,
    queryFn: async () => {
      const { count } = await supabase.from("schools").select("*", { count: "exact", head: true });
      return count ?? 0;
    },
  });

  const { data: newClientCount = 0 } = useQuery({
    queryKey: ["clients", "dashboard", "new"],
    queryFn: async () => {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const year = weekAgo.getFullYear();
      const month = String(weekAgo.getMonth() + 1).padStart(2, "0");
      const day = String(weekAgo.getDate()).padStart(2, "0");
      const weekAgoLocal = `${year}-${month}-${day}`;
      const { count } = await supabase.from("clients").select("*", { count: "exact", head: true }).eq("archived", false).gte("registration_date", weekAgoLocal);
      return count ?? 0;
    },
  });

  const { data: trainerCount = 0 } = useQuery({
    queryKey: ["dashboard-trainers"],
    queryFn: async () => {
      const { count } = await supabase.from("staff").select("*", { count: "exact", head: true }).eq("archived", false).not("name", "is", null);
      return count ?? 0;
    },
  });

  const { data: intakeGeplandCount = 0 } = useQuery({
    queryKey: ["clients", "dashboard", "intake-gepland"],
    queryFn: async () => {
      const { count } = await supabase.from("clients").select("*", { count: "exact", head: true }).eq("archived", false).eq("intake_status", "intake_gepland");
      return count ?? 0;
    },
  });

  const { data: waitlistCount = 0 } = useQuery({
    queryKey: ["clients", "dashboard", "waitlist"],
    queryFn: async () => {
      const { count } = await supabase
        .from("clients")
        .select("*", { count: "exact", head: true })
        .eq("archived", false)
        .not("waitlist_status", "is", null);
      return count ?? 0;
    },
  });

  const { data: recentClients = [] } = useQuery({
    queryKey: ["clients", "dashboard", "recent"],
    queryFn: async () => {
      const { data } = await supabase
        .from("clients")
        .select("id, first_name, last_name, intake_status, created_at, schools(name)")
        .eq("archived", false)
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  const { data: upcomingPrograms = [] } = useQuery({
    queryKey: ["dashboard-upcoming-programs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("programs")
        .select("id, name, start_date, max_participants, status, program_clients(count)")
        .in("status", ["te_plannen", "ingepland", "gestart"])
        .order("start_date", { ascending: true })
        .limit(4);
      return data ?? [];
    },
  });

  const statusMap: Record<string, { label: string; color: string }> = {
    nieuw: { label: "Nieuw", color: "rood" },
    intake_gepland: { label: "Intake gepland", color: "oranje" },
    intake: { label: "Intake", color: "oranje" },
    intake_afgerond: { label: "Intake afgerond", color: "groen" },
    actief: { label: "Actief", color: "groen" },
    wachtlijst: { label: "Wachtlijst", color: "oranje" },
    niet_deelnemen: { label: "Niet deelnemen", color: "rood" },
    afgerond: { label: "Afgerond", color: "groen" },
    te_plannen: { label: "Te plannen", color: "rood" },
    ingepland: { label: "Ingepland", color: "oranje" },
    gestart: { label: "Gestart", color: "groen" },
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Welkom terug! Hier is een overzicht van vandaag.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <StatCard title="Deelnemers" value={clientCount} icon={<Users className="h-5 w-5" />} color="blauw" to="/clienten" />
        <StatCard title="In te plannen trainingen" value={programCount} icon={<GraduationCap className="h-5 w-5" />} color="groen" to="/programmas" />
        <StatCard title="PO Scholen Rotterdam" value={schoolCount} icon={<School className="h-5 w-5" />} color="geel" to="/scholen" />
        <StatCard title="Trainers" value={trainerCount} icon={<UserCog className="h-5 w-5" />} color="blauw" to="/medewerkers" />
        <StatCard title="Geplande intakes" value={intakeGeplandCount} icon={<ClipboardList className="h-5 w-5" />} color="oranje" to="/aanmeldingen" />
        <StatCard title="Nieuwe Aanmeldingen" value={newClientCount} subtitle="Afgelopen 7 dagen" icon={<ClipboardList className="h-5 w-5" />} color="rood" to="/aanmeldingen" />
        <StatCard title="Wachtlijst" value={waitlistCount} icon={<Clock className="h-5 w-5" />} color="oranje" to="/wachtlijst" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recente aanmeldingen */}
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="font-display text-base font-bold text-card-foreground">Recente Aanmeldingen</h2>
            <Link to="/clienten" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              Bekijk alle <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {recentClients.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nog geen deelnemers aangemeld</p>
            )}
            {recentClients.map((client: any) => {
              const st = statusMap[client.intake_status] ?? statusMap.nieuw;
              return (
                <Link key={client.id} to={`/clienten/${client.id}`} className="flex items-center justify-between px-5 py-3 hover:bg-muted/50 transition-colors">
                  <div>
                    <p className="text-sm font-semibold text-card-foreground">
                      {client.first_name} {client.last_name}
                    </p>
                    <p className="text-xs text-muted-foreground">{client.schools?.name ?? "Geen school"}</p>
                  </div>
                  <span className={`status-indicator status-${st.color}`}>
                    <span className={`inline-block h-1.5 w-1.5 rounded-full bg-status-${st.color}`} />
                    {st.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Komende programma's */}
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="font-display text-base font-bold text-card-foreground">Komende Programma's</h2>
            <Link to="/programmas" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              Bekijk alle <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {upcomingPrograms.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nog geen programma's gepland</p>
            )}
            {upcomingPrograms.map((prog: any) => {
              const enrolled = prog.program_clients?.[0]?.count ?? 0;
              return (
                <Link key={prog.id} to="/programmas" className="flex items-center justify-between px-5 py-3 hover:bg-muted/50 transition-colors">
                  <div>
                    <p className="text-sm font-semibold text-card-foreground">{prog.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{prog.status}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-card-foreground">{enrolled}/{prog.max_participants ?? "∞"}</p>
                    <p className="text-xs text-muted-foreground">
                      {prog.start_date ? new Date(prog.start_date).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
