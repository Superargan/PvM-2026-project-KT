import { FileText } from "lucide-react";

export default function DocumentenPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-foreground">Documenten</h1>
        <p className="text-sm text-muted-foreground">Document merge, certificaten en verslagen</p>
      </div>
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-card py-16">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-kanjer-geel/10">
          <FileText className="h-7 w-7 text-kanjer-geel" />
        </div>
        <h2 className="mt-4 font-display text-lg font-bold text-card-foreground">Document Merge</h2>
        <p className="mt-1 max-w-sm text-center text-sm text-muted-foreground">
          Genereer automatisch certificaten en verslagen door databasevelden samen te voegen met templates. Wordt gebouwd in Fase 6.
        </p>
      </div>
    </div>
  );
}
