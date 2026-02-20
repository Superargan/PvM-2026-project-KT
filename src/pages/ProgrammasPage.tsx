import { GraduationCap, Users, Calendar, Plus } from "lucide-react";

const mockProgrammas = [
  { naam: "Kanjergroep Voorjaar A", trainer: "Maria van den Berg", start: "3 mrt 2026", eind: "12 mei 2026", deelnemers: 8, max: 10, status: "gepland" },
  { naam: "Kanjergroep Voorjaar B", trainer: "Pieter de Groot", start: "5 mrt 2026", eind: "14 mei 2026", deelnemers: 6, max: 10, status: "gepland" },
  { naam: "Individueel Traject", trainer: "Aisha Mohamad", start: "10 mrt 2026", eind: "30 jun 2026", deelnemers: 3, max: 5, status: "gepland" },
  { naam: "Kanjergroep Winter", trainer: "Maria van den Berg", start: "6 jan 2026", eind: "20 feb 2026", deelnemers: 10, max: 10, status: "actief" },
];

const statusMap: Record<string, string> = {
  actief: "status-groen",
  gepland: "status-oranje",
  afgerond: "status-rood",
};

export default function ProgrammasPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-foreground">Programma's</h1>
          <p className="text-sm text-muted-foreground">Trainingsgroepen en individuele trajecten</p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">
          <Plus className="h-4 w-4" />
          Programma Aanmaken
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {mockProgrammas.map((prog, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex items-start justify-between">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-kanjer-geel/10">
                <GraduationCap className="h-5 w-5 text-kanjer-geel" />
              </div>
              <span className={`status-indicator ${statusMap[prog.status]}`}>
                {prog.status.charAt(0).toUpperCase() + prog.status.slice(1)}
              </span>
            </div>
            <h3 className="mt-3 font-display text-base font-bold text-card-foreground">{prog.naam}</h3>
            <p className="text-xs text-muted-foreground">Trainer: {prog.trainer}</p>
            <div className="mt-4 space-y-2 border-t border-border pt-3">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Users className="h-3.5 w-3.5" /> Deelnemers
                </span>
                <span className="font-semibold text-card-foreground">{prog.deelnemers}/{prog.max}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Calendar className="h-3.5 w-3.5" /> Periode
                </span>
                <span className="text-card-foreground">{prog.start} – {prog.eind}</span>
              </div>
              {/* Progress bar */}
              <div className="h-1.5 w-full rounded-full bg-muted">
                <div
                  className="h-1.5 rounded-full bg-kanjer-groen transition-all"
                  style={{ width: `${(prog.deelnemers / prog.max) * 100}%` }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
