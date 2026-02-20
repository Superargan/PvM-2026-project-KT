import { UserCog, Plus, Search, Mail, Phone } from "lucide-react";

const mockStaff = [
  { naam: "Maria van den Berg", rol: "Trainer", email: "maria@kanjertraining.nl", telefoon: "06-12345678", specialisatie: "Groepstraining", actieveGroepen: 3 },
  { naam: "Pieter de Groot", rol: "Trainer", email: "pieter@kanjertraining.nl", telefoon: "06-23456789", specialisatie: "Individueel & Groep", actieveGroepen: 2 },
  { naam: "Aisha Mohamad", rol: "Trainer", email: "aisha@kanjertraining.nl", telefoon: "06-34567890", specialisatie: "Individuele trajecten", actieveGroepen: 1 },
  { naam: "Jan Willem Smit", rol: "Backoffice", email: "janwillem@kanjertraining.nl", telefoon: "06-45678901", specialisatie: "Administratie", actieveGroepen: 0 },
  { naam: "Lisa Vermeer", rol: "Backoffice", email: "lisa@kanjertraining.nl", telefoon: "06-56789012", specialisatie: "Communicatie", actieveGroepen: 0 },
];

const rolColors: Record<string, string> = {
  Trainer: "bg-kanjer-groen/10 text-kanjer-groen",
  Backoffice: "bg-kanjer-blauw/10 text-kanjer-blauw",
};

export default function MedewerkersPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-foreground">Medewerkers</h1>
          <p className="text-sm text-muted-foreground">{mockStaff.length} teamleden</p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">
          <Plus className="h-4 w-4" />
          Medewerker Toevoegen
        </button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Zoek op naam, rol of specialisatie..."
          className="w-full rounded-lg border border-input bg-card py-2.5 pl-10 pr-4 text-sm text-card-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {mockStaff.map((person, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 font-display text-sm font-bold text-primary">
                {person.naam.split(" ").map(n => n[0]).join("").slice(0, 2)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-display text-sm font-bold text-card-foreground">{person.naam}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${rolColors[person.rol] || ""}`}>
                    {person.rol}
                  </span>
                  <span className="text-xs text-muted-foreground">{person.specialisatie}</span>
                </div>
              </div>
            </div>
            <div className="mt-4 space-y-2 border-t border-border pt-3">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Mail className="h-3.5 w-3.5" /> {person.email}
              </p>
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Phone className="h-3.5 w-3.5" /> {person.telefoon}
              </p>
              {person.actieveGroepen > 0 && (
                <p className="text-xs font-medium text-kanjer-groen">
                  {person.actieveGroepen} actieve groep{person.actieveGroepen > 1 ? "en" : ""}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
