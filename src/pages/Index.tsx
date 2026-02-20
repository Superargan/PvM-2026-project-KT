import { Users, GraduationCap, School, ClipboardList, ArrowRight, TrendingUp } from "lucide-react";
import StatCard from "@/components/StatCard";
import { Link } from "react-router-dom";

const recentAanmeldingen = [
  { naam: "Sofie de Vries", school: "Basisschool De Regenboog", status: "groen", datum: "19 feb 2026" },
  { naam: "Daan Jansen", school: "OBS Het Kompas", status: "oranje", datum: "18 feb 2026" },
  { naam: "Emma Bakker", school: "Daltonschool Zuid", status: "rood", datum: "17 feb 2026" },
  { naam: "Liam Peters", school: "Basisschool De Boomhut", status: "groen", datum: "16 feb 2026" },
];

const komendeProgrammas = [
  { naam: "Kanjergroep Voorjaar A", trainer: "Maria van den Berg", start: "3 mrt 2026", plekken: "8/10" },
  { naam: "Kanjergroep Voorjaar B", trainer: "Pieter de Groot", start: "5 mrt 2026", plekken: "6/10" },
  { naam: "Individueel Traject", trainer: "Aisha Mohamad", start: "10 mrt 2026", plekken: "3/5" },
];

export default function Dashboard() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl font-extrabold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Welkom terug! Hier is een overzicht van vandaag.</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Actieve Cliënten"
          value={124}
          subtitle="+8 deze maand"
          icon={<Users className="h-5 w-5" />}
          color="blauw"
        />
        <StatCard
          title="Lopende Programma's"
          value={7}
          subtitle="3 starten deze maand"
          icon={<GraduationCap className="h-5 w-5" />}
          color="groen"
        />
        <StatCard
          title="Partnerscholen"
          value={32}
          subtitle="Regio Amsterdam"
          icon={<School className="h-5 w-5" />}
          color="geel"
        />
        <StatCard
          title="Nieuwe Aanmeldingen"
          value={12}
          subtitle="Afgelopen 7 dagen"
          icon={<ClipboardList className="h-5 w-5" />}
          color="rood"
        />
      </div>

      {/* Content grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recente aanmeldingen */}
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="font-display text-base font-bold text-card-foreground">Recente Aanmeldingen</h2>
            <Link to="/aanmeldingen" className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
              Bekijk alle <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {recentAanmeldingen.map((item, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-semibold text-card-foreground">{item.naam}</p>
                  <p className="text-xs text-muted-foreground">{item.school}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`status-indicator status-${item.status}`}>
                    <span className={`inline-block h-1.5 w-1.5 rounded-full bg-status-${item.status}`} />
                    {item.status === "groen" ? "Compleet" : item.status === "oranje" ? "In behandeling" : "Incompleet"}
                  </span>
                  <span className="text-xs text-muted-foreground">{item.datum}</span>
                </div>
              </div>
            ))}
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
            {komendeProgrammas.map((item, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-semibold text-card-foreground">{item.naam}</p>
                  <p className="text-xs text-muted-foreground">Trainer: {item.trainer}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-card-foreground">{item.plekken}</p>
                  <p className="text-xs text-muted-foreground">Start {item.start}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
