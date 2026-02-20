import { ClipboardList } from "lucide-react";

export default function AanmeldingenPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-foreground">Aanmeldingen</h1>
        <p className="text-sm text-muted-foreground">Intake- en aanmeldformulieren beheren</p>
      </div>
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card py-16">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-kanjer-rood/10">
          <ClipboardList className="h-7 w-7 text-kanjer-rood" />
        </div>
        <h2 className="mt-4 font-display text-lg font-bold text-card-foreground">Aanmeldmodule</h2>
        <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
          De publieke aanmeldroute (/aanmelden) en het intake formulier met progressie-indicator worden hier gebouwd in Fase 2.
        </p>
      </div>
    </div>
  );
}
