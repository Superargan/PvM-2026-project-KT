import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useMemo } from "react";
import { normalizeSchoolName } from "@/lib/DomainResolver";

interface SchoolDuplicateWarningProps {
  name: string;
  excludeId?: string;
  schools: any[];
}

export default function SchoolDuplicateWarning({ name, excludeId, schools }: SchoolDuplicateWarningProps) {
  const matches = useMemo(() => {
    const trimmed = name.trim();
    if (trimmed.length < 3) return [];
    const normalized = normalizeSchoolName(trimmed);

    return schools.filter((s) => {
      if (excludeId && s.id === excludeId) return false;
      const sNorm = normalizeSchoolName(s.name ?? "");
      return sNorm === normalized || sNorm.includes(normalized) || normalized.includes(sNorm);
    });
  }, [name, excludeId, schools]);

  if (matches.length === 0) return null;

  return (
    <div className="rounded-lg border border-warning-border bg-warning-muted p-3 space-y-2">
      <div className="flex items-center gap-2 text-warning-foreground">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <p className="text-sm font-semibold">
          Mogelijke duplica{matches.length === 1 ? "at" : "ten"} gevonden ({matches.length})
        </p>
      </div>
      <div className="space-y-1">
        {matches.map((s) => (
          <div key={s.id} className="flex items-center gap-2 text-sm">
            <span className="font-medium">{s.name}</span>
            {s.address && (
              <span className="text-muted-foreground text-xs">{s.address}</span>
            )}
            {s.neighborhoods?.areas?.name && (
              <Badge variant="outline" className="text-[10px]">{s.neighborhoods.areas.name}</Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
