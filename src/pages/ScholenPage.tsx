import { School, Upload, Search, Plus, MapPin, Phone } from "lucide-react";

const mockScholen = [
  { naam: "Basisschool De Regenboog", adres: "Keizersgracht 123, Amsterdam", contact: "info@regenboog.nl", telefoon: "020-1234567", gebied: "Amsterdam Centrum", leerlingen: 340 },
  { naam: "OBS Het Kompas", adres: "Vondelstraat 45, Amsterdam", contact: "directie@hetkompas.nl", telefoon: "020-2345678", gebied: "Amsterdam Zuid", leerlingen: 280 },
  { naam: "Daltonschool Zuid", adres: "Beethovenstraat 12, Amsterdam", contact: "info@daltonzuid.nl", telefoon: "020-3456789", gebied: "Amsterdam Zuid", leerlingen: 420 },
  { naam: "Basisschool De Boomhut", adres: "Overtoom 88, Amsterdam", contact: "info@boomhut.nl", telefoon: "020-4567890", gebied: "Amsterdam West", leerlingen: 310 },
];

export default function ScholenPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-foreground">Scholen</h1>
          <p className="text-sm text-muted-foreground">{mockScholen.length} partnerscholen geregistreerd</p>
        </div>
        <div className="flex gap-2">
          <button className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-card-foreground shadow-sm transition-colors hover:bg-accent">
            <Upload className="h-4 w-4" />
            CSV Import
          </button>
          <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">
            <Plus className="h-4 w-4" />
            School Toevoegen
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Zoek op naam, adres of gebied..."
          className="w-full rounded-lg border border-input bg-card py-2.5 pl-10 pr-4 text-sm text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">School</th>
              <th className="hidden px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground md:table-cell">Gebied</th>
              <th className="hidden px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:table-cell">Contact</th>
              <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Leerlingen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {mockScholen.map((school, i) => (
              <tr key={i} className="transition-colors hover:bg-muted/30">
                <td className="px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-kanjer-blauw/10">
                      <School className="h-4 w-4 text-kanjer-blauw" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-card-foreground">{school.naam}</p>
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" /> {school.adres}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="hidden px-5 py-4 md:table-cell">
                  <span className="inline-flex items-center rounded-md bg-accent px-2 py-1 text-xs font-medium text-accent-foreground">
                    {school.gebied}
                  </span>
                </td>
                <td className="hidden px-5 py-4 lg:table-cell">
                  <p className="text-sm text-card-foreground">{school.contact}</p>
                  <p className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Phone className="h-3 w-3" /> {school.telefoon}
                  </p>
                </td>
                <td className="px-5 py-4 text-right">
                  <span className="font-display text-sm font-bold text-card-foreground">{school.leerlingen}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
