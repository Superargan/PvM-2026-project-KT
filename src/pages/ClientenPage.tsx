import { Users, Search, Filter, Eye } from "lucide-react";

const mockClienten = [
  { naam: "Sofie de Vries", geboortedatum: "12-03-2016", leeftijd: 9, school: "De Regenboog", programma: "Kanjergroep Voorjaar A", status: "actief" },
  { naam: "Daan Jansen", geboortedatum: "05-08-2015", leeftijd: 10, school: "OBS Het Kompas", programma: "Kanjergroep Voorjaar B", status: "actief" },
  { naam: "Emma Bakker", geboortedatum: "22-11-2014", leeftijd: 11, school: "Daltonschool Zuid", programma: "Individueel Traject", status: "wachtlijst" },
  { naam: "Liam Peters", geboortedatum: "01-06-2016", leeftijd: 9, school: "De Boomhut", programma: "Kanjergroep Voorjaar A", status: "actief" },
  { naam: "Nora El Amrani", geboortedatum: "17-09-2015", leeftijd: 10, school: "De Regenboog", programma: "—", status: "intake" },
];

const statusStyles: Record<string, string> = {
  actief: "status-groen",
  wachtlijst: "status-oranje",
  intake: "status-rood",
};

const statusLabels: Record<string, string> = {
  actief: "Actief",
  wachtlijst: "Wachtlijst",
  intake: "Intake",
};

export default function ClientenPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-foreground">Cliënten</h1>
          <p className="text-sm text-muted-foreground">{mockClienten.length} cliënten in het systeem</p>
        </div>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Zoek op naam of school..."
            className="w-full rounded-lg border border-input bg-card py-2.5 pl-10 pr-4 text-sm text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-card-foreground shadow-sm hover:bg-accent">
          <Filter className="h-4 w-4" /> Filter
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Naam</th>
              <th className="hidden px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground sm:table-cell">Leeftijd</th>
              <th className="hidden px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground md:table-cell">School</th>
              <th className="hidden px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:table-cell">Programma</th>
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {mockClienten.map((client, i) => (
              <tr key={i} className="transition-colors hover:bg-muted/30">
                <td className="px-5 py-4">
                  <p className="text-sm font-semibold text-card-foreground">{client.naam}</p>
                  <p className="text-xs text-muted-foreground sm:hidden">
                    {client.leeftijd} jaar • {client.school}
                  </p>
                </td>
                <td className="hidden px-5 py-4 sm:table-cell">
                  <span className="text-sm text-card-foreground">{client.leeftijd} jaar</span>
                </td>
                <td className="hidden px-5 py-4 md:table-cell">
                  <span className="text-sm text-card-foreground">{client.school}</span>
                </td>
                <td className="hidden px-5 py-4 lg:table-cell">
                  <span className="text-sm text-card-foreground">{client.programma}</span>
                </td>
                <td className="px-5 py-4">
                  <span className={`status-indicator ${statusStyles[client.status]}`}>
                    {statusLabels[client.status]}
                  </span>
                </td>
                <td className="px-5 py-4 text-right">
                  <button className="text-muted-foreground hover:text-foreground">
                    <Eye className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
